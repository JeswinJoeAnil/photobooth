/**
 * Web Worker for offloading pixel filter calculations off the main UI thread.
 * Receives: { id, data, pixel, width, height }
 * Returns: { id, data } with transferred buffer.
 */

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }
function lerp(a, b, t) { return a + (b - a) * t; }

const NOISE_SIZE = 8192;
const NOISE_TABLE = new Float32Array(NOISE_SIZE);
for (let i = 0; i < NOISE_SIZE; i++) {
  NOISE_TABLE[i] = (Math.random() - 0.5) * 2;
}

function interpolateCurve(value, points) {
  if (value <= points[0][0]) return points[0][1];
  if (value >= points[points.length - 1][0]) return points[points.length - 1][1];
  for (let i = 0; i < points.length - 1; i++) {
    if (value >= points[i][0] && value <= points[i + 1][0]) {
      const t = (value - points[i][0]) / (points[i + 1][0] - points[i][0]);
      return Math.round(points[i][1] + t * (points[i + 1][1] - points[i][1]));
    }
  }
  return value;
}

function buildCurveLUT(points) {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = interpolateCurve(i, points);
  return lut;
}

function processPixels(d, pixel, width, height) {
  const len = d.length;
  const curveLUT = pixel.curve ? buildCurveLUT(pixel.curve) : null;
  const hasDuotone = !!pixel.duotone;
  const duotoneShadow = hasDuotone ? pixel.duotone.shadow : null;
  const duotoneHigh = hasDuotone ? pixel.duotone.highlight : null;

  const hasSplitTone = !hasDuotone && !!pixel.splitTone;
  const st = hasSplitTone ? pixel.splitTone : null;
  const stBal = hasSplitTone ? (st.balance ?? 0.5) : 0.5;
  const stAmt = hasSplitTone ? (st.amount ?? 0.3) : 0.3;
  const stShadows = hasSplitTone ? st.shadows : null;
  const stHighlights = hasSplitTone ? st.highlights : null;

  const hasTint = !!pixel.tint;
  const tintColor = hasTint ? pixel.tint.color : null;
  const tintStrength = hasTint ? (pixel.tint.strength ?? 0.1) : 0;

  const grainAmount = pixel.grain ? pixel.grain * 255 : 0;
  let noiseIdx = 0;

  // Single-pass linear color grading
  for (let i = 0; i < len; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    if (curveLUT) {
      r = curveLUT[r];
      g = curveLUT[g];
      b = curveLUT[b];
    }

    if (hasDuotone) {
      const luma = (r * 77 + g * 150 + b * 29) >> 8;
      const t = luma / 255;
      r = lerp(duotoneShadow[0], duotoneHigh[0], t);
      g = lerp(duotoneShadow[1], duotoneHigh[1], t);
      b = lerp(duotoneShadow[2], duotoneHigh[2], t);
    } else if (hasSplitTone) {
      const luma = (r * 77 + g * 150 + b * 29) >> 8;
      const t = luma / 255;
      const sw = Math.max(0, 1 - t / stBal) * stAmt;
      const hw = Math.max(0, (t - stBal) / (1 - stBal)) * stAmt;
      r += (stShadows[0] - r) * sw + (stHighlights[0] - r) * hw;
      g += (stShadows[1] - g) * sw + (stHighlights[1] - g) * hw;
      b += (stShadows[2] - b) * sw + (stHighlights[2] - b) * hw;
    }

    if (hasTint) {
      r = lerp(r, tintColor[0], tintStrength);
      g = lerp(g, tintColor[1], tintStrength);
      b = lerp(b, tintColor[2], tintStrength);
    }

    if (grainAmount) {
      const n = NOISE_TABLE[noiseIdx++ & (NOISE_SIZE - 1)] * grainAmount;
      r += n;
      g += n;
      b += n;
    }

    d[i]     = r < 0 ? 0 : (r > 255 ? 255 : (r | 0));
    d[i + 1] = g < 0 ? 0 : (g > 255 ? 255 : (g | 0));
    d[i + 2] = b < 0 ? 0 : (b > 255 ? 255 : (b | 0));
  }

  // Chromatic aberration
  if (pixel.chromaticAberration) {
    const px = Math.max(1, Math.round(pixel.chromaticAberration));
    const copy = new Uint8ClampedArray(d);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const rSrc = Math.max(0, Math.min(width - 1, x + px));
        const bSrc = Math.max(0, Math.min(width - 1, x - px));
        d[i]     = copy[(y * width + rSrc) * 4];
        d[i + 2] = copy[(y * width + bSrc) * 4];
      }
    }
  }

  // Glitch blocks
  if (pixel.glitch) {
    const intensity = pixel.glitch;
    const numBlocks = Math.floor(15 + intensity * 40);
    const copy = new Uint8ClampedArray(d);
    for (let b = 0; b < numBlocks; b++) {
      const bh = 3 + Math.floor(Math.random() * 20);
      const by = Math.floor(Math.random() * (height - bh));
      const offsetX = (Math.floor(Math.random() * 60) - 30) * intensity;
      const bw = Math.floor(width * (0.05 + Math.random() * 0.3));
      const bx = Math.floor(Math.random() * (width - bw));
      for (let y = by; y < Math.min(height, by + bh); y++) {
        for (let x = bx; x < Math.min(width, bx + bw); x++) {
          const srcX = Math.max(0, Math.min(width - 1, x + offsetX));
          const si = (y * width + srcX) * 4;
          const di = (y * width + x) * 4;
          d[di] = copy[si]; d[di + 1] = copy[si + 1]; d[di + 2] = copy[si + 2];
        }
      }
    }
  }

  // Scanlines
  if (pixel.scanlines) {
    const opacity = pixel.scanlines.opacity ?? 0.3;
    const rowSize = width * 4;
    for (let y = 0; y < height; y += 2) {
      const off = y * rowSize;
      for (let x = 0; x < rowSize; x += 4) {
        const j = off + x;
        d[j]     = clamp(lerp(d[j], 0, opacity));
        d[j + 1] = clamp(lerp(d[j + 1], 0, opacity));
        d[j + 2] = clamp(lerp(d[j + 2], 0, opacity));
      }
    }
  }

  // Dust
  if (pixel.dust) {
    const totalPx = width * height;
    const specks = Math.floor(totalPx * pixel.dust * 0.015);
    for (let i = 0; i < specks; i++) {
      const idx = Math.floor(Math.random() * totalPx) * 4;
      const v = Math.random() > 0.5 ? 255 : Math.floor(180 + Math.random() * 60);
      d[idx] = v; d[idx + 1] = v; d[idx + 2] = v;
    }
  }
}

self.onmessage = function (e) {
  const { id, data, pixel, width, height } = e.data;
  const d = new Uint8ClampedArray(data);
  processPixels(d, pixel, width, height);
  self.postMessage({ id, data: d.buffer }, [d.buffer]);
};
