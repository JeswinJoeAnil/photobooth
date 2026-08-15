/**
 * Studio Person Normalizer
 * Positions participant camera streams on the studio floor with stable, natural proportions,
 * without active auto-resizing or dynamic jumping when moving.
 */

/**
 * Calculates stable layout metrics for a participant's camera cutout.
 *
 * @param {HTMLCanvasElement} cutoutCanvas - The transparent cutout canvas.
 * @param {Object} transform - Participant transform { x, baselineY, scale, zIndex }.
 * @param {number} sceneWidth - Logical scene width (e.g. 1280).
 * @param {number} sceneHeight - Logical scene height (e.g. 720).
 * @param {number} totalCount - Total number of active participants.
 */
export function normalizePersonCutout({
  cutoutCanvas,
  transform,
  sceneWidth = 1280,
  sceneHeight = 720,
  totalCount = 1,
}) {
  const count = Math.min(4, Math.max(1, totalCount || 1));
  const userScale = transform?.scale ?? 1.0;

  // Natural camera aspect ratio (e.g. 16:9 or 4:3)
  const vW = cutoutCanvas?.width || 640;
  const vH = cutoutCanvas?.height || 480;
  const aspectRatio = vH > 0 ? vW / vH : 16 / 9;

  // Stable scene height proportion per slot
  let heightRatio = 0.88;
  if (count === 2) heightRatio = 0.80;
  else if (count === 3) heightRatio = 0.74;
  else if (count === 4) heightRatio = 0.70;

  const targetHeight = sceneHeight * heightRatio * userScale;
  const targetWidth = targetHeight * aspectRatio;

  // Position horizontally around centerX
  const posX = transform?.x ?? 0.5;
  const centerX = Math.round(posX * sceneWidth);
  const drawX = Math.round(centerX - targetWidth / 2);

  // Anchor feet/bottom of frame to the studio floor baseline
  const baselineY = transform?.baselineY ?? 0.90;
  const floorY = Math.round(baselineY * sceneHeight);
  const drawY = Math.round(floorY - targetHeight);

  return {
    drawX,
    drawY,
    drawWidth: Math.round(targetWidth),
    drawHeight: Math.round(targetHeight),
    centerX,
    floorY,
    zIndex: transform?.zIndex ?? 1,
  };
}
