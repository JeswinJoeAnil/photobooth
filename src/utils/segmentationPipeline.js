import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

/**
 * SegmentationPipeline — Per-participant MediaPipe selfie segmentation manager.
 *
 * - One shared model, per-participant cutout cache & timestamp tracking.
 * - Adaptive throttling based on active participant count.
 * - Graceful degradation when model is still loading.
 */

class SegmentationPipeline {
  constructor() {
    this.segmenter = null;
    this.isReady = false;
    this.initPromise = null;
    this.initFailed = false;
    this.participantCutouts = new Map();
    this.baseIntervalMs = 50;
  }

  getIntervalForCount(count) {
    if (count <= 1) return 50;
    if (count === 2) return 66;
    if (count === 3) return 100;
    return 125;
  }

  async init() {
    if (this.isReady) return;
    if (this.initFailed && this._initRetryCount >= 3) return;
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
        } catch {
          this.segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: { modelAssetPath, delegate: 'CPU' },
            runningMode: 'VIDEO',
            outputConfidenceMasks: true,
            outputCategoryMask: false,
          });
        }
        this.isReady = true;
        this.initFailed = false;
        this._initRetryCount = 0;
      } catch (err) {
        console.error('Failed to initialize MediaPipe ImageSegmenter:', err);
        this.initFailed = true;
        this._initRetryCount = (this._initRetryCount || 0) + 1;
        this.initPromise = null; /* allow retry */

        if (this._initRetryCount < 3) {
          const delayMs = 5000 * this._initRetryCount;
          console.warn(
            `Segmentation init failed (attempt ${this._initRetryCount}/3). Retrying in ${delayMs / 1000}s…`
          );
          setTimeout(() => this.init(), delayMs);
        } else {
          console.error('Segmentation init permanently failed after 3 attempts.');
        }
      }
    })();

    return this.initPromise;
  }

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
        lastTimestampMs: 0,
        hasMask: false,
        status: 'loading',
      });
    }
    return this.participantCutouts.get(peerId);
  }

  getStatus(peerId) {
    const entry = this.participantCutouts.get(peerId);
    if (!entry) return 'idle';
    if (this.initFailed) return 'error';
    if (!this.isReady) return 'loading';
    if (entry.hasMask) return 'ready';
    return entry.status || 'loading';
  }

  processParticipant(peerId, videoElement, mirror = false, forceHD = false, activeCount = 1) {
    if (!videoElement || (videoElement.readyState < 1 && videoElement.videoWidth === 0)) {
      return { cutout: this.participantCutouts.get(peerId)?.cutoutCanvas || null, status: 'loading' };
    }

    const entry = this.getParticipantEntry(peerId);
    const now = performance.now();
    const intervalMs = this.getIntervalForCount(activeCount);

    const vW = videoElement.videoWidth || 640;
    const vH = videoElement.videoHeight || 480;
    if (entry.cutoutCanvas.width !== vW || entry.cutoutCanvas.height !== vH) {
      entry.cutoutCanvas.width = vW;
      entry.cutoutCanvas.height = vH;
    }

    const cutoutCtx = entry.cutoutCanvas.getContext('2d');
    if (!cutoutCtx) return { cutout: null, status: 'error' };

    const shouldSegment =
      forceHD ||
      !entry.hasMask ||
      now - entry.lastSegmentTime >= intervalMs;

    if (shouldSegment && this.isReady && this.segmenter) {
      try {
        entry.lastTimestampMs = Math.max(entry.lastTimestampMs + 1, Math.round(now));
        const result = this.segmenter.segmentForVideo(videoElement, entry.lastTimestampMs);

        if (result?.confidenceMasks?.length > 0) {
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
            entry.status = 'ready';
          }

          for (let i = 0; i < result.confidenceMasks.length; i++) {
            if (result.confidenceMasks[i]?.close) {
              result.confidenceMasks[i].close();
            }
          }
        }
      } catch (err) {
        console.warn(`Segmentation error for ${peerId}:`, err);
        entry.status = 'error';
      }
    } else if (!this.isReady && !this.initFailed) {
      entry.status = 'loading';
    }

    cutoutCtx.save();
    cutoutCtx.clearRect(0, 0, vW, vH);

    if (mirror) {
      cutoutCtx.translate(vW, 0);
      cutoutCtx.scale(-1, 1);
    }

    cutoutCtx.drawImage(videoElement, 0, 0, vW, vH);

    if (entry.hasMask) {
      cutoutCtx.globalCompositeOperation = 'destination-in';
      cutoutCtx.drawImage(entry.maskCanvas, 0, 0, vW, vH);
      cutoutCtx.globalCompositeOperation = 'source-over';
    }

    cutoutCtx.restore();

    return {
      cutout: entry.cutoutCanvas,
      status: entry.hasMask ? 'ready' : entry.status,
    };
  }

  removeParticipant(peerId) {
    this.participantCutouts.delete(peerId);
  }

  destroy() {
    this.participantCutouts.clear();
    if (this.segmenter?.close) {
      try {
        this.segmenter.close();
      } catch {
        /* noop */
      }
      this.segmenter = null;
    }
    this.isReady = false;
  }
}

export const segmentationPipeline = new SegmentationPipeline();
