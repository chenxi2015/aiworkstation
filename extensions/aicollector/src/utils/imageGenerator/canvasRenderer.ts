/**
 * Canvas Drawing and Layout Renderer for Content Image Cards
 */

import { drawQrCodeToCanvas } from '../qrCodeGen';
import type { FlowBlock, VideoCardBlock } from './types';

/**
 * Draws background glow gradients
 */
export function drawCardBackground(
  ctx: CanvasRenderingContext2D,
  totalWidth: number,
  totalHeight: number,
): void {
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
}

/**
 * Draws the floating white rounded card container
 */
export function drawCardContainer(
  ctx: CanvasRenderingContext2D,
  cardX: number,
  cardY: number,
  cardW: number,
  cardH: number,
  cardRadius = 24,
): void {
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
}

/**
 * Draws the video poster block with glassmorphism center play button
 */
function drawVideoBlock(
  ctx: CanvasRenderingContext2D,
  block: VideoCardBlock,
  contentStartX: number,
  contentWidth: number,
  cursorY: number,
): number {
  if (!block.drawWidth || !block.drawHeight) return cursorY;

  cursorY += 8;
  const vidX = contentStartX + (contentWidth - block.drawWidth) / 2;
  const vidY = cursorY;
  const vidRadius = 14;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(vidX, vidY, block.drawWidth, block.drawHeight, vidRadius);
  ctx.clip();

  if (block.img) {
    ctx.drawImage(
      block.img,
      0,
      0,
      block.img.width,
      block.img.height,
      vidX,
      vidY,
      block.drawWidth,
      block.drawHeight,
    );

    // Dark gradient overlay for visual contrast
    const overlayGrad = ctx.createLinearGradient(vidX, vidY, vidX, vidY + block.drawHeight);
    overlayGrad.addColorStop(0, 'rgba(0, 0, 0, 0.1)');
    overlayGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.25)');
    overlayGrad.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
    ctx.fillStyle = overlayGrad;
    ctx.fillRect(vidX, vidY, block.drawWidth, block.drawHeight);
  } else {
    // Sleek dark fallback canvas for video placeholder
    const fallbackGrad = ctx.createLinearGradient(vidX, vidY, vidX, vidY + block.drawHeight);
    fallbackGrad.addColorStop(0, '#0f172a');
    fallbackGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = fallbackGrad;
    ctx.fillRect(vidX, vidY, block.drawWidth, block.drawHeight);
  }

  // Center Glassmorphism Play Button (▶)
  const centerX = vidX + block.drawWidth / 2;
  const centerY = vidY + block.drawHeight / 2;
  const playRadius = 26;

  ctx.beginPath();
  ctx.arc(centerX, centerY, playRadius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Play triangle icon
  ctx.beginPath();
  const triSize = 10;
  ctx.moveTo(centerX - triSize * 0.6, centerY - triSize);
  ctx.lineTo(centerX + triSize * 1.1, centerY);
  ctx.lineTo(centerX - triSize * 0.6, centerY + triSize);
  ctx.closePath();
  ctx.fillStyle = '#0f172a';
  ctx.fill();

  // Top-left "▶ 视频" badge
  const badgeX = vidX + 12;
  const badgeY = vidY + 12;
  const badgeW = 56;
  const badgeH = 22;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('▶ 视频', badgeX + badgeW / 2, badgeY + 15);
  ctx.textAlign = 'left';

  // Bottom title if available
  if (block.title) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 4;
    ctx.fillText(block.title, vidX + 14, vidY + block.drawHeight - 14);
    ctx.shadowBlur = 0;
  }

  ctx.restore();

  // Outer border
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(vidX, vidY, block.drawWidth, block.drawHeight, vidRadius);
  ctx.stroke();

  return cursorY + block.drawHeight + 16;
}

/**
 * Draws each individual flow block onto Canvas
 */
export function drawFlowBlock(
  ctx: CanvasRenderingContext2D,
  block: FlowBlock,
  contentStartX: number,
  contentWidth: number,
  cursorY: number,
): number {
  if (block.type === 'heading') {
    cursorY += 10;
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

    for (const line of block.lines || []) {
      if (line) ctx.fillText(line, contentStartX, cursorY + 22);
      cursorY += 30;
    }
    return cursorY + 10;
  }

  if (block.type === 'paragraph') {
    cursorY += 6;
    ctx.fillStyle = '#334155';
    ctx.font = '15.5px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

    for (const line of block.lines || []) {
      if (line) ctx.fillText(line, contentStartX, cursorY + 20);
      cursorY += 28;
    }
    return cursorY + 8;
  }

  if (block.type === 'blockquote') {
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
    return cursorY + bqInnerHeight + 10;
  }

  if (block.type === 'list-item') {
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
    return cursorY + (block.lines?.length || 1) * 26 + 4;
  }

  if (block.type === 'image' && block.img && block.drawWidth && block.drawHeight) {
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

    return cursorY + block.drawHeight + 16;
  }

  if (block.type === 'video') {
    return drawVideoBlock(ctx, block as VideoCardBlock, contentStartX, contentWidth, cursorY);
  }

  return cursorY;
}

/**
 * Draws the minimal footer with metadata and scannable QR code
 */
export async function drawCardFooter(
  ctx: CanvasRenderingContext2D,
  rawUrl: string,
  domain: string,
  contentStartX: number,
  contentWidth: number,
  cursorY: number,
): Promise<void> {
  cursorY += 24;

  // Minimal Footer Divider
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
}
