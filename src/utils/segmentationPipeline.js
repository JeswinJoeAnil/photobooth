import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

/**
 * SegmentationPipeline — Per-participant MediaPipe selfie segmentation manager.
 *
 * Provides:
 * - Lazy initialization of MediaPipe ImageSegmenter (GPU/CPU fallback).
 * - Per-participant transparent person cutout generation using 2D canvas `destination-in` alpha blend.
 * - Frame throttling & mask caching for smooth multi-user live preview.
 * - High-precision HD segmentation pass for final snapshot capture.
 */

class SegmentationPipeline {
  constructor() {
    this.segmenter = null;
    this.isReady = false;
    this.initPromise = null;
    this.participantCutouts = new Map(); /* peerId -> { cutoutCanvas, maskCanvas, lastSegmentTime } */
    this.segmentIntervalMs = 50; /* ~20 Hz segmentation updates per participant */
  }

  async init() {
    if (this.isReady) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
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
        } catch (gpuErr) {
          console.warn('MediaPipe GPU delegate failed, falling back to CPU:', gpuErr);
          this.segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: { modelAssetPath, delegate: 'CPU' },
            runningMode: 'VIDEO',
            outputConfidenceMasks: true,
            outputCategoryMask: false,
          });
        }
        this.isReady = true;
      } catch (err) {
        console.error('Failed to initialize MediaPipe ImageSegmenter:', err);
      }
    })();

    return this.initPromise;
  }

  /**
   * Returns or initializes the cutout cache entry for a participant.
   */
  getParticipantEntry(peerId) {
    if (!this.participantCutouts.has(peerId)) {
      const cutoutCanvas = document.createElement('canvas');
      cutoutCanvas.width = 640;
      cutoutCanvas.height = 480;

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = 256;
      maskCanvas.height = 144;

      this.participantCutouts.set(peerId, {
        cutoutCanvas,
        maskCanvas,
        lastSegmentTime: 0,
        hasMask: false,
      });
    }
    return this.participantCutouts.get(peerId);
  }

  /**
   * Process a participant video frame into a transparent person cutout.
   * Uses cached cutout canvas if interval has not elapsed (live preview throttling).
   */
  processParticipant(peerId, videoElement, mirror = false, forceHD = false) {
    if (!videoElement || (videoElement.readyState < 1 && videoElement.videoWidth === 0)) {
      return this.participantCutouts.get(peerId)?.cutoutCanvas || null;
    }

    const entry = this.getParticipantEntry(peerId);
    const now = performance.now();

    /* Match cutout canvas dimensions to video */
    const vW = videoElement.videoWidth || 640;
    const vH = videoElement.videoHeight || 480;
    if (entry.cutoutCanvas.width !== vW || entry.cutoutCanvas.height !== vH) {
      entry.cutoutCanvas.width = vW;
      entry.cutoutCanvas.height = vH;
    }

    const cutoutCtx = entry.cutoutCanvas.getContext('2d');
    if (!cutoutCtx) return null;

    /* Check if we should run a fresh segmentation inference pass */
    const shouldSegment =
      forceHD ||
      !entry.hasMask ||
      now - entry.lastSegmentTime >= this.segmentIntervalMs;

    if (shouldSegment && this.isReady && this.segmenter) {
      try {
        const timestampMs = Math.round(now);
        const result = this.segmenter.segmentForVideo(videoElement, timestampMs);

        if (result && result.confidenceMasks && result.confidenceMasks.length > 0) {
          const maskIndex = result.confidenceMasks.length > 1 ? 1 : 0;
          const maskImage = result.confidenceMasks[maskIndex];
          const mW = maskImage.width;
          const mH = maskImage.height;
          const floatData = maskImage.getAsFloat32Array();

          if (entry.maskCanvas.width !== mW || entry.maskCanvas.height !== mH) {
            entry.maskCanvas.width = mW;
            entry.maskCanvas.height = mH;
          }

          const maskCtx = entry.maskCanvas.getContext('2d');
          if (maskCtx) {
            const imgData = maskCtx.createImageData(mW, mH);
            const pixels = imgData.data;
            for (let i = 0; i < floatData.length; i++) {
              const val = Math.min(255, Math.max(0, Math.round(floatData[i] * 255)));
              const pIdx = i * 4;
              pixels[pIdx] = 255;
              pixels[pIdx + 1] = 255;
              pixels[pIdx + 2] = 255;
              pixels[pIdx + 3] = val;
            }
            maskCtx.putImageData(imgData, 0, 0);
            entry.hasMask = true;
            entry.lastSegmentTime = now;
          }

          for (let i = 0; i < result.confidenceMasks.length; i++) {
            if (result.confidenceMasks[i] && typeof result.confidenceMasks[i].close === 'function') {
              result.confidenceMasks[i].close();
            }
          }
        }
      } catch (err) {
        console.warn(`Segmentation error for participant ${peerId}:`, err);
      }
    }

    /* Render video frame + alpha mask into cutoutCanvas */
    cutoutCtx.save();
    cutoutCtx.clearRect(0, 0, vW, vH);

    if (mirror) {
      cutoutCtx.translate(vW, 0);
      cutoutCtx.scale(-1, 1);
    }

    /* Draw original camera video frame */
    cutoutCtx.drawImage(videoElement, 0, 0, vW, vH);

    /* If confidence mask is ready, apply alpha cut out */
    if (entry.hasMask) {
      cutoutCtx.globalCompositeOperation = 'destination-in';
      cutoutCtx.drawImage(entry.maskCanvas, 0, 0, vW, vH);
      cutoutCtx.globalCompositeOperation = 'source-over';
    }

    cutoutCtx.restore();

    return entry.cutoutCanvas;
  }

  /**
   * Clean up participant cutout entry when a peer leaves.
   */
  removeParticipant(peerId) {
    this.participantCutouts.delete(peerId);
  }

  destroy() {
    this.participantCutouts.clear();
    if (this.segmenter && typeof this.segmenter.close === 'function') {
      try { this.segmenter.close(); } catch {}
      this.segmenter = null;
    }
    this.isReady = false;
  }
}

export const segmentationPipeline = new SegmentationPipeline();
