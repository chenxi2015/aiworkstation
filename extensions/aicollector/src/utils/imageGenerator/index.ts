/**
 * Content Image Generator Module Entry
 * High DPI Retina 2x image card rendering with mixed document flow and video card placeholders.
 */

import type { GrabbedContent } from '../../types';
import { parseHtmlToFlowBlocks } from './flowBlockConverter';
import { preloadMediaBlocks } from './mediaLoader';
import { measureLayout } from './textMeasurer';
import {
  drawCardBackground,
  drawCardContainer,
  drawFlowBlock,
  drawCardFooter,
} from './canvasRenderer';

export * from './types';
export * from './flowBlockConverter';
export * from './mediaLoader';
export * from './textMeasurer';
export * from './canvasRenderer';

/**
 * Generate a clean, high-resolution snapshot image preserving mixed text, image, and video flow
 */
export async function generateContentImageDataUrl(
  grabbedContent: GrabbedContent,
): Promise<string> {
  const cardWidth = 720;
  const scale = 2; // 2x Retina rendering
  const outerPadding = 24;
  const innerPadding = 36;
  const contentWidth = cardWidth - (outerPadding + innerPadding) * 2;

  const rawTitle = (grabbedContent.tdk?.title || '选区内容').trim();
  const rawUrl = grabbedContent.url || 'https://example.com';

  let domain = '';
  try {
    domain = new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    domain = rawUrl || '';
  }

  // 1. Parse HTML into ordered Content Flow Blocks via AST
  const rawBlocks = parseHtmlToFlowBlocks(
    grabbedContent.selectedHtml,
    grabbedContent.selectedText,
    grabbedContent.images || [],
  );

  // 2. Pre-load all Image and Video Poster Blocks asynchronously
  const flowBlocks = await preloadMediaBlocks(rawBlocks, contentWidth);

  // 3. Layout measurement
  const { titleLines, titleHeight, totalBlocksHeight } = measureLayout(
    flowBlocks,
    rawTitle,
    contentWidth,
  );

  // 4. Calculate Total Card Dimensions
  const footerHeight = 110;
  const mainCardHeight =
    innerPadding +
    titleHeight +
    20 +
    Math.max(20, totalBlocksHeight) +
    24 +
    footerHeight +
    innerPadding;

  const totalWidth = cardWidth;
  const totalHeight = mainCardHeight + outerPadding * 2;

  // 5. Create Canvas
  const canvas = document.createElement('canvas');
  canvas.width = totalWidth * scale;
  canvas.height = totalHeight * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context initialization failed');

  ctx.scale(scale, scale);

  // 6. Draw Mesh Background
  drawCardBackground(ctx, totalWidth, totalHeight);

  // 7. Draw Floating White Container Card
  const cardX = outerPadding;
  const cardY = outerPadding;
  const cardW = totalWidth - outerPadding * 2;
  const cardH = mainCardHeight;
  drawCardContainer(ctx, cardX, cardY, cardW, cardH);

  // 8. Draw Hero Title
  let cursorY = cardY + innerPadding;
  const contentStartX = cardX + innerPadding;

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  for (const line of titleLines) {
    ctx.fillText(line, contentStartX, cursorY + 24);
    cursorY += 38;
  }
  cursorY += 20;

  // 9. Sequentially Render Flow Blocks
  for (const block of flowBlocks) {
    cursorY = drawFlowBlock(ctx, block, contentStartX, contentWidth, cursorY);
  }

  // 10. Draw Footer with QR code
  await drawCardFooter(ctx, rawUrl, domain, contentStartX, contentWidth, cursorY);

  return canvas.toDataURL('image/png');
}
