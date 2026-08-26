/**
 * High quality share poster generator using HTML5 Canvas (Retina 2x + Adaptive Layout)
 * Ultra-clean, modern minimalist layout without clutter, backgrounds or watermarks.
 */

import { drawQrCodeToCanvas } from './qrCodeGen';

export interface PosterOptions {
  title: string;
  summary: string;
  url: string;
  coverUrl?: string;
  siteName?: string;
}

/**
 * Loads an image into an HTMLImageElement safely with CORS
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
 * Splits text into lines with precise measurement (no arbitrary line truncations)
 */
function getLines(
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

/**
 * Generates an ultra-clean, high-resolution share poster PNG Data URL
 */
export async function generatePosterDataUrl(options: PosterOptions): Promise<string> {
  const cardWidth = 720;
  const scale = 2; // 2x Retina rendering
  const outerPadding = 24;
  const innerPadding = 36;
  const contentWidth = cardWidth - (outerPadding + innerPadding) * 2;

  const rawTitle = (options.title || '精选内容').trim();
  const rawSummary = (options.summary || '暂无摘要内容').trim();
  const rawUrl = options.url || 'https://example.com';

  let domain = '';
  try {
    domain = new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    domain = rawUrl || '';
  }

  // Temporary canvas to measure dynamic heights
  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d');
  if (!mCtx) throw new Error('Canvas 2D context not supported');

  // Title lines (modern clean bold typography)
  mCtx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const titleLines = getLines(mCtx, rawTitle, contentWidth);
  const titleLineHeight = 38;
  const titleHeight = Math.max(38, titleLines.length * titleLineHeight);

  // Optional Cover Image pre-loading
  let coverImg: HTMLImageElement | null = null;
  if (options.coverUrl) {
    try {
      coverImg = await loadImage(options.coverUrl);
    } catch {
      coverImg = null;
    }
  }
  const coverHeight = coverImg ? 260 : 0;

  // Summary lines (clean typography, no background box)
  mCtx.font = '15.5px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const summaryLines = getLines(mCtx, rawSummary, contentWidth);
  const summaryLineHeight = 28;
  const summaryTextHeight = summaryLines.length * summaryLineHeight;

  // Total card height calculation
  const footerHeight = 115;
  const mainCardHeight =
    innerPadding +
    titleHeight +
    24 +
    (coverHeight > 0 ? coverHeight + 20 : 0) +
    summaryTextHeight +
    28 +
    footerHeight +
    innerPadding;

  const totalWidth = cardWidth;
  const totalHeight = mainCardHeight + outerPadding * 2;

  // Real Canvas Creation
  const canvas = document.createElement('canvas');
  canvas.width = totalWidth * scale;
  canvas.height = totalHeight * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context initialization failed');

  // Apply Retina scaling
  ctx.scale(scale, scale);

  // 1. Fluid Aesthetic Mesh/Glow Background
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

  // 2. Main Floating White Card Container
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

  // Clean border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, cardRadius);
  ctx.stroke();

  // 3. Hero Title (Directly at top)
  let cursorY = cardY + innerPadding;
  const contentStartX = cardX + innerPadding;

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

  for (const line of titleLines) {
    ctx.fillText(line, contentStartX, cursorY + 24);
    cursorY += titleLineHeight;
  }

  cursorY += 16;

  // 4. Optional Cover Image Section
  if (coverImg) {
    const imgX = contentStartX;
    const imgY = cursorY;
    const imgW = contentWidth;
    const imgH = coverHeight;
    const imgRadius = 14;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(imgX, imgY, imgW, imgH, imgRadius);
    ctx.clip();

    const hRatio = imgW / coverImg.width;
    const vRatio = imgH / coverImg.height;
    const ratio = Math.max(hRatio, vRatio);
    const cx = (imgW - coverImg.width * ratio) / 2;
    const cy = (imgH - coverImg.height * ratio) / 2;

    ctx.drawImage(
      coverImg,
      0,
      0,
      coverImg.width,
      coverImg.height,
      imgX + cx,
      imgY + cy,
      coverImg.width * ratio,
      coverImg.height * ratio,
    );
    ctx.restore();

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(imgX, imgY, imgW, imgH, imgRadius);
    ctx.stroke();

    cursorY += imgH + 20;
  }

  // 5. Clean Summary Text (No background box)
  ctx.fillStyle = '#334155';
  ctx.font = '15.5px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

  let textY = cursorY + 18;
  for (const line of summaryLines) {
    if (line) {
      ctx.fillText(line, contentStartX, textY);
    }
    textY += summaryLineHeight;
  }

  cursorY = textY + 14;

  // 6. Minimal Footer
  // Subtle divider
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
