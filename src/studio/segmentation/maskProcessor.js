/**
 * Studio Mask Processor
 * High-performance bounding-box extraction, edge smoothing, and person cutout cropping.
 * Produces clean, transparent person cutouts in person space without raw webcam backgrounds.
 */

/**
 * Scans MediaPipe float confidence mask to locate the tight bounding box of the visible person.
 * Applies EMA temporal smoothing against previous bounds to prevent frame-to-frame jitter.
 */
export function extractPersonBoundingBox(
  floatMaskData,
  maskWidth,
  maskHeight,
  prevBounds = null,
  threshold = 0.40,
  paddingRatio = 0.08
) {
  let minX = maskWidth;
  let minY = maskHeight;
  let maxX = 0;
  let maxY = 0;
  let count = 0;

  const totalPixels = maskWidth * maskHeight;
  for (let i = 0; i < totalPixels; i++) {
    if (floatMaskData[i] >= threshold) {
      const x = i % maskWidth;
      const y = Math.floor(i / maskWidth);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      count++;
    }
  }

  // Fallback if no person is detected
  if (count < 30 || minX > maxX || minY > maxY) {
    if (prevBounds && prevBounds.detected) {
      return prevBounds;
    }
    return {
      normX: 0.20,
      normY: 0.05,
      normWidth: 0.60,
      normHeight: 0.90,
      detected: false,
    };
  }

  // Add padding around person envelope to preserve hair, gestures, and shoulders
  const boxW = maxX - minX;
  const boxH = maxY - minY;
  const padX = Math.round(boxW * paddingRatio);
  const padY = Math.round(boxH * paddingRatio);

  const finalMinX = Math.max(0, minX - padX);
  const finalMinY = Math.max(0, minY - padY);
  const finalMaxX = Math.min(maskWidth, maxX + padX);
  const finalMaxY = Math.min(maskHeight, maxY + padY);

  const rawNormX = finalMinX / maskWidth;
  const rawNormY = finalMinY / maskHeight;
  const rawNormW = Math.max(0.15, (finalMaxX - finalMinX) / maskWidth);
  const rawNormH = Math.max(0.20, (finalMaxY - finalMinY) / maskHeight);

  // Apply EMA smoothing to eliminate micro-jitter when standing or breathing
  if (prevBounds && prevBounds.detected) {
    const smoothFactor = 0.20; // 20% new, 80% history for rock-solid stability
    const normX = prevBounds.normX * (1 - smoothFactor) + rawNormX * smoothFactor;
    const normY = prevBounds.normY * (1 - smoothFactor) + rawNormY * smoothFactor;
    const normWidth = prevBounds.normWidth * (1 - smoothFactor) + rawNormW * smoothFactor;
    const normHeight = prevBounds.normHeight * (1 - smoothFactor) + rawNormH * smoothFactor;

    return {
      normX,
      normY,
      normWidth,
      normHeight,
      detected: true,
    };
  }

  return {
    normX: rawNormX,
    normY: rawNormY,
    normWidth: rawNormW,
    normHeight: rawNormH,
    detected: true,
  };
}

/**
 * Applies temporal smoothing and soft Hermite edge feathering to generate an alpha mask.
 */
export function buildSmoothMaskImageData(
  floatMaskData,
  maskWidth,
  maskHeight,
  prevMaskData = null,
  targetImageData = null
) {
  const totalPixels = maskWidth * maskHeight;
  const imgData = targetImageData || new ImageData(maskWidth, maskHeight);
  const pixels = imgData.data;

  // Smoothing weights: 30% history, 70% current frame
  const useTemporal = prevMaskData && prevMaskData.length === totalPixels;

  for (let i = 0; i < totalPixels; i++) {
    let conf = floatMaskData[i];

    if (useTemporal) {
      conf = prevMaskData[i] * 0.30 + conf * 0.70;
      prevMaskData[i] = conf;
    }

    const col = i % maskWidth;
    const normX = col / maskWidth;

    // Soft thresholding for natural contours
    const lowThresh = normX < 0.05 || normX > 0.95 ? 0.58 : 0.40;
    const highThresh = 0.80;

    let alpha = 0;
    if (conf <= lowThresh) {
      alpha = 0;
    } else if (conf >= highThresh) {
      alpha = 255;
    } else {
      // Hermite smoothstep 3t^2 - 2t^3 for clean anti-aliasing
      const t = (conf - lowThresh) / (highThresh - lowThresh);
      alpha = Math.round(t * t * (3 - 2 * t) * 255);
    }

    const p = i * 4;
    pixels[p] = 255;
    pixels[p + 1] = 255;
    pixels[p + 2] = 255;
    pixels[p + 3] = alpha;
  }

  return imgData;
}

/**
 * Crops and masks the video source to produce a clean, transparent person cutout in PERSON SPACE.
 * Strips away all original background and empty margins.
 */
export function cropPersonCutout(
  videoElement,
  maskCanvas,
  bounds,
  outputCanvas
) {
  const vW = videoElement.videoWidth || 640;
  const vH = videoElement.videoHeight || 480;

  const safeBounds = bounds || {
    normX: 0.15,
    normY: 0.05,
    normWidth: 0.70,
    normHeight: 0.90,
  };

  const cropX = Math.max(0, Math.round(safeBounds.normX * vW));
  const cropY = Math.max(0, Math.round(safeBounds.normY * vH));
  const cropW = Math.min(vW - cropX, Math.max(10, Math.round(safeBounds.normWidth * vW)));
  const cropH = Math.min(vH - cropY, Math.max(10, Math.round(safeBounds.normHeight * vH)));

  if (outputCanvas.width !== cropW || outputCanvas.height !== cropH) {
    outputCanvas.width = cropW;
    outputCanvas.height = cropH;
  }

  const ctx = outputCanvas.getContext('2d');
  if (!ctx) return null;

  ctx.save();
  ctx.clearRect(0, 0, cropW, cropH);

  // 1. Draw cropped region of the raw camera frame
  ctx.drawImage(videoElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  // 2. Apply destination-in alpha mask using the matching cropped region of the mask
  ctx.globalCompositeOperation = 'destination-in';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(maskCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  ctx.restore();
  return outputCanvas;
}
