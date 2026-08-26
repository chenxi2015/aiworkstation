/**
 * High quality share poster / visual card generator using HTML5 Canvas
 */

export interface PosterOptions {
  title: string;
  summary: string;
  url: string;
  coverUrl?: string;
  siteName?: string;
}

/**
 * Wraps canvas text into multiple lines
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 6,
): number {
  const characters = Array.from(text);
  let currentLine = '';
  let lineCount = 0;
  let currentY = y;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i] || '';
    const testLine = currentLine + char;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      if (lineCount >= maxLines - 1) {
        ctx.fillText(currentLine.slice(0, -3) + '...', x, currentY);
        return currentY + lineHeight;
      }
      ctx.fillText(currentLine, x, currentY);
      currentLine = char;
      currentY += lineHeight;
      lineCount++;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    ctx.fillText(currentLine, x, currentY);
    currentY += lineHeight;
  }

  return currentY;
}

/**
 * Loads an image into an HTMLImageElement safely
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
 * Generates a polished share poster as a PNG data URL
 */
export async function generatePosterDataUrl(options: PosterOptions): Promise<string> {
  const width = 800;
  const height = 1100;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('Canvas 2D context not supported');

  // 1. Background Gradient
  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, '#0f172a');
  bgGradient.addColorStop(1, '#1e293b');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Decorative glow
  const glow = ctx.createRadialGradient(width * 0.8, 100, 10, width * 0.8, 100, 400);
  glow.addColorStop(0, 'rgba(59, 130, 246, 0.25)');
  glow.addColorStop(1, 'rgba(59, 130, 246, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // 2. Header / Brand Tag
  let domain = '';
  try {
    domain = new URL(options.url).hostname;
  } catch {
    domain = options.url || 'Webpage';
  }

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('AI WORKSTATION • 采集速递', 50, 70);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(domain, 50, 100);

  // Divider
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(50, 125);
  ctx.lineTo(width - 50, 125);
  ctx.stroke();

  // 3. Title
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  let cursorY = wrapText(ctx, options.title || '精选内容', 50, 180, width - 100, 44, 3);

  cursorY += 20;

  // 4. Optional Cover Image
  if (options.coverUrl) {
    try {
      const coverImg = await loadImage(options.coverUrl);
      const imgHeight = 280;
      const imgWidth = width - 100;
      const imgX = 50;
      const imgY = cursorY;

      // Draw rounded rectangle clip
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(imgX, imgY, imgWidth, imgHeight, 16);
      ctx.clip();

      // Draw cover image centered & filled
      const hRatio = imgWidth / coverImg.width;
      const vRatio = imgHeight / coverImg.height;
      const ratio = Math.max(hRatio, vRatio);
      const centerShiftX = (imgWidth - coverImg.width * ratio) / 2;
      const centerShiftY = (imgHeight - coverImg.height * ratio) / 2;

      ctx.drawImage(
        coverImg,
        0,
        0,
        coverImg.width,
        coverImg.height,
        imgX + centerShiftX,
        imgY + centerShiftY,
        coverImg.width * ratio,
        coverImg.height * ratio,
      );
      ctx.restore();

      cursorY += imgHeight + 30;
    } catch {
      // If image loading fails, skip gracefully
    }
  }

  // 5. Quote / Summary Box
  const summaryBoxY = cursorY;
  const summaryBoxHeight = Math.min(320, height - summaryBoxY - 140);

  ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
  ctx.beginPath();
  ctx.roundRect(50, summaryBoxY, width - 100, summaryBoxHeight, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Summary Text
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  wrapText(ctx, options.summary || '暂无摘要内容', 80, summaryBoxY + 45, width - 160, 32, 7);

  // 6. Footer (Date + Source)
  const footerY = height - 50;
  ctx.fillStyle = '#64748b';
  ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const dateStr = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  ctx.fillText(`生成时间: ${dateStr}`, 50, footerY);

  ctx.textAlign = 'right';
  ctx.fillText('Powered by AI Collector', width - 50, footerY);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png');
}
