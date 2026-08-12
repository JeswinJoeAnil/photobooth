/**
 * Studio background environments — curated Y2K-themed virtual studio scenes.
 * Each entry describes a CSS gradient/color treatment for the compositor canvas.
 */
export const STUDIO_BACKGROUNDS = [
  {
    id: 'y2k-chrome',
    name: 'Y2K Chrome',
    description: 'Holographic chrome with pink-purple reflections',
    gradient: ['#2d1b4e', '#1a0a2e', '#0d0520'],
    accent: '#c084fc',
    floorColor: 'rgba(192, 132, 252, 0.08)',
    ambientGlow: [
      { x: 0.2, y: 0.3, color: 'rgba(255, 90, 175, 0.15)', radius: 400 },
      { x: 0.8, y: 0.4, color: 'rgba(139, 92, 246, 0.18)', radius: 350 },
      { x: 0.5, y: 0.9, color: 'rgba(192, 132, 252, 0.10)', radius: 500 },
    ],
  },
  {
    id: 'classic-booth',
    name: 'Classic Booth',
    description: 'Soft grey photographic studio backdrop',
    gradient: ['#2a2a2a', '#1e1e1e', '#141414'],
    accent: '#a0a0a0',
    floorColor: 'rgba(255, 255, 255, 0.03)',
    ambientGlow: [
      { x: 0.5, y: 0.2, color: 'rgba(255, 255, 255, 0.06)', radius: 500 },
      { x: 0.5, y: 0.8, color: 'rgba(255, 255, 255, 0.03)', radius: 400 },
    ],
  },
  {
    id: 'disco',
    name: 'Disco',
    description: 'Reflective floor, warm lights, disco-ball atmosphere',
    gradient: ['#1a0a1e', '#120818', '#0a0410'],
    accent: '#f59e0b',
    floorColor: 'rgba(245, 158, 11, 0.06)',
    ambientGlow: [
      { x: 0.3, y: 0.2, color: 'rgba(245, 158, 11, 0.12)', radius: 300 },
      { x: 0.7, y: 0.3, color: 'rgba(236, 72, 153, 0.12)', radius: 300 },
      { x: 0.5, y: 0.85, color: 'rgba(245, 158, 11, 0.08)', radius: 600 },
    ],
  },
  {
    id: 'dream-room',
    name: 'Dream Room',
    description: 'Soft nostalgic pink-peach bedroom warmth',
    gradient: ['#2d1a24', '#1e1018', '#140a10'],
    accent: '#fb7185',
    floorColor: 'rgba(251, 113, 133, 0.05)',
    ambientGlow: [
      { x: 0.3, y: 0.25, color: 'rgba(251, 113, 133, 0.14)', radius: 350 },
      { x: 0.7, y: 0.35, color: 'rgba(253, 164, 175, 0.10)', radius: 300 },
      { x: 0.5, y: 0.9, color: 'rgba(251, 113, 133, 0.06)', radius: 500 },
    ],
  },
  {
    id: 'cyber-pop',
    name: 'Cyber Pop',
    description: 'Controlled futuristic neon-blue Y2K environment',
    gradient: ['#0a1628', '#06101e', '#020a14'],
    accent: '#38bdf8',
    floorColor: 'rgba(56, 189, 248, 0.05)',
    ambientGlow: [
      { x: 0.2, y: 0.3, color: 'rgba(56, 189, 248, 0.12)', radius: 350 },
      { x: 0.8, y: 0.25, color: 'rgba(139, 92, 246, 0.10)', radius: 300 },
      { x: 0.5, y: 0.9, color: 'rgba(56, 189, 248, 0.06)', radius: 500 },
    ],
  },
  {
    id: 'film-studio',
    name: 'Film Studio',
    description: 'Editorial backdrop with moody controlled lighting',
    gradient: ['#1a1a1a', '#111111', '#0a0a0a'],
    accent: '#e2e8f0',
    floorColor: 'rgba(255, 255, 255, 0.02)',
    ambientGlow: [
      { x: 0.5, y: 0.15, color: 'rgba(255, 255, 255, 0.08)', radius: 450 },
      { x: 0.3, y: 0.7, color: 'rgba(255, 255, 255, 0.03)', radius: 300 },
      { x: 0.7, y: 0.7, color: 'rgba(255, 255, 255, 0.03)', radius: 300 },
    ],
  },
];

/**
 * Automatic participant composition layouts.
 * Positions are normalized (0–1) with (0,0) at top-left.
 * Baseline floor positioning anchors y to the feet/bottom of participant cutouts.
 */
export const PARTICIPANT_LAYOUTS = {
  1: [{ x: 0.50, y: 0.52, scale: 1.00, zIndex: 1 }],
  2: [
    { x: 0.35, y: 0.52, scale: 0.88, zIndex: 1 },
    { x: 0.65, y: 0.52, scale: 0.88, zIndex: 2 },
  ],
  3: [
    { x: 0.28, y: 0.48, scale: 0.78, zIndex: 1 },
    { x: 0.72, y: 0.48, scale: 0.78, zIndex: 2 },
    { x: 0.50, y: 0.58, scale: 0.84, zIndex: 3 },
  ],
  4: [
    { x: 0.26, y: 0.46, scale: 0.72, zIndex: 1 },
    { x: 0.74, y: 0.46, scale: 0.72, zIndex: 2 },
    { x: 0.38, y: 0.58, scale: 0.76, zIndex: 3 },
    { x: 0.62, y: 0.58, scale: 0.76, zIndex: 4 },
  ],
};

/**
 * Render Studio Background (Layer 0) on 2D context.
 */
export function drawStudioBackground(ctx, bg, w, h) {
  if (!ctx) return;

  const defaultGradient = ['#2d1b4e', '#1a0a2e', '#0d0520'];
  const gradientColors = (bg && bg.gradient && bg.gradient.length > 0) ? bg.gradient : defaultGradient;

  if (gradientColors) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    gradientColors.forEach((color, i) => {
      grad.addColorStop(i / (gradientColors.length - 1), color);
    });
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  if (bg && bg.ambientGlow) {
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

  if (bg && bg.floorColor) {
    const floorGrad = ctx.createLinearGradient(0, h * 0.65, 0, h);
    floorGrad.addColorStop(0, 'transparent');
    floorGrad.addColorStop(1, bg.floorColor);
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, 0, w, h);
  }
}

