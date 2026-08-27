/**
 * Text Wrapping and Layout Measurement Engine for Canvas
 */

import type { FlowBlock } from './types';

/**
 * Splits text into lines fitting within maxWidth (preserves explicit newlines)
 */
export function getFullLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      if (lines.length > 0 && lines[lines.length - 1] !== '') {
        lines.push('');
      }
      continue;
    }

    const chars = Array.from(trimmed);
    let currentLine = '';

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i] ?? '';
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && i > 0) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

export interface LayoutMetrics {
  titleLines: string[];
  titleHeight: number;
  totalBlocksHeight: number;
}

/**
 * Measures all layout flow blocks and calculates exact vertical dimensions
 */
export function measureLayout(
  flowBlocks: FlowBlock[],
  rawTitle: string,
  contentWidth: number,
): LayoutMetrics {
  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d');
  if (!mCtx) throw new Error('Canvas 2D context not available');

  // Title Lines & Height
  mCtx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const titleLines = getFullLines(mCtx, rawTitle, contentWidth);
  const titleLineHeight = 38;
  const titleHeight = Math.max(38, titleLines.length * titleLineHeight);

  // Measure Each Flow Block
  let totalBlocksHeight = 0;
  for (const block of flowBlocks) {
    if (block.type === 'heading') {
      mCtx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
      const lines = getFullLines(mCtx, block.text, contentWidth);
      block.lines = lines;
      block.blockHeight = 10 + lines.length * 30 + 10;
      totalBlocksHeight += block.blockHeight;
    } else if (block.type === 'paragraph') {
      mCtx.font = '15.5px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
      const lines = getFullLines(mCtx, block.text, contentWidth);
      block.lines = lines;
      block.blockHeight = 6 + lines.length * 28 + 8;
      totalBlocksHeight += block.blockHeight;
    } else if (block.type === 'blockquote') {
      mCtx.font = 'italic 15px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
      const lines = getFullLines(mCtx, block.text, contentWidth - 28);
      block.lines = lines;
      const bqInnerHeight = lines.length * 26 + 16;
      block.blockHeight = 6 + bqInnerHeight + 10;
      totalBlocksHeight += block.blockHeight;
    } else if (block.type === 'list-item') {
      mCtx.font = '15px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
      const lines = getFullLines(mCtx, block.text, contentWidth - 20);
      block.lines = lines;
      block.blockHeight = 4 + lines.length * 26 + 4;
      totalBlocksHeight += block.blockHeight;
    } else if (block.type === 'image' || block.type === 'video') {
      block.blockHeight = 8 + (block.drawHeight || 0) + 16;
      totalBlocksHeight += block.blockHeight;
    }
  }

  return {
    titleLines,
    titleHeight,
    totalBlocksHeight,
  };
}
