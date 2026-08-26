/**
 * Content image card generator using HTML5 Canvas (High DPI Retina 2x + Mixed Document Flow)
 * Ultra-clean, modern minimalist layout with authentic mixed text & image sequence.
 */

import type { GrabbedContent } from '../types';
import { drawQrCodeToCanvas } from './qrCodeGen';

/**
 * Loads an image safely with CORS handling
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * Splits text into lines fitting within maxWidth (preserves explicit newlines)
 */
function getFullLines(
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

// ── Content Block Data Structures ──────────────────────────────────────────

export type BlockType = 'heading' | 'paragraph' | 'blockquote' | 'list-item' | 'image';

export interface BaseBlock {
  type: BlockType;
}

export interface TextBlock extends BaseBlock {
  type: 'heading' | 'paragraph' | 'blockquote' | 'list-item';
  text: string;
  level?: number; // Heading level (1-6)
  lines?: string[];
  blockHeight?: number;
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  src: string;
  alt?: string;
  img?: HTMLImageElement;
  drawWidth?: number;
  drawHeight?: number;
  blockHeight?: number;
}

export type FlowBlock = TextBlock | ImageBlock;

/**
 * Recursively extracts content nodes in natural document order
 */
function extractBlocksFromNode(node: Node, blocks: FlowBlock[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent || '').trim();
    if (text) {
      // Append text block if meaningful
      blocks.push({ type: 'paragraph', text });
    }
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  // 1. Skip non-content tags
  if (['script', 'style', 'noscript', 'svg', 'canvas'].includes(tag)) {
    return;
  }

  // 2. Direct Image element
  if (tag === 'img') {
    const src = (el as HTMLImageElement).src || el.getAttribute('src') || '';
    if (src && !src.startsWith('data:image/svg+xml') && !src.includes('spacer.gif')) {
      blocks.push({
        type: 'image',
        src,
        alt: (el as HTMLImageElement).alt || '',
      });
    }
    return;
  }

  // 3. Headings
  if (/^h[1-6]$/.test(tag)) {
    const text = (el.innerText || el.textContent || '').trim();
    if (text) {
      blocks.push({
        type: 'heading',
        level: parseInt(tag[1] || '2', 10),
        text,
      });
    }
    return;
  }

  // 4. Blockquotes
  if (tag === 'blockquote') {
    const text = (el.innerText || el.textContent || '').trim();
    if (text) {
      blocks.push({
        type: 'blockquote',
        text,
      });
    }
    return;
  }

  // 5. List items
  if (tag === 'li') {
    const hasImg = el.querySelector('img');
    if (!hasImg) {
      const text = (el.innerText || el.textContent || '').trim();
      if (text) {
        blocks.push({
          type: 'list-item',
          text,
        });
      }
      return;
    }
  }

  // 6. Paragraph or container elements
  const hasImages = el.querySelector('img') !== null;
  if (!hasImages && ['p', 'pre', 'code'].includes(tag)) {
    const text = (el.innerText || el.textContent || '').trim();
    if (text) {
      blocks.push({
        type: 'paragraph',
        text,
      });
    }
    return;
  }

  // 7. For containers or mixed elements with child nodes, traverse childNodes sequentially
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child) {
      extractBlocksFromNode(child, blocks);
    }
  }
}

/**
 * Parses selected HTML into an ordered sequence of flow blocks
 */
export function parseHtmlToFlowBlocks(
  html: string,
  fallbackText: string,
  fallbackImages: string[],
): FlowBlock[] {
  const blocks: FlowBlock[] = [];

  if (html && html.trim()) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      for (let i = 0; i < doc.body.childNodes.length; i++) {
        const child = doc.body.childNodes[i];
        if (child) {
          extractBlocksFromNode(child, blocks);
        }
      }
    } catch {
      // Fall through to fallback
    }
  }

  // Merge consecutive short paragraph blocks to improve readability
  const mergedBlocks: FlowBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      const last = mergedBlocks[mergedBlocks.length - 1];
      if (last && last.type === 'paragraph') {
        last.text += '\n' + block.text;
        continue;
      }
    }
    mergedBlocks.push(block);
  }

  // Fallback if parsing produced no valid blocks
  if (mergedBlocks.length === 0) {
    if (fallbackText) {
      mergedBlocks.push({
        type: 'paragraph',
        text: fallbackText,
      });
    }
    for (const imgSrc of fallbackImages) {
      mergedBlocks.push({
        type: 'image',
        src: imgSrc,
      });
    }
  }

  return mergedBlocks;
}

