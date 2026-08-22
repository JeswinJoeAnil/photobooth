export const asset = (name) => new URL(`../../assets/${name}`, import.meta.url).href;

export const ASSETS = {
  scrapbook: asset('XLuTGjgtwjWtugfWBkwiLVHNF71_iX5xma4L6mxdq-VImioPV2fqq4TAkvueyEqg1IiNDI35_HvKV8KjpR__xK8UhB74W3ut-1GHsNKK_jjzet8cIi0KKKpYMK6JwdUllaTIG5MwrWg6y-XIFC-9moOd-NQkY-OGnp_zsu63kdSsIdoJ7u7KZ_dzygamVTPX.jpg'),
  collage: asset('1FDV7eh_AR8YMK0FX-wk3cZewoeM_NZTtyX5a6Fu90SGrBSujtYzJtiOF5tJlZa7Ag6RJX8RVqJzMuBST-25aAliIT_40cFFlN9uFVp_F1chjnlFseI2SbuUyO6zbdwCObOqTPZsctXxjejoiXh6QTXTSAuR3KLhXb-m5CUxzzri1Jwj6D4VkIS3a1onqHp3.jpg'),
  cameraWide: asset('54f49c9c7633a07bbc183dc5d7ab7d12.jpg'),
  cameraPoster: asset('5d0962c9a39f4963242a24778a4b332c.jpg'),
  cameraTop: asset('OIP.jpg'),
  y2kGreen: asset('Pecn3dmLyNRtp0rgwH9MRdIph5qeSW5-djVPZtQkxI4cso7bVMImh0gggyyT4MkZwGskMCCUsIWDKsR7AHQT25Kc9OBiHBhWV_XuwJJZIKRUijSXejM30HY9Az5tpp6xiNf5KcHTRunrB_CILdS_yLJRp-p8kZNINCwEiHlDLRp4A8WxyWkTFyjx3cuG5Kx0.jpg'),
  cuteSnaps: asset('Screenshot 2026-05-09 025853.png'),
  doodleStrip: asset('Screenshot 2026-05-09 025918.png'),
  previewDigicam: asset('retro cam.jpg'),
  previewVhs: asset('vhs.jpg'),
  previewGrain: asset('film grain.jpg'),
  previewBloom: asset('dreamy bloom.jpg'),
  previewFlash: asset('soft flash.jpg'),
  previewCrt: asset('crt distory.jpg'),
  previewWarm: asset('warm vintag3.jpg'),
  previewSilver: asset('cool silver.jpg'),
  previewPolaroid: asset('faded polaroid.jpg'),
  playlist: [
    asset('cassette-pastel-nights.mp3'),
    asset('vhs-heartbeat.mp3'),
    asset('polaroids-in-a-shoebox.mp3'),
  ],
  shutter: 'https://www.soundjay.com/mechanical/camera-shutter-click-01.mp3',
};

export const assetPhotos = [
  ASSETS.y2kGreen,
  ASSETS.scrapbook,
  ASSETS.collage,
  ASSETS.cameraWide,
  ASSETS.cameraPoster,
  ASSETS.cameraTop,
  ASSETS.cuteSnaps,
  ASSETS.doodleStrip,
];

/**
 * Dramatic photobooth filter presets.
 *
 * pixel supports:
 *   curve                [[in,out],…] — RGB tone curve (0–255)
 *   duotone.shadow/high  [r,g,b] — full color remap (overrides splitTone)
 *   splitTone            {shadows,highlights,balance,amount} — color split
 *   tint                 {color:[r,g,b], strength} — overall wash
 *   chromaticAberration  px — RGB split
 *   glitch               0–1 — block displacement + channel swap intensity
 *   scanlines            {opacity, rgbShift:px} — CRT scanlines
 *   grain                0–0.5 — film noise
 *   lightLeak            {count, opacity, color:[r,g,b]} — colored streaks
 *   dust                 0–1 — white specks + scratches
 *   letterbox            0–1 — cinematic black bars (fraction of height)
 *   vignette             0–1 — dark corners
 */
