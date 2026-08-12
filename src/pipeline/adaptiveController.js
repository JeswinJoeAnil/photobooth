export const INFERENCE_RESOLUTIONS = [
  { width: 320, height: 180, label: '320×180 (Ultra)' },
  { width: 256, height: 144, label: '256×144 (High)' },
  { width: 192, height: 108, label: '192×108 (Medium)' },
  { width: 160, height: 90, label: '160×90 (Low)' },
];

export class AdaptiveQualityController {
  constructor(initialResIndex = 1) {
    this.currentResIndex = initialResIndex; // Default: 256x144 (High)
    this.fpsBuffer = [];
    this.lastFpsCalcTime = performance.now();
    this.lowFpsDurationMs = 0;
    this.highFpsDurationMs = 0;
    this.frameCount = 0;

    // Latencies
    this.lastInferenceMs = 0;
    this.lastTemporalMs = 0;
    this.lastCompositeMs = 0;
    this.isGpu = true;
    this.currentFps = 30;
  }

  getCurrentResolution() {
    return INFERENCE_RESOLUTIONS[this.currentResIndex];
  }

  setResolutionIndex(index) {
    if (index >= 0 && index < INFERENCE_RESOLUTIONS.length) {
      this.currentResIndex = index;
    }
  }

  setGpuDelegate(isGpu) {
    this.isGpu = isGpu;
  }

  recordInferenceTime(ms) {
    this.lastInferenceMs = ms;
  }

  recordTemporalTime(ms) {
    this.lastTemporalMs = ms;
  }

  recordCompositeTime(ms) {
    this.lastCompositeMs = ms;
  }

  tickFrame(autoQualityEnabled) {
    const now = performance.now();
    this.frameCount++;
    const delta = now - this.lastFpsCalcTime;

    let steppedRes = false;

    if (delta >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / delta);
      this.fpsBuffer.push(this.currentFps);
      if (this.fpsBuffer.length > 5) this.fpsBuffer.shift();

      this.frameCount = 0;
      this.lastFpsCalcTime = now;

      if (autoQualityEnabled) {
        if (this.currentFps < 24) {
          this.lowFpsDurationMs += delta;
          this.highFpsDurationMs = 0;

          if (this.lowFpsDurationMs >= 1000 && this.currentResIndex < INFERENCE_RESOLUTIONS.length - 1) {
            this.currentResIndex++;
            steppedRes = true;
            this.lowFpsDurationMs = 0;
          }
        } else if (this.currentFps >= 29) {
          this.highFpsDurationMs += delta;
          this.lowFpsDurationMs = 0;

          if (this.highFpsDurationMs >= 4000 && this.currentResIndex > 0) {
            this.currentResIndex--;
            steppedRes = true;
            this.highFpsDurationMs = 0;
          }
        } else {
          this.lowFpsDurationMs = 0;
          this.highFpsDurationMs = 0;
        }
      }
    }

    return {
      steppedRes,
      newRes: INFERENCE_RESOLUTIONS[this.currentResIndex]
    };
  }

  getStats() {
    const res = INFERENCE_RESOLUTIONS[this.currentResIndex];
    let level = 'High (256x144)';
    if (this.currentResIndex === 0) level = 'Ultra (320x180)';
    else if (this.currentResIndex === 1) level = 'High (256x144)';
    else if (this.currentResIndex === 2) level = 'Medium (192x108)';
    else level = 'Low (160x90)';

    return {
      fps: this.currentFps,
      inferenceMs: Math.round(this.lastInferenceMs * 10) / 10,
      temporalFilterMs: Math.round(this.lastTemporalMs * 10) / 10,
      compositeMs: Math.round(this.lastCompositeMs * 10) / 10,
      totalFrameMs: Math.round((this.lastInferenceMs + this.lastTemporalMs + this.lastCompositeMs) * 10) / 10,
      currentInferenceRes: `${res.width}x${res.height}`,
      isGpuAccelerated: this.isGpu,
      droppedFrames: 0,
      adaptiveLevel: level
    };
  }
}
