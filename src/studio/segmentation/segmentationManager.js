/**
 * Studio Segmentation Manager
 * Manages MediaPipe ImageSegmenter instance and coordinates independent
 * per-participant segmentation, mask caching, and cutout processing.
 */

import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import {
  applyAlphaMaskToVideo,
  buildSmoothMaskImageData,
} from './maskProcessor.js';

class SegmentationManager {
  constructor() {
    this.segmenter = null;
    this.isReady = false;
    this.initPromise = null;
    this.initFailed = false;
    this._retryCount = 0;
    this.participantState = new Map();
    this.globalTimestamp = 1;
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

        if (this._retryCount < 3) {
          this._retryCount++;
          const delay = this._retryCount * 4000;
          setTimeout(() => this.init(), delay);
        }
        return false;
      }
    })();

    return this.initPromise;
  }

  _getParticipantEntry(peerId) {
    if (!this.participantState.has(peerId)) {
      const cutoutCanvas = document.createElement('canvas');
      cutoutCanvas.width = 640;
      cutoutCanvas.height = 480;

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = 256;
      maskCanvas.height = 256;

      this.participantState.set(peerId, {
        cutoutCanvas,
        maskCanvas,
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
   * Runs local AI segmentation, smooths masks, and produces a transparent cutout
   * showing exactly what the camera sees without dynamic resize jitter.
   */
  processParticipant(peerId, videoElement, totalActiveCount = 1) {
    if (!videoElement || (videoElement.readyState < 1 && videoElement.videoWidth === 0)) {
      const fallbackEntry = this.participantState.get(peerId);
      return {
        cutout: fallbackEntry?.cutoutCanvas || null,
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
        this.globalTimestamp += 1;
        const result = this.segmenter.segmentForVideo(videoElement, this.globalTimestamp);

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

    const cutout = applyAlphaMaskToVideo(
      videoElement,
      entry.maskCanvas,
      entry.cutoutCanvas
    );

    return {
      cutout: cutout || entry.cutoutCanvas,
      status: entry.hasMask ? 'ready' : entry.status,
    };
  }

  /**
   * Runs a high-quality segmentation pass for snapshot capture.
   */
  async processHighQuality(peerId, videoElement) {
    if (!videoElement || videoElement.readyState < 1) {
      return this.processParticipant(peerId, videoElement, 1);
    }

    const entry = this._getParticipantEntry(peerId);

    if (this.isReady && this.segmenter) {
      try {
        this.globalTimestamp += 1;
        const result = this.segmenter.segmentForVideo(videoElement, this.globalTimestamp);

        if (result?.confidenceMasks?.length > 0) {
          const mask = result.confidenceMasks[0];
          const maskW = mask.width || 256;
          const maskH = mask.height || 256;
          const floatData = mask.getAsFloat32Array();

          if (entry.maskCanvas.width !== maskW || entry.maskCanvas.height !== maskH) {
            entry.maskCanvas.width = maskW;
            entry.maskCanvas.height = maskH;
          }

          const maskCtx = entry.maskCanvas.getContext('2d');
          if (maskCtx) {
            const imgData = buildSmoothMaskImageData(floatData, maskW, maskH, null);
            maskCtx.putImageData(imgData, 0, 0);
            entry.hasMask = true;
          }

          for (let i = 0; i < result.confidenceMasks.length; i++) {
            if (result.confidenceMasks[i]?.close) {
              result.confidenceMasks[i].close();
            }
          }
        }
      } catch (err) {
        console.warn(`HQ Segmentation error for ${peerId}:`, err);
      }
    }

    const cutout = applyAlphaMaskToVideo(
      videoElement,
      entry.maskCanvas,
      entry.cutoutCanvas
    );

    return {
      cutout: cutout || entry.cutoutCanvas,
      status: entry.hasMask ? 'ready' : entry.status,
    };
  }

  removeParticipant(peerId) {
    this.participantState.delete(peerId);
  }

  destroy() {
    this.participantState.clear();
    if (this.segmenter?.close) {
      try { this.segmenter.close(); } catch {}
      this.segmenter = null;
    }
    this.isReady = false;
  }
}

export const segmentationManager = new SegmentationManager();