export const filters = [
  // ── No filter (pure camera image) ──
  { id: 'normal', name: 'Clean', css: 'none', preview: ASSETS.previewDigicam },

  // ── Original CSS-only filters ──
  {
    id: 'portra400',
    name: 'Portra 400',
    css: 'contrast(0.96) saturate(1.12) brightness(1.04) sepia(0.08)',
    preview: ASSETS.previewWarm,
    pixel: {
      curve: [[0, 8], [32, 42], [64, 76], [128, 134], [192, 204], [255, 250]],
      splitTone: { shadows: [118, 132, 126], highlights: [255, 226, 196], balance: 0.58, amount: 0.14 },
      grain: 0.045,
      vignette: 0.1,
    },
  },
  {
    id: 'polaroid600',
    name: 'Polaroid 600',
    css: 'contrast(0.82) saturate(0.78) brightness(1.16) sepia(0.14)',
    preview: ASSETS.previewPolaroid,
    pixel: {
      curve: [[0, 24], [32, 54], [64, 84], [128, 136], [192, 196], [255, 240]],
      splitTone: { shadows: [165, 190, 205], highlights: [255, 218, 202], balance: 0.5, amount: 0.16 },
      grain: 0.06,
      lightLeak: { count: 1, opacity: 0.08, color: [255, 190, 170] },
    },
  },

  // ── Premium film looks (vibrant, not desaturated) ──
  {
    id: 'gold200',
    name: 'Gold 200',
    css: 'contrast(1.05) saturate(1.18) brightness(1.08) sepia(0.16)',
    preview: ASSETS.previewGrain,
    pixel: {
      curve: [[0, 5], [32, 38], [64, 74], [128, 136], [192, 210], [255, 252]],
      splitTone: { shadows: [118, 94, 70], highlights: [255, 226, 158], balance: 0.45, amount: 0.13 },
      grain: 0.055,
    },
  },
  {
    id: 'fuji400h',
    name: 'Fuji 400H',
    css: 'contrast(0.92) saturate(0.98) brightness(1.08) hue-rotate(4deg)',
    preview: ASSETS.previewBloom,
    pixel: {
      curve: [[0, 12], [32, 46], [64, 82], [128, 136], [192, 202], [255, 246]],
      splitTone: { shadows: [112, 150, 142], highlights: [246, 232, 210], balance: 0.54, amount: 0.12 },
      grain: 0.035,
    },
  },
  {
    id: 'cinestill800t',
    name: '800T Glow',
    css: 'contrast(1.12) saturate(1.2) brightness(1.02) hue-rotate(-8deg)',
    preview: ASSETS.previewCrt,
    pixel: {
      curve: [[0, 4], [32, 36], [64, 70], [128, 135], [192, 214], [255, 255]],
      splitTone: { shadows: [42, 84, 118], highlights: [255, 112, 86], balance: 0.48, amount: 0.18 },
      lightLeak: { count: 1, opacity: 0.1, color: [255, 92, 72] },
      grain: 0.065,
    },
  },
  {
    id: 'disposableflash',
    name: 'Disposable Flash',
    css: 'contrast(1.08) saturate(1.05) brightness(1.18) sepia(0.05)',
    preview: ASSETS.previewFlash,
    pixel: {
      curve: [[0, 10], [32, 42], [64, 78], [128, 140], [192, 218], [255, 255]],
      splitTone: { shadows: [142, 150, 160], highlights: [255, 238, 214], balance: 0.62, amount: 0.1 },
      grain: 0.08,
      dust: 0.14,
      vignette: 0.18,
    },
  },
  {
    id: 'hp5',
    name: 'HP5 Mono',
    css: 'grayscale(1) contrast(1.35) brightness(1.03)',
    preview: ASSETS.previewSilver,
    pixel: {
      curve: [[0, 2], [32, 30], [64, 66], [128, 136], [192, 214], [255, 255]],
      tint: { color: [218, 216, 206], strength: 0.1 },
      grain: 0.075,
      vignette: 0.16,
    },
  },
  {
    id: 'vhsdate',
    name: 'VHS Date',
    css: 'contrast(1.12) saturate(0.72) brightness(1.05) hue-rotate(-16deg) blur(0.25px)',
    preview: ASSETS.previewVhs,
    pixel: {
      chromaticAberration: 3,
      glitch: 0.22,
      scanlines: { opacity: 0.16, rgbShift: 1.4 },
      grain: 0.05,
    },
  },
];