/**
 * Generate a clean, high-resolution snapshot image preserving mixed text and image flow
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

  // 1. Parse HTML into ordered Content Flow Blocks
  const rawBlocks = parseHtmlToFlowBlocks(
    grabbedContent.selectedHtml,
    grabbedContent.selectedText,
    grabbedContent.images || [],
  );

  // 2. Pre-load all Image Blocks asynchronously
  const imageBlocks = rawBlocks.filter((b): b is ImageBlock => b.type === 'image');
  await Promise.all(
    imageBlocks.map(async (block) => {
      try {
        const img = await loadImage(block.src);
        if (img.width >= 24 && img.height >= 24) {
          const aspectRatio = img.width / img.height;
          let drawWidth = contentWidth;
          let drawHeight = contentWidth / aspectRatio;

          // Cap max height per image while preserving aspect ratio
          if (drawHeight > 520) {
            drawHeight = 520;
            drawWidth = Math.min(contentWidth, drawHeight * aspectRatio);
          }

          block.img = img;
          block.drawWidth = drawWidth;
          block.drawHeight = drawHeight;
          block.blockHeight = drawHeight;
        }
      } catch {
        // Skip unloadable image gracefully
      }
    }),
  );

  // Filter out images that failed to load
  const flowBlocks = rawBlocks.filter((b) => {
    if (b.type === 'image') {
      return !!b.img && !!b.drawHeight;
    }
    return true;
  });

  // 3. Temporary Canvas for precise measurement
  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d');
  if (!mCtx) throw new Error('Canvas 2D context not available');

  // Title Lines & Height
  mCtx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const titleLines = getFullLines(mCtx, rawTitle, contentWidth);
  const titleLineHeight = 38;
  const titleHeight = Math.max(38, titleLines.length * titleLineHeight);

  // 4. Measure Each Flow Block with exact matching vertical metrics
  let totalBlocksHeight = 0;
  for (const block of flowBlocks) {
    if (block.type === 'heading') {
      mCtx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
      const lines = getFullLines(mCtx, block.text, contentWidth);
      block.lines = lines;
      // margin-top: 10, lines * 30, margin-bottom: 10
      block.blockHeight = 10 + lines.length * 30 + 10;
      totalBlocksHeight += block.blockHeight;
    } else if (block.type === 'paragraph') {
      mCtx.font = '15.5px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
      const lines = getFullLines(mCtx, block.text, contentWidth);
      block.lines = lines;
      // margin-top: 6, lines * 28, margin-bottom: 8
      block.blockHeight = 6 + lines.length * 28 + 8;
      totalBlocksHeight += block.blockHeight;
    } else if (block.type === 'blockquote') {
      mCtx.font = 'italic 15px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
      const lines = getFullLines(mCtx, block.text, contentWidth - 28);
      block.lines = lines;
      const bqInnerHeight = lines.length * 26 + 16;
      // margin-top: 6, bqInnerHeight, margin-bottom: 10
      block.blockHeight = 6 + bqInnerHeight + 10;
      totalBlocksHeight += block.blockHeight;
    } else if (block.type === 'list-item') {
      mCtx.font = '15px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
      const lines = getFullLines(mCtx, block.text, contentWidth - 20);
      block.lines = lines;
      // margin-top: 4, lines * 26, margin-bottom: 4
      block.blockHeight = 4 + lines.length * 26 + 4;
      totalBlocksHeight += block.blockHeight;
    } else if (block.type === 'image') {
      // margin-top: 8, drawHeight, margin-bottom: 16
      block.blockHeight = 8 + (block.drawHeight || 0) + 16;
      totalBlocksHeight += block.blockHeight;
    }
  }

  // 5. Total Card Dimensions
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

  // 6. Create Real Canvas
  const canvas = document.createElement('canvas');
  canvas.width = totalWidth * scale;
  canvas.height = totalHeight * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context initialization failed');

  // Scale for Retina crispness
  ctx.scale(scale, scale);

  // 7. Draw Fluid Aesthetic Mesh/Glow Background
  const bgGrad = ctx.createLinearGradient(0, 0, totalWidth, totalHeight);
  bgGrad.addColorStop(0, '#eef5ff');
  bgGrad.addColorStop(0.5, '#f8fafc');
  bgGrad.addColorStop(1, '#fdf2f8');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Top-left Sky Blue Aura
  const glowTopLeft = ctx.createRadialGradient(
    totalWidth * 0.15,
    totalHeight * 0.12,
    20,
    totalWidth * 0.15,
    totalHeight * 0.12,
    totalWidth * 0.65,
  );
  glowTopLeft.addColorStop(0, 'rgba(96, 165, 250, 0.42)');
  glowTopLeft.addColorStop(0.5, 'rgba(147, 197, 253, 0.18)');
  glowTopLeft.addColorStop(1, 'rgba(238, 242, 255, 0)');
  ctx.fillStyle = glowTopLeft;
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Bottom-right Sakura Pink Aura
  const glowBottomRight = ctx.createRadialGradient(
    totalWidth * 0.85,
    totalHeight * 0.88,
    20,
    totalWidth * 0.85,
    totalHeight * 0.88,
    totalWidth * 0.65,
  );
  glowBottomRight.addColorStop(0, 'rgba(244, 114, 182, 0.38)');
  glowBottomRight.addColorStop(0.5, 'rgba(249, 168, 212, 0.16)');
  glowBottomRight.addColorStop(1, 'rgba(253, 242, 248, 0)');
  ctx.fillStyle = glowBottomRight;
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // 8. Main Floating White Card Container
  const cardX = outerPadding;
  const cardY = outerPadding;
  const cardW = totalWidth - outerPadding * 2;
  const cardH = mainCardHeight;
  const cardRadius = 24;

  ctx.save();
  ctx.shadowColor = 'rgba(148, 163, 184, 0.22)';
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 14;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, cardRadius);
  ctx.fill();
  ctx.restore();

  // Card border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, cardRadius);
  ctx.stroke();

  // 9. Hero Title
  let cursorY = cardY + innerPadding;
  const contentStartX = cardX + innerPadding;

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

  for (const line of titleLines) {
    ctx.fillText(line, contentStartX, cursorY + 24);
    cursorY += titleLineHeight;
  }

  cursorY += 20;

  // 10. Sequentially Render Flow Blocks (Exact matching metrics)
  for (const block of flowBlocks) {
    if (block.type === 'heading') {
      cursorY += 10;
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

      for (const line of block.lines || []) {
        if (line) ctx.fillText(line, contentStartX, cursorY + 22);
        cursorY += 30;
      }
      cursorY += 10;
    } else if (block.type === 'paragraph') {
      cursorY += 6;
      ctx.fillStyle = '#334155';
      ctx.font = '15.5px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

      for (const line of block.lines || []) {
        if (line) ctx.fillText(line, contentStartX, cursorY + 20);
        cursorY += 28;
      }
      cursorY += 8;
    } else if (block.type === 'blockquote') {
      cursorY += 6;
      const lines = block.lines || [];
      const bqInnerHeight = lines.length * 26 + 16;

      // Quote background bar
      ctx.fillStyle = 'rgba(241, 245, 249, 0.7)';
      ctx.beginPath();
      ctx.roundRect(contentStartX, cursorY, contentWidth, bqInnerHeight, 6);
      ctx.fill();

      // Accent left border
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.roundRect(contentStartX, cursorY, 3.5, bqInnerHeight, 2);
      ctx.fill();

      ctx.fillStyle = '#475569';
      ctx.font = 'italic 15px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

      let lineY = cursorY + 20;
      for (const line of lines) {
        if (line) ctx.fillText(line, contentStartX + 14, lineY);
        lineY += 26;
      }
      cursorY += bqInnerHeight + 10;
    } else if (block.type === 'list-item') {
      cursorY += 4;
      ctx.fillStyle = '#334155';
      ctx.font = '15px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

      // Draw list bullet dot
      ctx.beginPath();
      ctx.arc(contentStartX + 5, cursorY + 12, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f6';
      ctx.fill();

      ctx.fillStyle = '#334155';
      let lineY = cursorY + 18;
      for (const line of block.lines || []) {
        if (line) ctx.fillText(line, contentStartX + 16, lineY);
        lineY += 26;
      }
      cursorY += (block.lines?.length || 1) * 26 + 4;
    } else if (block.type === 'image' && block.img && block.drawWidth && block.drawHeight) {
      cursorY += 8;
      const imgX = contentStartX + (contentWidth - block.drawWidth) / 2;
      const imgY = cursorY;
      const imgRadius = 14;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(imgX, imgY, block.drawWidth, block.drawHeight, imgRadius);
      ctx.clip();

      ctx.drawImage(
        block.img,
        0,
        0,
        block.img.width,
        block.img.height,
        imgX,
        imgY,
        block.drawWidth,
        block.drawHeight,
      );
      ctx.restore();

      ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(imgX, imgY, block.drawWidth, block.drawHeight, imgRadius);
      ctx.stroke();

      cursorY += block.drawHeight + 16;
    }
  }

  cursorY += 24;

  // 11. Minimal Footer Divider
  ctx.strokeStyle = 'rgba(241, 245, 249, 0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(contentStartX, cursorY);
  ctx.lineTo(contentStartX + contentWidth, cursorY);
  ctx.stroke();

  cursorY += 16;

  // Right Side: Standard Scannable QR Code Card
  const qrSize = 76;
  const qrCardX = contentStartX + contentWidth - qrSize;
  const qrCardY = cursorY;

  await drawQrCodeToCanvas(ctx, rawUrl, qrCardX, qrCardY, qrSize, {
    darkColor: '#0f172a',
    lightColor: '#ffffff',
    borderRadius: 8,
  });

  // URL placed directly below QR code
  if (domain) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10.5px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    let displayDomain = domain;
    const maxDomainWidth = qrSize + 24;
    while (displayDomain.length > 3 && ctx.measureText(displayDomain).width > maxDomainWidth) {
      displayDomain = displayDomain.slice(0, -1);
    }
    if (displayDomain !== domain) {
      displayDomain = displayDomain.slice(0, -2) + '...';
    }
    ctx.fillText(displayDomain, qrCardX + qrSize / 2, qrCardY + qrSize + 14);
  }

  // Left Side: Title & Pure Date Timestamp
  const now = new Date();
  const timeStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const leftY = qrCardY + 28;

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 13.5px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  ctx.fillText('扫码阅读原文', contentStartX, leftY);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '11.5px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  ctx.fillText(timeStr, contentStartX, leftY + 20);

  return canvas.toDataURL('image/png');
}
