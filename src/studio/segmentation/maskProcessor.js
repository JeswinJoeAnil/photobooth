/**
 * Studio Mask Processor
 * High-performance edge smoothing and alpha mask application.
 * Shows natural camera perspective without active dynamic auto-resizing.
 */

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
    const lowThresh = normX < 0.06 || normX > 0.94 ? 0.58 : 0.42;
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
 * Applies the alpha mask to the full video frame to produce a transparent cutout
 * showing exactly what the camera captures without dynamic crop resizing.
 */
export function applyAlphaMaskToVideo(
  videoElement,
  maskCanvas,
  outputCanvas
) {
  const vW = videoElement.videoWidth || 640;
  const vH = videoElement.videoHeight || 480;

  if (outputCanvas.width !== vW || outputCanvas.height !== vH) {
    outputCanvas.width = vW;
    outputCanvas.height = vH;
  }

  const ctx = outputCanvas.getContext('2d');
  if (!ctx) return null;

  ctx.save();
  ctx.clearRect(0, 0, vW, vH);

  // 1. Draw full video frame as captured
  ctx.drawImage(videoElement, 0, 0, vW, vH);

  // 2. Apply destination-in alpha mask across full frame
  ctx.globalCompositeOperation = 'destination-in';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(maskCanvas, 0, 0, vW, vH);

  ctx.restore();
  return outputCanvas;
}
