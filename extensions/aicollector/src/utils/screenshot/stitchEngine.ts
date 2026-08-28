/**
 * Stitching and Cropping Engine (几何裁剪与画布无缝合成引擎)
 *
 * Computes exact non-overlapping geometry from captured slices and renders them
 * onto a clean, device-scaled master canvas.
 */

import type { AreaPageRect, CapturedSlice, ScreenshotOptions } from './types';
import { getScrollPosition, loadImage } from './domUtils';

/**
 * Single shot crop for areas already completely visible within current viewport
 */
export async function cropSingleViewport(
  rawTabScreenshotDataUrl: string,
  pageRect: AreaPageRect,
  viewportW: number,
  viewportH: number,
  backgroundColor = '#ffffff',
): Promise<string | undefined> {
  try {
    const img = await loadImage(rawTabScreenshotDataUrl);
    const scaleX = img.naturalWidth / viewportW;
    const scaleY = img.naturalHeight / viewportH;

    const { x: scrollX, y: scrollY } = getScrollPosition(window);
    const clientLeft = pageRect.left - scrollX;
    const clientTop = pageRect.top - scrollY;

    const sx = Math.max(0, Math.round(clientLeft * scaleX));
    const sy = Math.max(0, Math.round(clientTop * scaleY));
    const sw = Math.min(img.naturalWidth - sx, Math.round(pageRect.width * scaleX));
    const sh = Math.min(img.naturalHeight - sy, Math.round(pageRect.height * scaleY));

    if (sw <= 0 || sh <= 0) return undefined;

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    // Fill clean background to avoid dark/gray transparency artifacts
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, sw, sh);

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('[AI Collector] Single viewport crop failed:', err);
    return undefined;
  }
}

/**
 * Seamlessly post-stitch multiple slices onto a master canvas
 */
