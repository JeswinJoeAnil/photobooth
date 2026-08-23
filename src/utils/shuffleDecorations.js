/** 
 * Smart collision-aware sticker placements for Magic Shuffle.
 * Uses jittered grid + AABB rejection to prevent clumping and overlapping.
 */
export function generateShuffleDecorations(stickers, countMin = 7, countMax = 11) {
  const accents = ['#ff5aaf', '#5ac8ff', '#b45aff', '#5aff8c', '#ffea5a', '#111111'];
  const imageStickers = stickers.filter((s) => s.endsWith('.png'));
  const textStickers = stickers.filter((s) => !s.endsWith('.png'));
  const newDecos = [];
  const span = Math.max(0, countMax - countMin);
  const count = countMin + (span ? Math.floor(Math.random() * (span + 1)) : 0);
  const now = Date.now();

  // Keep track of placed bounding boxes in percentage coordinates (minX, minY, maxX, maxY)
  const placedBoxes = [];

  function checkOverlap(box, minDistance = 14) {
    for (const b of placedBoxes) {
      const dx = Math.abs((box.minX + box.maxX) / 2 - (b.minX + b.maxX) / 2);
      const dy = Math.abs((box.minY + box.maxY) / 2 - (b.minY + b.maxY) / 2);
      const minDistX = (box.w + b.w) / 2 + minDistance;
      const minDistY = (box.h + b.h) / 2 + minDistance;
      if (dx < minDistX && dy < minDistY) {
        return true;
      }
    }
    return false;
  }

  // Pre-calculate target zones across the strip height (top, upper-mid, lower-mid, bottom)
  const zones = Array.from({ length: count }, (_, i) => {
    const yMin = 8 + (i / count) * 80;
    const yMax = yMin + 80 / count;
    return { yMin, yMax };
  });

  // Shuffle zones so placement is distributed naturally
  zones.sort(() => Math.random() - 0.5);

  for (let i = 0; i < count; i++) {
    const canPickText = textStickers.length > 0;
    const canPickImage = imageStickers.length > 0;
    
    // Balanced 70/30 distribution between cute PNGs and typography stamps
    const pickImage = canPickImage && (!canPickText || Math.random() < 0.70);
    const content = pickImage
      ? imageStickers[Math.floor(Math.random() * imageStickers.length)]
      : (canPickText ? textStickers[Math.floor(Math.random() * textStickers.length)] : imageStickers[0]);
    const isImg = pickImage;

    const scale = 0.65 + Math.random() * 0.7; // Tighter, balanced scale
    const approxW = isImg ? 18 * scale : 24 * scale;
    const approxH = isImg ? 18 * scale : 10 * scale;

    const zone = zones[i] || { yMin: 8, yMax: 88 };

    // Try up to 12 candidate positions within the zone to avoid overlapping
    let bestX = 12 + Math.random() * 76;
    let bestY = zone.yMin + Math.random() * Math.max(2, zone.yMax - zone.yMin);
    let bestBox = { minX: bestX - approxW / 2, maxX: bestX + approxW / 2, minY: bestY - approxH / 2, maxY: bestY + approxH / 2, w: approxW, h: approxH };

    for (let attempt = 0; attempt < 12; attempt++) {
      // Alternate left/right edges vs center for photostrip aesthetic
      const xCandidate = attempt % 2 === 0
        ? (Math.random() < 0.5 ? 10 + Math.random() * 25 : 65 + Math.random() * 25)
        : (15 + Math.random() * 70);
      const yCandidate = Math.max(6, Math.min(92, zone.yMin + (Math.random() * (zone.yMax - zone.yMin))));
      const candidateBox = { minX: xCandidate - approxW / 2, maxX: xCandidate + approxW / 2, minY: yCandidate - approxH / 2, maxY: yCandidate + approxH / 2, w: approxW, h: approxH };

      if (!checkOverlap(candidateBox, 10)) {
        bestX = xCandidate;
        bestY = yCandidate;
        bestBox = candidateBox;
        break;
      }
    }

    placedBoxes.push(bestBox);
    const randomBg = accents[Math.floor(Math.random() * accents.length)];

    newDecos.push({
      id: `shuffle-${now}-${i}`,
      type: 'sticker',
      content,
      x: Math.round(bestX * 10) / 10,
      y: Math.round(bestY * 10) / 10,
      scaleX: Math.round(scale * 100) / 100,
      scaleY: Math.round(scale * 100) / 100,
      rotation: Math.round(-30 + Math.random() * 60),
      isImage: isImg,
      showBg: !isImg,
      bgColor: randomBg,
    });
  }

  return newDecos;
}

export function triggerMagicFlashOnStrip() {
  requestAnimationFrame(() => {
    const strip = document.querySelector('.photo-result');
    if (!strip) return;
    strip.classList.remove('magic-flash');
    void strip.offsetWidth;
    strip.classList.add('magic-flash');
  });
}
