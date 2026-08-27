/**
 * Media Loader for Content Image Generator
 * Asynchronously preloads images and video posters with CORS handling and aspect ratio calculation.
 */

import type { FlowBlock, ImageBlock, VideoCardBlock } from './types';

/**
 * Loads an image safely with CORS handling
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * Preloads all Image and Video Poster blocks and calculates their draw dimensions
 */
export async function preloadMediaBlocks(
  rawBlocks: FlowBlock[],
  contentWidth: number,
  maxMediaHeight = 520,
): Promise<FlowBlock[]> {
  const mediaBlocks = rawBlocks.filter(
    (b): b is ImageBlock | VideoCardBlock => b.type === 'image' || b.type === 'video',
  );

  await Promise.all(
    mediaBlocks.map(async (block) => {
      const srcToLoad = block.type === 'video' ? block.poster : block.src;
      if (!srcToLoad) {
        if (block.type === 'video') {
          // Default 16:9 placeholder for video without poster
          const drawWidth = contentWidth;
          const drawHeight = Math.round(contentWidth * (9 / 16));
          block.drawWidth = drawWidth;
          block.drawHeight = drawHeight;
          block.blockHeight = drawHeight;
        }
        return;
      }

      try {
        const img = await loadImage(srcToLoad);
        if (img.width >= 24 && img.height >= 24) {
          const aspectRatio = img.width / img.height;
          let drawWidth = contentWidth;
          let drawHeight = contentWidth / aspectRatio;

          // Cap max height per media while preserving aspect ratio
          if (drawHeight > maxMediaHeight) {
            drawHeight = maxMediaHeight;
            drawWidth = Math.min(contentWidth, drawHeight * aspectRatio);
          }

          block.img = img;
          block.drawWidth = drawWidth;
          block.drawHeight = drawHeight;
          block.blockHeight = drawHeight;
        }
      } catch {
        if (block.type === 'video') {
          const drawWidth = contentWidth;
          const drawHeight = Math.round(contentWidth * (9 / 16));
          block.drawWidth = drawWidth;
          block.drawHeight = drawHeight;
          block.blockHeight = drawHeight;
        }
      }
    }),
  );

  // Filter out images that failed to load (keep valid videos even if poster failed)
  return rawBlocks.filter((b) => {
    if (b.type === 'image') {
      return !!b.img && !!b.drawHeight;
    }
    if (b.type === 'video') {
      return !!b.drawHeight;
    }
    return true;
  });
}
