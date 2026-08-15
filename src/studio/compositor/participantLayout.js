/**
 * Studio Participant Layout Engine
 * Deterministic standing positions anchored to the shared studio floor baseline.
 * Normalized coordinates: x (0 to 1, left-to-right), baselineY (0 to 1, top-to-floor).
 */

export const MAX_STUDIO_PARTICIPANTS = 4;

export const DEFAULT_LAYOUTS = {
  1: [{ x: 0.50, baselineY: 0.88, scale: 1.0, zIndex: 1 }],
  2: [
    { x: 0.35, baselineY: 0.88, scale: 1.0, zIndex: 1 },
    { x: 0.65, baselineY: 0.88, scale: 1.0, zIndex: 2 },
  ],
  3: [
    { x: 0.22, baselineY: 0.88, scale: 1.0, zIndex: 1 },
    { x: 0.50, baselineY: 0.88, scale: 1.0, zIndex: 2 },
    { x: 0.78, baselineY: 0.88, scale: 1.0, zIndex: 3 },
  ],
  4: [
    { x: 0.16, baselineY: 0.88, scale: 1.0, zIndex: 1 },
    { x: 0.38, baselineY: 0.88, scale: 1.0, zIndex: 2 },
    { x: 0.62, baselineY: 0.88, scale: 1.0, zIndex: 3 },
    { x: 0.84, baselineY: 0.88, scale: 1.0, zIndex: 4 },
  ],
};

/**
 * Returns default layout transform for a participant based on join order index.
 */
export function getDefaultParticipantTransform(joinIndex, totalCount) {
  const count = Math.min(MAX_STUDIO_PARTICIPANTS, Math.max(1, totalCount || 1));
  const layouts = DEFAULT_LAYOUTS[count] || DEFAULT_LAYOUTS[1];
  const safeIndex = Math.min(joinIndex, layouts.length - 1);
  const layout = layouts[safeIndex] || layouts[0];

  return {
    x: layout.x,
    baselineY: layout.baselineY,
    scale: layout.scale ?? 1.0,
    rotation: 0,
    zIndex: layout.zIndex ?? joinIndex + 1,
  };
}

/**
 * Bounds dragging coordinates to the safe studio staging area.
 */
export function constrainParticipantPosition(x, baselineY) {
  return {
    x: Math.min(0.95, Math.max(0.05, x)),
    baselineY: Math.min(0.95, Math.max(0.45, baselineY)),
  };
}
