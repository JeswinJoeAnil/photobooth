/**
 * Studio Segmentation Manager
 * Manages MediaPipe ImageSegmenter instance and coordinates independent
 * per-participant segmentation, mask caching, and cutout processing.
 */

import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import {
  buildSmoothMaskImageData,
  cropPersonCutout,
  extractPersonBoundingBox,
} from './maskProcessor.js';

class SegmentationManager {
  constructor() {
    this.segmenter = null;
    this.isReady = false;
    this.initPromise = null;
    this.initFailed = false;
    this._retryCount = 0;
    this.participantState = new Map();
  }

  getIntervalForCount(count) {
    if (count <= 1) return 50; // 20 FPS
    if (count === 2) return 60; // 16 FPS
    if (count === 3) return 75; // 13 FPS
    return 85; // 12 FPS
  }

  async init() {
    if (this.isReady && this.segmenter) return true;
    if (this.initPromise) return this.initPromise;
    if (this._retryCount >= 3) return false; // Exhausted retries

    this.initPromise = (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
        );

        const modelAssetPath =
          'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

        try {
          this.segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: { modelAssetPath, delegate: 'GPU' },
            runningMode: 'VIDEO',
            outputConfidenceMasks: true,
            outputCategoryMask: false,
          });
        } catch {
          console.warn('MediaPipe GPU delegate unavailable; falling back to CPU');
          this.segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: { modelAssetPath, delegate: 'CPU' },
            runningMode: 'VIDEO',
            outputConfidenceMasks: true,
            outputCategoryMask: false,
          });
        }

        this.isReady = true;
        this.initFailed = false;
        this._retryCount = 0;
        return true;
      } catch (err) {
        console.error('Failed to initialize MediaPipe ImageSegmenter:', err);
        this.initFailed = true;
        this.initPromise = null;

        // Detect permanent failures (CSP blocking WASM, missing APIs) — don't retry
        const msg = String(err?.message || err || '');
        const isPermanent =
          msg.includes('CompileError') ||
          msg.includes('Content Security Policy') ||
          msg.includes('WebAssembly') ||
          (typeof CompileError !== 'undefined' && err instanceof CompileError);

        if (isPermanent) {
          console.error('MediaPipe WASM blocked by CSP or unsupported — retries disabled.');
          this._retryCount = 3; // Prevent further attempts
          return false;
        }

        if (this._retryCount < 3) {
          this._retryCount++;
          console.warn(`MediaPipe init retry ${this._retryCount}/3 in ${this._retryCount * 4}s`);
          await new Promise((r) => setTimeout(r, this._retryCount * 4000));
          return this.init(); // Re-enter with initPromise = null, so a new attempt starts
        }
        return false;
      }
    })();

    return this.initPromise;
  }

  _getParticipantEntry(peerId) {
    if (!this.participantState.has(peerId)) {
      const cutoutCanvas = document.createElement('canvas');
      cutoutCanvas.width = 400;
      cutoutCanvas.height = 500;

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = 256;
      maskCanvas.height = 256;

      this.participantState.set(peerId, {
        cutoutCanvas,
        maskCanvas,
        prevBounds: null,
        smoothedBounds: { normX: 0.15, normY: 0.05, normWidth: 0.70, normHeight: 0.90, detected: false },
        prevMaskData: null,
        lastTimestampMs: 0,
        lastSegmentTime: 0,
        hasMask: false,
        status: 'loading',
      });
    }
    return this.participantState.get(peerId);
  }

  getStatus(peerId) {
    const entry = this.participantState.get(peerId);
    if (!entry) return 'idle';
    if (this.initFailed) return 'error';
    if (!this.isReady) return 'loading';
    if (entry.hasMask) return 'ready';
    return entry.status || 'loading';
  }

  /**
   * Processes a live video frame for a participant.
   * Runs local AI segmentation, extracts smoothed bounding box, and creates a transparent person cutout.
   */
  processParticipant(peerId, videoElement, totalActiveCount = 1) {
    if (!videoElement || (videoElement.readyState < 1 && videoElement.videoWidth === 0)) {
      const fallbackEntry = this.participantState.get(peerId);
      return {
        cutout: fallbackEntry?.cutoutCanvas || null,
        bounds: fallbackEntry?.smoothedBounds || null,
        status: 'loading',
      };
    }

    const entry = this._getParticipantEntry(peerId);
    const now = performance.now();
    const intervalMs = this.getIntervalForCount(totalActiveCount);

    const shouldSegment =
      !entry.hasMask ||
      now - entry.lastSegmentTime >= intervalMs;

    if (shouldSegment && this.isReady && this.segmenter) {
      try {
        // Use performance.now() for MediaPipe VIDEO mode timestamps.
        // Each call must provide a strictly increasing timestamp.
        // Since we throttle per-participant via lastSegmentTime, performance.now()
        // is guaranteed to increase between calls for the same peer.
        // We also guard per-participant to ensure strict monotonicity.
        let timestampMs = Math.round(performance.now());
        if (timestampMs <= entry.lastTimestampMs) {
          timestampMs = entry.lastTimestampMs + 1;
        }
        entry.lastTimestampMs = timestampMs;

        const result = this.segmenter.segmentForVideo(videoElement, timestampMs);

        if (result?.confidenceMasks?.length > 0) {
          const mask = result.confidenceMasks[0];
          const maskW = mask.width || 256;
          const maskH = mask.height || 256;
          const floatData = mask.getAsFloat32Array();

          if (entry.maskCanvas.width !== maskW || entry.maskCanvas.height !== maskH) {
            entry.maskCanvas.width = maskW;
            entry.maskCanvas.height = maskH;
          }

          if (!entry.prevMaskData || entry.prevMaskData.length !== floatData.length) {
            entry.prevMaskData = new Float32Array(floatData);
          }

          const maskCtx = entry.maskCanvas.getContext('2d');
          if (maskCtx) {
            const imgData = buildSmoothMaskImageData(
              floatData,
              maskW,
              maskH,
              entry.prevMaskData
            );
            maskCtx.putImageData(imgData, 0, 0);

            // Extract stabilized bounding box of the visible person
            entry.smoothedBounds = extractPersonBoundingBox(
              floatData,
              maskW,
              maskH,
              entry.prevBounds
            );
            entry.prevBounds = entry.smoothedBounds;

            entry.hasMask = true;
            entry.lastSegmentTime = now;
            entry.status = 'ready';
          }

          for (let i = 0; i < result.confidenceMasks.length; i++) {
            if (result.confidenceMasks[i]?.close) {
              result.confidenceMasks[i].close();
            }
          }
        }
      } catch (err) {
        console.warn(`Segmentation warning for ${peerId}:`, err);
      }
    }

    const cutout = cropPersonCutout(
      videoElement,
      entry.maskCanvas,
      entry.smoothedBounds,
      entry.cutoutCanvas
    );

    return {
      cutout: cutout || entry.cutoutCanvas,
      bounds: entry.smoothedBounds,
      status: entry.hasMask ? 'ready' : entry.status,
    };
  }

  /**
   * Synchronous capture pass using the latest high-quality mask.
   */
  processHighQuality(peerId, videoElement) {
    return this.processParticipant(peerId, videoElement, 1);
  }

  removeParticipant(peerId) {
    const entry = this.participantState.get(peerId);
    if (entry) {
      // Free GPU-backed canvases before dropping reference
      try { entry.cutoutCanvas.width = 0; entry.cutoutCanvas.height = 0; } catch {}
      try { entry.maskCanvas.width = 0; entry.maskCanvas.height = 0; } catch {}
    }
    this.participantState.delete(peerId);
  }

  destroy() {
    this.participantState.forEach((entry) => {
      try { entry.cutoutCanvas.width = 0; entry.cutoutCanvas.height = 0; } catch {}
      try { entry.maskCanvas.width = 0; entry.maskCanvas.height = 0; } catch {}
    });
    this.participantState.clear();
    if (this.segmenter?.close) {
      try { this.segmenter.close(); } catch {}
      this.segmenter = null;
    }
    this.isReady = false;
    this.initPromise = null;
    this.initFailed = false;
  }
}

export const segmentationManager = new SegmentationManager();
