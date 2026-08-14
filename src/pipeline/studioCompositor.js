import { drawStudioBackground } from '../constants/studioAssets.js';
import { segmentationPipeline } from '../utils/segmentationPipeline.js';
import { getDefaultTransform } from '../utils/studioRoomState.js';

export const COMPOSITE_WIDTH = 1280;
export const COMPOSITE_HEIGHT = 720;

/**
 * StudioCompositor — Shared virtual studio scene renderer.
 *
 * Accepts canonical participant descriptors (sorted by join order).
 * Does not know about WebRTC — only cutout + transform + visual state.
 */
export class StudioCompositor {
  constructor(targetCanvas) {
    this.canvas = targetCanvas;
    if (this.canvas) {
      this.canvas.width = COMPOSITE_WIDTH;
      this.canvas.height = COMPOSITE_HEIGHT;
    }
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = COMPOSITE_WIDTH;
    this.offscreenCanvas.height = COMPOSITE_HEIGHT;
  }

  setCanvas(canvas) {
    this.canvas = canvas;
    if (this.canvas) {
      this.canvas.width = COMPOSITE_WIDTH;
      this.canvas.height = COMPOSITE_HEIGHT;
    }
  }

  drawContactShadow(ctx, cx, feetY, shadowWidth, shadowHeight) {
    ctx.save();
    ctx.translate(cx, feetY);
    ctx.scale(1, shadowHeight / shadowWidth);

    const radGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowWidth / 2);
    radGrad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
    radGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.20)');
    radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(0, 0, shadowWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawLoadingSilhouette(ctx, drawX, drawY, width, height) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.ellipse(drawX + width / 2, drawY + height * 0.22, width * 0.14, width * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(drawX + width * 0.35, drawY + height * 0.28, width * 0.3, height * 0.55);
    ctx.restore();
  }

  isVideoValid(vid) {
    if (!vid) return false;
    if (vid.paused) vid.play().catch(() => { });
    return vid.readyState >= 1 || vid.videoWidth > 0;
  }

  /**
   * @param {Array} sceneParticipants — sorted by joinedAt:
   *   { peerId, video, mirror, transform, mediaState, connectionState, name }
   */
  buildLayers(sceneParticipants, activeCount, forceHD = false) {
    const totalCount = Math.min(4, Math.max(1, activeCount));
    const layers = [];

    sceneParticipants.slice(0, 4).forEach((part, joinIndex) => {
      const transform =
        part.transform ?? getDefaultTransform(joinIndex, totalCount);

      const baseW = COMPOSITE_WIDTH * (totalCount === 1 ? 0.52 : 0.40) * transform.scale;
      const baseH = COMPOSITE_HEIGHT * (totalCount === 1 ? 0.90 : 0.76) * transform.scale;
      const cx = transform.x * COMPOSITE_WIDTH;
      const feetY = transform.y * COMPOSITE_HEIGHT + baseH / 2;
      const drawX = cx - baseW / 2;
      const drawY = feetY - baseH;

      const layerBase = {
        peerId: part.peerId,
        name: part.name,
        cx,
        feetY,
        drawX,
        drawY,
        width: baseW,
        height: baseH,
        zIndex: transform.zIndex ?? joinIndex + 1,
        mediaState: part.mediaState,
        segStatus: 'loading',
        cutout: null,
      };

      if (!this.isVideoValid(part.video)) {
        layers.push(layerBase);
        return;
      }

      const { cutout, status } = segmentationPipeline.processParticipant(
        part.peerId,
        part.video,
        !!part.mirror,
        forceHD,
        totalCount
      );

      layers.push({
        ...layerBase,
        cutout,
        segStatus: status,
      });
    });

    return layers.sort((a, b) => a.zIndex - b.zIndex);
  }

  renderFrame({ background, sceneParticipants }) {
    if (!this.canvas) return;
    const ctx = this.offscreenCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, COMPOSITE_WIDTH, COMPOSITE_HEIGHT);
    drawStudioBackground(ctx, background, COMPOSITE_WIDTH, COMPOSITE_HEIGHT);

    const activeCount = sceneParticipants.length;
    const layers = this.buildLayers(sceneParticipants, activeCount, false);

    layers.forEach((layer) => {
      const shadowW = layer.width * 0.72;
      const shadowH = shadowW * 0.28;
      this.drawContactShadow(ctx, layer.cx, layer.feetY - shadowH * 0.3, shadowW, shadowH);
    });

    layers.forEach((layer) => {
      if (layer.cutout && layer.segStatus === 'ready') {
        ctx.drawImage(layer.cutout, layer.drawX, layer.drawY, layer.width, layer.height);
      } else if (layer.cutout) {
        ctx.globalAlpha = layer.segStatus === 'loading' ? 0.55 : 0.75;
        ctx.drawImage(layer.cutout, layer.drawX, layer.drawY, layer.width, layer.height);
        ctx.globalAlpha = 1;
      } else {
        this.drawLoadingSilhouette(ctx, layer.drawX, layer.drawY, layer.width, layer.height);
      }
    });

    const displayCtx = this.canvas.getContext('2d');
    if (displayCtx) {
      displayCtx.clearRect(0, 0, COMPOSITE_WIDTH, COMPOSITE_HEIGHT);
      displayCtx.drawImage(this.offscreenCanvas, 0, 0);
    }
  }

  async captureHD({ background, sceneParticipants }) {
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = 1200;
    snapCanvas.height = 900;
    const ctx = snapCanvas.getContext('2d');
    if (!ctx) return null;

    drawStudioBackground(ctx, background, 1200, 900);

    const scaleX = 1200 / COMPOSITE_WIDTH;
    const scaleY = 900 / COMPOSITE_HEIGHT;
    const activeCount = sceneParticipants.length;

    const layers = this.buildLayers(sceneParticipants, activeCount, true).map((layer) => ({
      ...layer,
      cx: layer.cx * scaleX,
      feetY: layer.feetY * scaleY,
      drawX: layer.drawX * scaleX,
      drawY: layer.drawY * scaleY,
      width: layer.width * scaleX,
      height: layer.height * scaleY,
    }));

    layers.forEach((layer) => {
      const shadowW = layer.width * 0.72;
      const shadowH = shadowW * 0.28;
      this.drawContactShadow(ctx, layer.cx, layer.feetY - shadowH * 0.3, shadowW, shadowH);
    });

    layers.forEach((layer) => {
      if (layer.cutout) {
        ctx.drawImage(layer.cutout, layer.drawX, layer.drawY, layer.width, layer.height);
      } else {
        /* Segmentation not ready — fall back to the raw video frame so the
           participant isn't silently absent from the captured photo. */
        const srcPart = sceneParticipants.find((p) => p.peerId === layer.peerId);
        const vid = srcPart?.video;
        if (vid && vid.readyState >= 1) {
          if (srcPart?.mirror) {
            ctx.save();
            ctx.translate(layer.drawX + layer.width, layer.drawY);
            ctx.scale(-1, 1);
            ctx.drawImage(vid, 0, 0, layer.width, layer.height);
            ctx.restore();
          } else {
            ctx.drawImage(vid, layer.drawX, layer.drawY, layer.width, layer.height);
          }
        } else {
          /* No video either — draw loading silhouette */
          this.drawLoadingSilhouette(ctx, layer.drawX, layer.drawY, layer.width, layer.height);
        }
      }
    });

    return snapCanvas.toDataURL('image/png');
  }
}
