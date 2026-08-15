/**
 * Studio Compositor
 * High-performance Canvas 2D scene renderer for the shared virtual studio.
 *
 * Layer Hierarchy:
 * 1. Shared Background & Floor Environment
 * 2. Floor Contact Shadows (Grounded at feet baseline)
 * 3. Transparent Participant Cutouts (sorted by zIndex, per-participant mirror)
 * 4. Framing & Studio Overlays
 */

import { drawStudioBackground } from './backgroundRenderer.js';
import { normalizePersonCutout } from './personNormalizer.js';
import { segmentationManager } from '../segmentation/segmentationManager.js';
import { getDefaultParticipantTransform } from './participantLayout.js';

export const COMPOSITE_WIDTH = 1280;
export const COMPOSITE_HEIGHT = 720;

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

  /**
   * Draws a soft, elliptical contact shadow under the participant's feet.
   */
  drawContactShadow(ctx, centerX, floorY, personWidth) {
    const shadowW = Math.max(80, personWidth * 0.65);
    const shadowH = shadowW * 0.20;

    ctx.save();
    ctx.translate(centerX, floorY);
    ctx.scale(1, shadowH / shadowW);

    const radGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowW / 2);
    radGrad.addColorStop(0, 'rgba(0, 0, 0, 0.38)');
    radGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.16)');
    radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(0, 0, shadowW / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Draws a placeholder silhouette while a participant's camera or model loads.
   */
  drawLoadingSilhouette(ctx, drawX, drawY, width, height) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.20)';

    // Head
    ctx.beginPath();
    ctx.ellipse(
      drawX + width / 2,
      drawY + height * 0.22,
      width * 0.16,
      width * 0.16,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Torso / Body
    ctx.beginPath();
    ctx.roundRect(
      drawX + width * 0.28,
      drawY + height * 0.32,
      width * 0.44,
      height * 0.55,
      12
    );
    ctx.fill();
    ctx.restore();
  }

  isVideoPlayable(video) {
    if (!video) return false;
    if (video.paused) video.play().catch(() => {});
    return video.readyState >= 1 || video.videoWidth > 0;
  }

  /**
   * Prepares normalized visual layers for all participants.
   */
  buildLayers(sceneParticipants, totalCount, isHQ = false, sceneW = COMPOSITE_WIDTH, sceneH = COMPOSITE_HEIGHT) {
    const count = Math.min(4, Math.max(1, totalCount || 1));
    const layers = [];

    sceneParticipants.slice(0, 4).forEach((part, joinIndex) => {
      const transform =
        part.transform ?? getDefaultParticipantTransform(joinIndex, count);

      const hasVideo = this.isVideoPlayable(part.video);

      let cutout = null;
      let segStatus = 'loading';

      if (hasVideo) {
        if (isHQ) {
          const res = segmentationManager.processHighQuality(part.peerId, part.video);
          cutout = res.cutout;
          segStatus = res.status;
        } else {
          const res = segmentationManager.processParticipant(part.peerId, part.video, count);
          cutout = res.cutout;
          segStatus = res.status;
        }
      }

      const metrics = normalizePersonCutout({
        cutoutCanvas: cutout,
        transform,
        sceneWidth: sceneW,
        sceneHeight: sceneH,
        totalCount: count,
      });

      layers.push({
        peerId: part.peerId,
        name: part.name,
        mirror: !!part.mirror,
        cutout,
        hasVideo,
        video: part.video,
        segStatus,
        metrics,
        zIndex: metrics.zIndex,
      });
    });

    return layers.sort((a, b) => a.zIndex - b.zIndex);
  }

  /**
   * Executes a single animation frame of the virtual photo studio.
   */
  renderFrame({ background, sceneParticipants }) {
    if (!this.canvas) return;
    const ctx = this.offscreenCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, COMPOSITE_WIDTH, COMPOSITE_HEIGHT);

    // 1. Layer 0: Shared Background & Floor Environment
    drawStudioBackground(ctx, background, COMPOSITE_WIDTH, COMPOSITE_HEIGHT);

    const activeCount = sceneParticipants.length;
    const layers = this.buildLayers(
      sceneParticipants,
      activeCount,
      false,
      COMPOSITE_WIDTH,
      COMPOSITE_HEIGHT
    );

    // 2. Layer 1: Ground Contact Shadows
    layers.forEach((layer) => {
      this.drawContactShadow(
        ctx,
        layer.metrics.centerX,
        layer.metrics.floorY,
        layer.metrics.drawWidth
      );
    });

    // 3. Layer 2: Transparent Participant Cutouts (sorted by zIndex)
    layers.forEach((layer) => {
      const { drawX, drawY, drawWidth, drawHeight, centerX } = layer.metrics;

      ctx.save();

      // Mirror transform: flips ONLY this participant around their own horizontal center
      if (layer.mirror) {
        ctx.translate(centerX, 0);
        ctx.scale(-1, 1);
        ctx.translate(-centerX, 0);
      }

      if (layer.cutout && layer.segStatus === 'ready') {
        ctx.drawImage(layer.cutout, drawX, drawY, drawWidth, drawHeight);
      } else if (layer.cutout && layer.hasVideo) {
        ctx.globalAlpha = 0.65;
        ctx.drawImage(layer.cutout, drawX, drawY, drawWidth, drawHeight);
        ctx.globalAlpha = 1.0;
      } else {
        this.drawLoadingSilhouette(ctx, drawX, drawY, drawWidth, drawHeight);
      }

      ctx.restore();
    });

    // 4. Present offscreen buffer to active canvas
    const displayCtx = this.canvas.getContext('2d');
    if (displayCtx) {
      displayCtx.clearRect(0, 0, COMPOSITE_WIDTH, COMPOSITE_HEIGHT);
      displayCtx.drawImage(this.offscreenCanvas, 0, 0);
    }
  }

  /**
   * Captures a high-resolution snapshot for the final photo strip.
   */
  async captureHD({ background, sceneParticipants, targetWidth = 1920, targetHeight = 1080 }) {
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = targetWidth;
    snapCanvas.height = targetHeight;
    const ctx = snapCanvas.getContext('2d');
    if (!ctx) return null;

    // Draw background on HD canvas
    drawStudioBackground(ctx, background, targetWidth, targetHeight);

    const activeCount = sceneParticipants.length;
    const layers = this.buildLayers(
      sceneParticipants,
      activeCount,
      true,
      targetWidth,
      targetHeight
    );

    // Draw HD contact shadows
    layers.forEach((layer) => {
      this.drawContactShadow(
        ctx,
        layer.metrics.centerX,
        layer.metrics.floorY,
        layer.metrics.drawWidth
      );
    });

    // Draw HD participant cutouts
    layers.forEach((layer) => {
      const { drawX, drawY, drawWidth, drawHeight, centerX } = layer.metrics;

      ctx.save();

      if (layer.mirror) {
        ctx.translate(centerX, 0);
        ctx.scale(-1, 1);
        ctx.translate(-centerX, 0);
      }

      if (layer.cutout) {
        ctx.drawImage(layer.cutout, drawX, drawY, drawWidth, drawHeight);
      } else if (layer.hasVideo) {
        ctx.drawImage(layer.video, drawX, drawY, drawWidth, drawHeight);
      } else {
        this.drawLoadingSilhouette(ctx, drawX, drawY, drawWidth, drawHeight);
      }

      ctx.restore();
    });

    return snapCanvas.toDataURL('image/png');
  }
}
