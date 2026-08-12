import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import {
  VERTEX_SHADER_SOURCE,
  BLUR_H_FRAG_SOURCE,
  BLUR_V_FRAG_SOURCE,
  COMPOSITOR_FRAG_SOURCE,
  MASK_COPY_FRAG_SOURCE
} from './shaders.js';
import { AdaptiveQualityController, INFERENCE_RESOLUTIONS } from './adaptiveController.js';

export class WebGLEngine {
  constructor(canvas, initialSettings = {}, callbacks = {}) {
    this.canvas = canvas;
    this.settings = {
      mode: 'image', // 'image' | 'color' | 'blur' | 'transparent'
      customImageUrl: '',
      solidColor: '#ff5aaf',
      blurRadius: 12,
      edgeFeather: 0.08,
      colorDecontamination: 0.6,
      temporalAlpha: 0.18,
      autoQuality: true,
      targetInferenceRes: INFERENCE_RESOLUTIONS[1],
      mirrorVideo: true,
      showDevOverlay: false,
      fpsLimit: 30,
      ...initialSettings
    };

    this.onStatsUpdate = callbacks.onStatsUpdate;
    this.onError = callbacks.onError;

    this.video = null;
    this.imageSegmenter = null;
    this.isSegmenterReady = false;
    this.isSegmenting = false;
    this.maskByteBuffer = null;

    this.state = 'idle';
    this.adaptiveController = new AdaptiveQualityController(1);

    // Frame dimensions
    this.frameWidth = 1280;
    this.frameHeight = 720;
    this.maskWidth = 256;
    this.maskHeight = 144;

    this.animFrameId = null;
    this.bgLoadedUrl = null;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      desynchronized: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });

    if (!gl) {
      throw new Error('WebGL2 is not supported by your browser. Background separation requires WebGL2.');
    }
    this.gl = gl;

    this.initGL();
    this.initSegmenter();

    if (this.settings.mode === 'image' && this.settings.customImageUrl) {
      this.loadCustomImageBackground(this.settings.customImageUrl);
    } else if (this.settings.mode === 'color') {
      this.loadSolidColorBackground(this.settings.solidColor);
    }
  }

  createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create WebGL shader');

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compilation error: ${log}`);
    }
    return shader;
  }

  createProgram(vsSource, fsSource) {
    const gl = this.gl;
    const vs = this.createShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.createShader(gl.FRAGMENT_SHADER, fsSource);

    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create WebGL program');

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      throw new Error(`Program link error: ${log}`);
    }
    return program;
  }

  initGL() {
    const gl = this.gl;

    this.compositorProgram = this.createProgram(VERTEX_SHADER_SOURCE, COMPOSITOR_FRAG_SOURCE);
    this.blurHProgram = this.createProgram(VERTEX_SHADER_SOURCE, BLUR_H_FRAG_SOURCE);
    this.blurVProgram = this.createProgram(VERTEX_SHADER_SOURCE, BLUR_V_FRAG_SOURCE);
    this.maskCopyProgram = this.createProgram(VERTEX_SHADER_SOURCE, MASK_COPY_FRAG_SOURCE);

    const positions = new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
       1,  1, 1, 0
    ]);

    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);

    this.texFrame = this.createEmptyTexture(gl.RGBA, 1280, 720);
    this.texMask = this.createEmptyTexture(gl.RED, 256, 144, gl.R8);
    this.texPrevMask = this.createEmptyTexture(gl.RED, 256, 144, gl.R8);
    this.texBg = this.createEmptyTexture(gl.RGBA, 1280, 720);
    this.texBlurH = this.createEmptyTexture(gl.RGBA, 1280, 720);
    this.texBlurV = this.createEmptyTexture(gl.RGBA, 1280, 720);

    const initialMaskBytes = new Uint8Array(256 * 144).fill(255);
    gl.bindTexture(gl.TEXTURE_2D, this.texMask);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 144, gl.RED, gl.UNSIGNED_BYTE, initialMaskBytes);
    gl.bindTexture(gl.TEXTURE_2D, this.texPrevMask);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 144, gl.RED, gl.UNSIGNED_BYTE, initialMaskBytes);

    this.fboPrevMask = this.createFramebuffer(this.texPrevMask);
    this.fboBlurH = this.createFramebuffer(this.texBlurH);
    this.fboBlurV = this.createFramebuffer(this.texBlurV);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboPrevMask);
    gl.viewport(0, 0, 256, 144);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.loadSolidColorBackground(this.settings.solidColor || '#ff5aaf');
  }

  createEmptyTexture(format, width, height, internalFormat) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);

    const intFmt = internalFormat || format;
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      intFmt,
      width,
      height,
      0,
      format,
      gl.UNSIGNED_BYTE,
      null
    );

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return tex;
  }

  createFramebuffer(texture) {
    const gl = this.gl;
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  }

  async initSegmenter() {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
      );

      const modelAssetPath = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

      try {
        this.imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
        this.adaptiveController.setGpuDelegate(true);
      } catch (gpuErr) {
        console.warn('GPU delegate failed, falling back to CPU:', gpuErr);
        this.imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
        this.adaptiveController.setGpuDelegate(false);
      }

      this.isSegmenterReady = true;
    } catch (err) {
      console.error('Failed to initialize MediaPipe ImageSegmenter:', err);
      if (this.onError) {
        this.onError(`Segmenter Init Error: ${String(err)}`);
      }
    }
  }

  updateMaskTexture(bytes, width, height) {
    const gl = this.gl;

    if (this.maskWidth !== width || this.maskHeight !== height) {
      this.maskWidth = width;
      this.maskHeight = height;

      gl.bindTexture(gl.TEXTURE_2D, this.texMask);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R8,
        width,
        height,
        0,
        gl.RED,
        gl.UNSIGNED_BYTE,
        bytes
      );

      gl.bindTexture(gl.TEXTURE_2D, this.texPrevMask);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R8,
        width,
        height,
        0,
        gl.RED,
        gl.UNSIGNED_BYTE,
        null
      );
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.texMask);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        width,
        height,
        gl.RED,
        gl.UNSIGNED_BYTE,
        bytes
      );
    }
  }

  setVideoSource(videoElement) {
    this.video = videoElement;
    this.frameWidth = videoElement.videoWidth || videoElement.width || 1280;
    this.frameHeight = videoElement.videoHeight || videoElement.height || 720;

    this.canvas.width = this.frameWidth;
    this.canvas.height = this.frameHeight;

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texFrame);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.frameWidth, this.frameHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    gl.bindTexture(gl.TEXTURE_2D, this.texBlurH);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.frameWidth, this.frameHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    gl.bindTexture(gl.TEXTURE_2D, this.texBlurV);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.frameWidth, this.frameHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };

    if (this.settings.mode === 'image' && this.settings.customImageUrl) {
      this.loadCustomImageBackground(this.settings.customImageUrl);
    } else if (this.settings.mode === 'color') {
      if (typeof this.settings.solidColor === 'object' && this.settings.solidColor !== null && !Array.isArray(this.settings.solidColor)) {
        this.loadStudioBackground(this.settings.solidColor);
      } else {
        this.loadSolidColorBackground(this.settings.solidColor);
      }
    }
  }

  loadStudioBackground(bg) {
    const gl = this.gl;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx && bg) {
      const w = 512;
      const h = 512;

      if (bg.gradient && bg.gradient.length > 0) {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        bg.gradient.forEach((color, i) => {
          grad.addColorStop(i / (bg.gradient.length - 1), color);
        });
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = bg.solidColor || '#2d1b4e';
        ctx.fillRect(0, 0, w, h);
      }

      if (bg.ambientGlow) {
        bg.ambientGlow.forEach((glow) => {
          const gx = glow.x * w;
          const gy = glow.y * h;
          const gRad = ctx.createRadialGradient(gx, gy, 0, gx, gy, (glow.radius / 800) * w);
          gRad.addColorStop(0, glow.color);
          gRad.addColorStop(1, 'transparent');
          ctx.fillStyle = gRad;
          ctx.fillRect(0, 0, w, h);
        });
      }

      if (bg.floorColor) {
        const floorGrad = ctx.createLinearGradient(0, h * 0.7, 0, h);
        floorGrad.addColorStop(0, 'transparent');
        floorGrad.addColorStop(1, bg.floorColor);
        ctx.fillStyle = floorGrad;
        ctx.fillRect(0, 0, w, h);
      }

      gl.bindTexture(gl.TEXTURE_2D, this.texBg);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    }
  }

  loadSolidColorBackground(colorInput) {
    const gl = this.gl;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (Array.isArray(colorInput) && colorInput.length > 0) {
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        colorInput.forEach((col, i) => {
          grad.addColorStop(i / (colorInput.length - 1), col);
        });
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = colorInput || '#2d1b4e';
      }
      ctx.fillRect(0, 0, 256, 256);

      gl.bindTexture(gl.TEXTURE_2D, this.texBg);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    }
  }

  loadCustomImageBackground(url) {
    if (!url) return;
    this.bgLoadedUrl = url;

    const img = new Image();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.texBg);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    };

    img.onerror = () => {
      console.warn('Custom background image failed to load, falling back to solid color');
      this.loadSolidColorBackground(this.settings.solidColor || '#ff5aaf');
    };

    img.src = url;
  }

  start() {
    if (this.state === 'running') return;
    this.state = 'running';
    this.renderLoop();
  }

  stop() {
    this.state = 'idle';
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  renderLoop = () => {
    if (this.state !== 'running') return;

    const { steppedRes, newRes } = this.adaptiveController.tickFrame(this.settings.autoQuality);
    if (steppedRes) {
      this.settings.targetInferenceRes = newRes;
    }

    const isVideoReady = this.video && (this.video.readyState === undefined || this.video.readyState >= 2);
    if (isVideoReady) {
      const gl = this.gl;
      const vW = this.video.videoWidth || this.video.width || 1280;
      const vH = this.video.videoHeight || this.video.height || 720;

      if (vW > 0 && vH > 0 && (this.frameWidth !== vW || this.frameHeight !== vH)) {
        this.frameWidth = vW;
        this.frameHeight = vH;
        this.canvas.width = vW;
        this.canvas.height = vH;

        gl.bindTexture(gl.TEXTURE_2D, this.texFrame);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, vW, vH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        gl.bindTexture(gl.TEXTURE_2D, this.texBlurH);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, vW, vH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        gl.bindTexture(gl.TEXTURE_2D, this.texBlurV);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, vW, vH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }

      gl.bindTexture(gl.TEXTURE_2D, this.texFrame);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        vW,
        vH,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.video
      );

      if (this.imageSegmenter && this.isSegmenterReady && !this.isSegmenting) {
        this.isSegmenting = true;
        const startTime = performance.now();
        const timestampMs = Math.round(startTime);

        try {
          const result = this.imageSegmenter.segmentForVideo(this.video, timestampMs);
          const inferenceTime = performance.now() - startTime;
          this.adaptiveController.recordInferenceTime(inferenceTime);

          if (result && result.confidenceMasks && result.confidenceMasks.length > 0) {
            const maskIndex = result.confidenceMasks.length > 1 ? 1 : 0;
            const maskImage = result.confidenceMasks[maskIndex];
            const mWidth = maskImage.width;
            const mHeight = maskImage.height;
            const floatData = maskImage.getAsFloat32Array();

            if (!this.maskByteBuffer || this.maskByteBuffer.length !== floatData.length) {
              this.maskByteBuffer = new Uint8Array(floatData.length);
            }

            for (let i = 0; i < floatData.length; i++) {
              this.maskByteBuffer[i] = Math.min(255, Math.max(0, Math.round(floatData[i] * 255.0)));
            }

            this.updateMaskTexture(this.maskByteBuffer, mWidth, mHeight);

            for (let i = 0; i < result.confidenceMasks.length; i++) {
              if (result.confidenceMasks[i] && typeof result.confidenceMasks[i].close === 'function') {
                result.confidenceMasks[i].close();
              }
            }
          }
        } catch (err) {
          console.error('Segmentation error:', err);
        } finally {
          this.isSegmenting = false;
        }
      }

      if (this.settings.mode === 'blur' && this.settings.blurRadius > 0.5) {
        this.renderBlurPasses();
      }

      const compStart = performance.now();
      this.renderCompositorPass();
      const compEnd = performance.now();
      this.adaptiveController.recordCompositeTime(compEnd - compStart);

      const tempStart = performance.now();
      this.renderMaskCopyPass();
      const tempEnd = performance.now();
      this.adaptiveController.recordTemporalTime(tempEnd - tempStart);
    }

    if (this.onStatsUpdate) {
      this.onStatsUpdate(this.adaptiveController.getStats());
    }

    this.animFrameId = requestAnimationFrame(this.renderLoop);
  };

  renderBlurPasses() {
    const gl = this.gl;
    const radius = this.settings.blurRadius;
    const dx = 1.0 / this.frameWidth;
    const dy = 1.0 / this.frameHeight;

    gl.bindVertexArray(this.quadVao);

    // Pass 1: Horizontal Blur (texFrame -> fboBlurH)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBlurH);
    gl.viewport(0, 0, this.frameWidth, this.frameHeight);
    gl.useProgram(this.blurHProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texFrame);
    gl.uniform1i(gl.getUniformLocation(this.blurHProgram, 'u_image'), 0);
    gl.uniform1f(gl.getUniformLocation(this.blurHProgram, 'u_blurRadius'), radius);
    gl.uniform2f(gl.getUniformLocation(this.blurHProgram, 'u_texelSize'), dx, dy);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Pass 2: Vertical Blur (texBlurH -> fboBlurV)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBlurV);
    gl.viewport(0, 0, this.frameWidth, this.frameHeight);
    gl.useProgram(this.blurVProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texBlurH);
    gl.uniform1i(gl.getUniformLocation(this.blurVProgram, 'u_image'), 0);
    gl.uniform1f(gl.getUniformLocation(this.blurVProgram, 'u_blurRadius'), radius);
    gl.uniform2f(gl.getUniformLocation(this.blurVProgram, 'u_texelSize'), dx, dy);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  renderCompositorPass() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.frameWidth, this.frameHeight);

    gl.useProgram(this.compositorProgram);
    gl.bindVertexArray(this.quadVao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texFrame);
    gl.uniform1i(gl.getUniformLocation(this.compositorProgram, 'u_frame'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texMask);
    gl.uniform1i(gl.getUniformLocation(this.compositorProgram, 'u_mask'), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.texPrevMask);
    gl.uniform1i(gl.getUniformLocation(this.compositorProgram, 'u_prevMask'), 2);

    gl.activeTexture(gl.TEXTURE3);
    const bgTex = this.settings.mode === 'blur' ? this.texBlurV : this.texBg;
    gl.bindTexture(gl.TEXTURE_2D, bgTex);
    gl.uniform1i(gl.getUniformLocation(this.compositorProgram, 'u_background'), 3);

    let modeCode = 0; // Image / Studio Scene (samples from u_background texture with v_texCoord)
    if (this.settings.mode === 'transparent') modeCode = 2;
    if (this.settings.mode === 'blur') modeCode = 3;

    gl.uniform1i(gl.getUniformLocation(this.compositorProgram, 'u_bgMode'), modeCode);

    let hexStr = '#ff5aaf';
    const sc = this.settings.solidColor;
    if (typeof sc === 'string') {
      hexStr = sc;
    } else if (sc && typeof sc === 'object') {
      if (sc.accent) hexStr = sc.accent;
      else if (Array.isArray(sc.gradient) && sc.gradient[0]) hexStr = sc.gradient[0];
      else if (Array.isArray(sc) && sc[0]) hexStr = sc[0];
    }
    const cleanHex = hexStr.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16) / 255 || 0.2;
    const g = parseInt(cleanHex.substring(2, 4), 16) / 255 || 0.5;
    const b = parseInt(cleanHex.substring(4, 6), 16) / 255 || 0.9;
    gl.uniform4f(gl.getUniformLocation(this.compositorProgram, 'u_solidColor'), r, g, b, 1.0);

    gl.uniform1f(gl.getUniformLocation(this.compositorProgram, 'u_temporalAlpha'), this.settings.temporalAlpha);
    gl.uniform1f(gl.getUniformLocation(this.compositorProgram, 'u_edgeFeather'), this.settings.edgeFeather);
    gl.uniform1f(gl.getUniformLocation(this.compositorProgram, 'u_decontamAmount'), this.settings.colorDecontamination);

    gl.uniform2f(gl.getUniformLocation(this.compositorProgram, 'u_texelSize'), 1.0 / this.frameWidth, 1.0 / this.frameHeight);
    gl.uniform2f(gl.getUniformLocation(this.compositorProgram, 'u_maskTexelSize'), 1.0 / this.maskWidth, 1.0 / this.maskHeight);
    gl.uniform1f(gl.getUniformLocation(this.compositorProgram, 'u_mirror'), this.settings.mirrorVideo ? 1.0 : 0.0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  renderMaskCopyPass() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboPrevMask);
    gl.viewport(0, 0, this.maskWidth, this.maskHeight);

    gl.useProgram(this.maskCopyProgram);
    gl.bindVertexArray(this.quadVao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texMask);
    gl.uniform1i(gl.getUniformLocation(this.maskCopyProgram, 'u_maskTex'), 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  destroy() {
    this.stop();
    if (this.imageSegmenter && typeof this.imageSegmenter.close === 'function') {
      try {
        this.imageSegmenter.close();
      } catch (e) {
        console.warn('Error closing ImageSegmenter:', e);
      }
      this.imageSegmenter = null;
    }
  }
}