export const frames = [
  { id: 'korean', name: 'Korean Day', tone: 'rose', description: 'Tall strip, glossy pink edge, tiny chrome charms.' },
  { id: 'scrap', name: 'Scrapbook', tone: 'paper', description: 'Layered tape, notes, paper texture, dreamy margin.' },
  { id: 'chrome', name: 'Silver Y2K', tone: 'chrome', description: 'Chrome shell with camera hardware as the frame.' },
  { id: 'magazine', name: 'Magazine', tone: 'editorial', description: 'Fashion editorial blocks, masthead, date stamp.' },
  { id: 'doodle', name: 'Doodle Strip', tone: 'ink', description: 'Hand-drawn marks and sticker-heavy nostalgia.' },
  { id: 'camera', name: 'Camera Frame', tone: 'camera', description: 'Photos placed directly inside a retro digicam body.' },
];

export const stickerCategories = [
  {
    id: 'caption-tags',
    name: 'Caption Tags',
    vibe: 'Quick text stamps',
    items: ['good vibes', 'Y2K', '2004', 'no bad days', 'xoxo', 'iconic', 'lovely day', 'PM 04:23'],
  },
  {
    id: 'y2k-pop',
    name: 'Y2K Pop',
    vibe: 'Bright throwback PNGs',
    items: ['sticker1.png', ...Array.from({ length: 20 }, (_, i) => `sticker2_${i + 1}.png`)],
  },
  {
    id: 'cute-cutouts',
    name: 'Cute Cutouts',
    vibe: 'Soft scrapbook bits',
    items: Array.from({ length: 20 }, (_, i) => `sticker2_${i + 21}.png`),
  },
  {
    id: 'aesthetic-mix',
    name: 'Aesthetic Mix',
    vibe: 'Collage-friendly accents',
    items: Array.from({ length: 24 }, (_, i) => `stickers3_${i + 1}.png`),
  },
  {
    id: 'retro-booth',
    name: 'Retro Booth',
    vibe: 'Film strip extras',
    items: [
      ...Array.from({ length: 36 }, (_, i) => `stickers3_${i + 25}.png`),
      ...Array.from({ length: 19 }, (_, i) => `sticker4_${i + 1}.png`),
    ],
  },
  {
    id: 'premium-web',
    name: 'Premium Web PNGs',
    vibe: 'Cute glossy stickers',
    items: [
      'premium_sparkles.png',
      'premium_bow.png',
      'premium_flower.png',
      'premium_cherries.png',
      'premium_camera_flash.png',
      'premium_heart_decoration.png',
      'premium_love_letter.png',
      'premium_cd.png',
      'premium_glowing_star.png',
      'premium_hearts.png',
      'premium_rainbow.png',
      'premium_videocassette.png',
    ],
  },
];

export const stickers = stickerCategories.flatMap((category) => category.items);

/** Strip background presets (solid colors + gradients). */
export const BACKGROUNDS = [
  { id: 'cream', type: 'solid', label: 'Cream', value: '#f7eee6' },
  { id: 'white', type: 'solid', label: 'White', value: '#ffffff' },
  { id: 'pink', type: 'solid', label: 'Pink', value: '#ffd1dc' },
  { id: 'blue', type: 'solid', label: 'Sky Blue', value: '#d4e8ff' },
  { id: 'mint', type: 'solid', label: 'Mint', value: '#d4f5e2' },
  { id: 'lavender', type: 'solid', label: 'Lavender', value: '#e8d4f5' },
  { id: 'peach', type: 'solid', label: 'Peach', value: '#ffddd4' },
  { id: 'yellow', type: 'solid', label: 'Lemon', value: '#fff5d4' },
  { id: 'black', type: 'solid', label: 'Black', value: '#111111' },
  { id: 'hotpink', type: 'solid', label: 'Hot Pink', value: '#ff5aaf' },
  { id: 'sunset', type: 'gradient', label: 'Sunset', from: '#ff9a9e', to: '#fad0c4' },
  { id: 'ocean', type: 'gradient', label: 'Ocean', from: '#a1c4fd', to: '#c2e9fb' },
  { id: 'lilac', type: 'gradient', label: 'Lilac', from: '#c471ed', to: '#f64f59' },
  { id: 'aurora', type: 'gradient', label: 'Aurora', from: '#fccb90', to: '#d57eeb' },
  { id: 'rose', type: 'gradient', label: 'Rose', from: '#fddb92', to: '#d1fdff' },
];

/** URLs worth warming on startup (hero-critical). */
export const PRELOAD_IMAGE_URLS = [
  ASSETS.y2kGreen,
  ASSETS.scrapbook,
  ASSETS.previewDigicam,
];
