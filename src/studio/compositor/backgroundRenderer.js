/**
 * Studio Background Renderer
 * Renders curated Y2K studio environments, ambient illumination, and custom image backdrops.
 */

import { STUDIO_BACKGROUNDS } from '../../constants/studioAssets.js';

const _imageCache = new Map();

/**
 * Draws the photographic studio backdrop, ambient glows, and floor perspective plane.
 */
export function drawStudioBackground(ctx, background, width, height) {
  if (!ctx) return;

  // 1. Custom Image Background
  if (background?.customImageUrl) {
    const fallbackGrad = ['#2d1b4e', '#1a0a2e', '#0d0520'];
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    fallbackGrad.forEach((color, i) => {
      grad.addColorStop(i / (fallbackGrad.length - 1), color);
    });
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const cached = _imageCache.get(background.customImageUrl);
    if (cached?.complete && cached.naturalWidth > 0) {
      ctx.drawImage(cached, 0, 0, width, height);
    } else if (!cached) {
      const img = new Image();
      img.src = background.customImageUrl;
      _imageCache.set(background.customImageUrl, img);
      if (_imageCache.size > 4) {
        const oldest = _imageCache.keys().next().value;
        _imageCache.delete(oldest);
      }
    }
    return;
  }

  // 2. Preset Gradient Background
  const defaultGrad = ['#2d1b4e', '#1a0a2e', '#0d0520'];
  const gradientColors =
    background && Array.isArray(background.gradient) && background.gradient.length > 0
      ? background.gradient
      : defaultGrad;

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  gradientColors.forEach((color, i) => {
    grad.addColorStop(i / (gradientColors.length - 1), color);
  });
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 3. Ambient Lighting
  if (background?.ambientGlow) {
    background.ambientGlow.forEach((glow) => {
      const gx = glow.x * width;
      const gy = glow.y * height;
      const radius = (glow.radius / 800) * width;
      const gRad = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
      gRad.addColorStop(0, glow.color);
      gRad.addColorStop(1, 'transparent');
      ctx.fillStyle = gRad;
      ctx.fillRect(0, 0, width, height);
    });
  }

  // 4. Studio Floor Plane
  const floorColor = background?.floorColor || 'rgba(192, 132, 252, 0.06)';
  const floorGrad = ctx.createLinearGradient(0, height * 0.62, 0, height);
  floorGrad.addColorStop(0, 'transparent');
  floorGrad.addColorStop(1, floorColor);
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, 0, width, height);
}
