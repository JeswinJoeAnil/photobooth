import { PARTICIPANT_LAYOUTS, drawStudioBackground } from '../constants/studioAssets.js';
import { segmentationPipeline } from '../utils/segmentationPipeline.js';

export const COMPOSITE_WIDTH = 1280;
export const COMPOSITE_HEIGHT = 720;

/**
 * StudioCompositor — High-performance scene compositor engine.
 *
 * Renders:
 * - Layer 0: Shared Studio Background (Y2K Chrome, Classic Booth, Disco, Dream Room, Cyber Pop, Film Studio, Custom Image).
 * - Layer 1..N: Soft Floor Contact Shadows beneath each participant's feet baseline.
 * - Layers N+1..2N: Transparent Person Cutout Layers positioned at normalized coordinates (x, y, scale, zIndex).
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

  /**
   * Render a soft radial contact shadow on the studio floor beneath a participant's feet.
   */
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

  /**
   * Main Live Preview rendering frame loop.
   */
  renderFrame({
    background,
    localVideo,
    remoteVideosMap,
    participants,
    mirrorOn = true,
  }) {
    if (!this.canvas) return;
    const ctx = this.offscreenCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, COMPOSITE_WIDTH, COMPOSITE_HEIGHT);

    /* ─── Layer 0: Shared Studio Background ─── */
    drawStudioBackground(ctx, background, COMPOSITE_WIDTH, COMPOSITE_HEIGHT);

    /* Helper to check and trigger playback for a video element */
    const isVideoValid = (vid) => {
      if (!vid) return false;
      if (vid.paused) {
        vid.play().catch(() => {});
      }
      return vid.readyState >= 1 || vid.videoWidth > 0;
    };

    /* Collect all active participant video feeds */
    const activeParticipants = [];

    /* Local User */
    if (isVideoValid(localVideo)) {
      activeParticipants.push({
        peerId: 'local-user',
        video: localVideo,
        isLocal: true,
        name: 'You',
      });
    }

    /* Remote Peers */
    participants.forEach((p) => {
      const vid = remoteVideosMap.get(p.peerId);
      if (isVideoValid(vid)) {
        activeParticipants.push({
          peerId: p.peerId,
          video: vid,
          isLocal: false,
          name: p.name || 'Guest',
        });
      }
    });

    const totalCount = Math.min(4, Math.max(1, activeParticipants.length));
    const layoutList = PARTICIPANT_LAYOUTS[totalCount] || PARTICIPANT_LAYOUTS[1];

    /* Prepare cutout layers with positions */
    const participantLayers = [];

    activeParticipants.slice(0, 4).forEach((part, index) => {
      const layout = layoutList[index] || layoutList[0];
      const isMirrored = part.isLocal ? mirrorOn : false;

      /* Process frame through segmentation pipeline */
      const cutout = segmentationPipeline.processParticipant(
        part.peerId,
        part.video,
        isMirrored,
        false
      );

      if (cutout) {
        /* Base display dimensions derived from layout scale */
        const baseW = COMPOSITE_WIDTH * (totalCount === 1 ? 0.52 : 0.40) * layout.scale;
        const baseH = COMPOSITE_HEIGHT * (totalCount === 1 ? 0.90 : 0.76) * layout.scale;

        /* Calculate baseline floor coordinates */
        const cx = layout.x * COMPOSITE_WIDTH;
        const feetY = layout.y * COMPOSITE_HEIGHT + baseH / 2;
        const drawX = cx - baseW / 2;
        const drawY = feetY - baseH;

        participantLayers.push({
          ...part,
          cutout,
          cx,
          feetY,
          drawX,
          drawY,
          width: baseW,
          height: baseH,
          zIndex: layout.zIndex || index,
        });
      }
    });

    /* Sort layers by zIndex (back to front) */
    participantLayers.sort((a, b) => a.zIndex - b.zIndex);

    /* ─── Layer 1..N: Contact Shadows on Studio Floor ─── */
    participantLayers.forEach((layer) => {
      const shadowW = layer.width * 0.72;
      const shadowH = shadowW * 0.28;
      this.drawContactShadow(ctx, layer.cx, layer.feetY - shadowH * 0.3, shadowW, shadowH);
    });

    /* ─── Layer N+1..2N: Transparent Person Cutouts ─── */
    participantLayers.forEach((layer) => {
      ctx.drawImage(layer.cutout, layer.drawX, layer.drawY, layer.width, layer.height);
    });

    /* Blit composite from offscreen canvas to viewport canvas */
    const displayCtx = this.canvas.getContext('2d');
    if (displayCtx) {
      displayCtx.clearRect(0, 0, COMPOSITE_WIDTH, COMPOSITE_HEIGHT);
      displayCtx.drawImage(this.offscreenCanvas, 0, 0);
    }
  }

  /**
   * Perform High-Quality snapshot composition pass for final photo capture.
   */
  async captureHD({
    background,
    localVideo,
    remoteVideosMap,
    participants,
    mirrorOn = true,
  }) {
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = 1200;
    snapCanvas.height = 900;
    const ctx = snapCanvas.getContext('2d');
    if (!ctx) return null;

    /* Draw background at high resolution */
    drawStudioBackground(ctx, background, 1200, 900);

    const activeParticipants = [];
    if (localVideo && localVideo.readyState >= 2) {
      activeParticipants.push({ peerId: 'local-user', video: localVideo, isLocal: true });
    }
    participants.forEach((p) => {
      const vid = remoteVideosMap.get(p.peerId);
      if (vid && vid.readyState >= 2) {
        activeParticipants.push({ peerId: p.peerId, video: vid, isLocal: false });
      }
    });

    const totalCount = Math.min(4, Math.max(1, activeParticipants.length));
    const layoutList = PARTICIPANT_LAYOUTS[totalCount] || PARTICIPANT_LAYOUTS[1];
    const layers = [];

    for (let index = 0; index < Math.min(4, activeParticipants.length); index++) {
      const part = activeParticipants[index];
      const layout = layoutList[index] || layoutList[0];
      const isMirrored = part.isLocal ? mirrorOn : false;

      /* Force HD high-precision segmentation pass */
      const cutout = segmentationPipeline.processParticipant(
        part.peerId,
        part.video,
        isMirrored,
        true
      );

      if (cutout) {
        const baseW = 1200 * (totalCount === 1 ? 0.52 : 0.40) * layout.scale;
        const baseH = 900 * (totalCount === 1 ? 0.90 : 0.76) * layout.scale;
        const cx = layout.x * 1200;
        const feetY = layout.y * 900 + baseH / 2;
        const drawX = cx - baseW / 2;
        const drawY = feetY - baseH;

        layers.push({
          cutout,
          cx,
          feetY,
          drawX,
          drawY,
          width: baseW,
          height: baseH,
          zIndex: layout.zIndex || index,
        });
      }
    }

    layers.sort((a, b) => a.zIndex - b.zIndex);

    /* Render floor contact shadows */
    layers.forEach((layer) => {
      const shadowW = layer.width * 0.72;
      const shadowH = shadowW * 0.28;
      this.drawContactShadow(ctx, layer.cx, layer.feetY - shadowH * 0.3, shadowW, shadowH);
    });

    /* Render high-res cutouts */
    layers.forEach((layer) => {
      ctx.drawImage(layer.cutout, layer.drawX, layer.drawY, layer.width, layer.height);
    });

    return snapCanvas.toDataURL('image/png');
  }
}