export async function stitchSlicesToCanvas(
  slices: CapturedSlice[],
  pageRect: AreaPageRect,
  targetEndY: number,
  viewportW: number,
  viewportH: number,
  options: ScreenshotOptions = {},
): Promise<HTMLCanvasElement | undefined> {
  const firstSlice = slices[0];
  if (!firstSlice || !pageRect || pageRect.width <= 0 || pageRect.height <= 0) {
    return undefined;
  }

  const { backgroundColor = '#ffffff' } = options;

  // Load first image to extract device scale factor
  const firstImg = await loadImage(firstSlice.dataUrl);
  if (!firstImg.naturalWidth || !firstImg.naturalHeight) {
    console.warn('[AI Collector] First slice image failed to decode, aborting stitch');
    return undefined;
  }
  const scaleX = firstImg.naturalWidth / viewportW;
  const scaleY = firstImg.naturalHeight / viewportH;

  // Determine total actual height covered by all captured slices, using each
  // slice's EFFECTIVE content region (scrollY + offsetY + height) rather than
  // the raw frame height — nested containers only scroll within their own box.
  const maxCoveredPageBottom = Math.min(
    targetEndY,
    Math.max(...slices.map((s) => s.scrollY + s.offsetY + s.height)),
  );
  const actualTotalHeight = Math.max(1, maxCoveredPageBottom - pageRect.top);

  const masterCanvas = document.createElement('canvas');
  masterCanvas.width = Math.max(1, Math.round(pageRect.width * scaleX));
  masterCanvas.height = Math.max(1, Math.round(actualTotalHeight * scaleY));

  const masterCtx = masterCanvas.getContext('2d', { willReadFrequently: false });
  if (!masterCtx) return undefined;

  // Fill initial background to eliminate blank/dark gaps completely
  masterCtx.fillStyle = backgroundColor;
  masterCtx.fillRect(0, 0, masterCanvas.width, masterCanvas.height);

  let renderedPageY = pageRect.top;

  // Sort slices strictly by effective vertical top coordinate to prevent out-of-order stitching
  const sortedSlices = [...slices].sort((a, b) => (a.scrollY + a.offsetY) - (b.scrollY + b.offsetY));

  console.groupCollapsed(
    `%c🧩 [AI Collector 截图合成] 共 ${sortedSlices.length} 个切片开始无缝拼接`,
    'font-weight: bold; color: #059669; background: #ecfdf5; padding: 2px 6px; border-radius: 4px;',
  );

  for (const [i, slice] of sortedSlices.entries()) {
    const img = i === 0 && firstSlice === slice ? firstImg : await loadImage(slice.dataUrl);
    if (!img.naturalWidth || !img.naturalHeight) {
      console.warn(`切片 #${i + 1} 图像解码失败，跳过`);
      continue;
    }

    // Effective content bounds of this slice in unified page coordinates.
    // Pixels outside [offsetX/offsetY, +width/+height] are static page chrome
    // around a nested container and must never be sampled.
    const sliceTop = slice.scrollY + slice.offsetY;
    const sliceBottom = sliceTop + slice.height;
    const sliceLeft = slice.scrollX + slice.offsetX;
    const sliceRight = sliceLeft + slice.width;

    // Only extract unrendered vertical segment [renderedPageY, targetEndY]
    const needTop = renderedPageY;
    const needBottom = targetEndY;

    // Calculate intersection between this slice and unrendered target region
    const clipTop = Math.max(sliceTop, needTop);
    const clipBottom = Math.min(sliceBottom, needBottom);
    const clipLeft = Math.max(sliceLeft, pageRect.left);
    const clipRight = Math.min(sliceRight, pageRect.left + pageRect.width);

    const clipH = Math.max(0, clipBottom - clipTop);
    const clipW = Math.max(0, clipRight - clipLeft);

    if (clipH > 0 && clipW > 0) {
      // Source bitmap bounds (client point => page point: pageX = cx + scrollX)
      const sx = Math.max(0, Math.round((clipLeft - slice.scrollX) * scaleX));
      const sy = Math.max(0, Math.round((clipTop - slice.scrollY) * scaleY));
      const sw = Math.min(img.naturalWidth - sx, Math.round(clipW * scaleX));
      const sh = Math.min(img.naturalHeight - sy, Math.round(clipH * scaleY));

      if (sw <= 0 || sh <= 0) {
        console.log(`切片 #${i + 1} 裁剪结果为空，跳过`);
        continue;
      }

      // Destination coordinates on master canvas
      const dx = Math.max(0, Math.round((clipLeft - pageRect.left) * scaleX));
      const dy = Math.max(0, Math.round((clipTop - pageRect.top) * scaleY));

      masterCtx.drawImage(img, sx, sy, sw, sh, dx, dy, sw, sh);

      console.log(`切片 #${i + 1} 拼接:`, {
        切片范围: `[${sliceTop}, ${sliceBottom}]`,
        待拼接起点: needTop,
        有效裁剪: `[${clipTop}, ${clipBottom}] (高: ${clipH}px)`,
        画布绘制目标: { dx, dy, sw, sh },
        推进高度Y: clipBottom,
      });

      renderedPageY = clipBottom;
    } else {
      // Slice is already completely covered by earlier slices or above current rendering line
      console.log(`切片 #${i + 1} 无新增区域 (已在之前切片中包含)`);
    }

    if (renderedPageY >= targetEndY) {
      break;
    }
  }
  console.groupEnd();

  // If final rendered height is smaller than master canvas, crop excess bottom cleanly
  const finalRenderedDeviceH = Math.max(1, Math.round((renderedPageY - pageRect.top) * scaleY));
  if (finalRenderedDeviceH < masterCanvas.height) {
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = masterCanvas.width;
    croppedCanvas.height = finalRenderedDeviceH;
    const croppedCtx = croppedCanvas.getContext('2d');
    if (croppedCtx) {
      croppedCtx.drawImage(masterCanvas, 0, 0);
      return croppedCanvas;
    }
  }

  return masterCanvas;
}

/**
 * Stitch slices and output as PNG DataURL
 */
export async function stitchSlicesToDataUrl(
  slices: CapturedSlice[],
  pageRect: AreaPageRect,
  targetEndY: number,
  viewportW: number,
  viewportH: number,
  options: ScreenshotOptions = {},
): Promise<string | undefined> {
  const canvas = await stitchSlicesToCanvas(
    slices,
    pageRect,
    targetEndY,
    viewportW,
    viewportH,
    options,
  );
  return canvas?.toDataURL('image/png');
}
