/**
 * PDF document exporter and print renderer with high-contrast typography,
 * dark-mode sanitization, preserved paragraph whitespace, and CSP-compliant button controls.
 */

import type { GrabbedContent } from '../../types';
import { cleanDocumentTitle, escapeHtml } from './exportUtils';
import { parseHtmlToAst } from '../ast/parser';
import { applyTransforms } from '../ast/transforms/pipeline';
import { defaultAstTransforms } from '../ast';
import { renderAstToHtml } from '../ast/renderers/astToHtml';

/**
 * Sanitizes and cleans extracted HTML snippet for PDF / print rendering via Document AST
 */
export function prepareHtmlForPdf(
  rawHtml: string,
  pageUrl?: string,
  grabbedContent?: GrabbedContent,
): string {
  if (!rawHtml || !rawHtml.trim()) {
    if (grabbedContent?.selectedText) {
      return grabbedContent.selectedText
        .split('\n\n')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join('\n');
    }
    return '<p class="empty-content">（暂无正文内容）</p>';
  }

  try {
    const rawAst = parseHtmlToAst(rawHtml, pageUrl);
    const cleanAst = applyTransforms(rawAst, ...defaultAstTransforms);
    const rendered = renderAstToHtml(cleanAst);
    return rendered || '<p class="empty-content">（暂无正文内容）</p>';
  } catch (err) {
    console.warn('Failed to prepare HTML for PDF via AST:', err);
    return rawHtml;
  }
}


/**
 * Enhanced modern CSS stylesheet for high-fidelity PDF export, print simulation, and media containment
 */
const PDF_PRINT_CSS = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  :root { color-scheme: light; }
  body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    line-height: 1.8;
    color: #1e293b;
    background-color: #f8fafc;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  .print-toolbar {
    position: sticky;
    top: 0;
    z-index: 10000;
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
    padding: 10px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    user-select: none;
    overflow: visible;
  }
  .toolbar-left { display: flex; align-items: center; gap: 12px; font-size: 13px; }
  .toolbar-title { font-weight: 600; color: #0f172a; display: flex; align-items: center; gap: 6px; }
  .toolbar-tip { color: #64748b; font-size: 12px; }
  .toolbar-actions { display: flex; align-items: center; gap: 10px; position: relative; }
  
  /* Print button wrapper & tooltip */
  .btn-print-container {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
  .btn-print {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #2563eb;
    color: #ffffff !important;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    pointer-events: auto;
    transition: background-color 0.15s, transform 0.05s, box-shadow 0.2s;
    box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4);
    animation: print-btn-pulse 2.4s infinite;
  }
  @keyframes print-btn-pulse {
    0% {
      box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.45);
    }
    65% {
      box-shadow: 0 0 0 7px rgba(37, 99, 235, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(37, 99, 235, 0);
    }
  }
  .btn-print:hover {
    background: #1d4ed8;
    animation: none;
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.35);
  }
  .btn-print:active { transform: scale(0.98); }

  /* Interactive Guide Tooltip */
  .print-tooltip {
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    width: 250px;
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(8px);
    color: #ffffff;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.5;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
    z-index: 10001;
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
    transform: translateY(-4px);
    transition: opacity 0.25s ease, transform 0.25s ease, visibility 0.25s;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .print-tooltip-arrow {
    position: absolute;
    top: -5px;
    right: 36px;
    width: 10px;
    height: 10px;
    background: rgba(15, 23, 42, 0.95);
    transform: rotate(45deg);
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }
  .btn-print-container:hover .print-tooltip,
  .print-tooltip.guide-visible {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
    pointer-events: auto;
  }
  .print-tooltip-header {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #60a5fa;
    font-weight: 600;
    font-size: 12.5px;
    margin-bottom: 4px;
  }
  .print-tooltip-content {
    color: #cbd5e1;
    font-size: 11.5px;
    line-height: 1.45;
  }
  .print-tooltip-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    margin-top: 6px;
  }
  .print-tooltip-kbd {
    display: inline-block;
    padding: 1px 6px;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 10px;
    color: #93c5fd;
  }

  .btn-close {
    display: inline-flex;
    align-items: center;
    background: #f1f5f9;
    color: #475569 !important;
    border: 1px solid #cbd5e1;
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    pointer-events: auto;
    transition: all 0.15s;
  }
  .btn-close:hover { background: #e2e8f0; color: #1e293b !important; }
  .btn-close:active { transform: scale(0.98); }

  .document-paper {
    max-width: 820px;
    margin: 24px auto 40px auto;
    padding: 40px 48px;
    background: #ffffff;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    border: 1px solid #e2e8f0;
    overflow-wrap: break-word;
    word-break: break-word;
  }
  .header-box { border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }
  h1.title { font-size: 22px; font-weight: 700; color: #0f172a !important; line-height: 1.4; margin: 0 0 12px 0; letter-spacing: -0.01em; }
  .meta-info { font-size: 12px; color: #64748b; display: flex; flex-wrap: wrap; gap: 16px; line-height: 1.5; }
  .meta-info a { color: #2563eb !important; text-decoration: none; word-break: break-all; }
  .meta-info a:hover { text-decoration: underline; }

  /* Content Body & AST Semantic Styling */
  .content-body {
    font-size: 15px;
    line-height: 1.85;
    color: #1e293b;
    word-break: break-word;
    white-space: normal;
  }
  .document-ast-root {
    width: 100%;
  }
  .content-body div { margin-bottom: 0.6em; }
  .content-body p { margin-top: 0; margin-bottom: 14px; text-align: justify; }
  .content-body br { display: block; content: ""; margin-top: 0.5em; }

  /* Headings Hierarchy */
  .content-body h1 { font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 28px; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; }
  .content-body h2 { font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 24px; margin-bottom: 10px; }
  .content-body h3 { font-size: 16px; font-weight: 600; color: #1e293b; margin-top: 20px; margin-bottom: 8px; }
  .content-body h4, .content-body h5, .content-body h6 { font-size: 14px; font-weight: 600; color: #334155; margin-top: 14px; margin-bottom: 6px; }
  .content-body a { color: #2563eb; text-decoration: underline; word-break: break-all; }

  /* Media & Container Constraints (Prevent Overflow) */
  .content-body img,
  .content-body video,
  .content-body iframe,
  .content-body embed,
  .content-body object {
    max-width: 100% !important;
    box-sizing: border-box;
  }

  /* Image Figures */
  .ast-image-card {
    margin: 20px 0;
    padding: 0;
    text-align: center;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .ast-image-card img,
  .content-body img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 0 auto;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  }
  .ast-image-caption,
  figcaption {
    margin-top: 8px;
    font-size: 12px;
    color: #64748b;
    text-align: center;
  }

  /* Video Card Container */
  .ast-video-card {
    width: 100%;
    max-width: 100%;
    margin: 20px 0;
    background: #0f172a;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .ast-video-card video,
  .content-body video {
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
    display: block;
    background: #000000;
  }
  .ast-video-caption {
    padding: 8px 14px;
    font-size: 12px;
    color: #94a3b8;
    background: #1e293b;
    border-top: 1px solid #334155;
  }

  /* Tables */
  .content-body table {
    border-collapse: collapse;
    width: 100%;
    margin: 20px 0;
    font-size: 13.5px;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .content-body th, .content-body td {
    border: 1px solid #e2e8f0;
    padding: 10px 14px;
    text-align: left;
  }
  .content-body th {
    background-color: #f1f5f9;
    font-weight: 600;
    color: #0f172a;
  }
  .content-body tr:nth-child(even) td {
    background-color: #f8fafc;
  }
  .content-body caption {
    font-size: 12px;
    color: #64748b;
    margin-bottom: 6px;
    font-weight: 500;
  }

  /* Blockquote */
  .content-body blockquote {
    border-left: 4px solid #3b82f6;
    margin: 18px 0;
    padding: 12px 20px;
    background-color: #f8fafc;
    color: #334155;
    border-radius: 0 8px 8px 0;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .content-body blockquote p {
    margin: 0;
    color: #334155;
  }

  /* Code & Syntax */
  .content-body pre {
    background-color: #0f172a !important;
    color: #f8fafc !important;
    padding: 14px 18px;
    border-radius: 8px;
    overflow-x: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 13px;
    line-height: 1.6;
    margin: 18px 0;
    white-space: pre-wrap;
    word-break: break-all;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .content-body pre code {
    background-color: transparent !important;
    color: #f8fafc !important;
    padding: 0;
    font-size: 13px;
  }
  .content-body code {
    background-color: #f1f5f9;
    color: #0284c7;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 13px;
  }

  /* Lists & Dividers */
  .content-body ul, .content-body ol { margin: 10px 0 16px 0; padding-left: 24px; }
  .content-body li { margin-bottom: 6px; }
  .content-body hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }

  /* Print Specific Optimization */
  @media print {
    html, body {
      background-color: #ffffff !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    body {
      padding: 0 !important;
    }
    .no-print {
      display: none !important;
    }
    .document-paper {
      max-width: 100% !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }
    .ast-video-card,
    .ast-image-card,
    pre,
    blockquote,
    table {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
`;

/**
 * Open a dedicated clean print window to print / export as PDF with high-fidelity styling
 */
export function exportPdf(
  title: string,
  htmlContent: string,
  pageUrl?: string,
  grabbedContent?: GrabbedContent,
): void {
  const cleanTitle = cleanDocumentTitle(title);
  const sanitizedHtml = prepareHtmlForPdf(htmlContent, pageUrl, grabbedContent);

  const exportDate = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(cleanTitle)}</title>
  ${pageUrl ? `<base href="${escapeHtml(pageUrl)}">` : ''}
  <style>${PDF_PRINT_CSS}</style>
</head>
<body>
  <div class="print-toolbar no-print">
    <div class="toolbar-left">
      <span class="toolbar-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
        PDF 导出与打印预览
      </span>
      <span class="toolbar-tip">💡 提示：在打印设置中将「目标打印机」设为「另存为 PDF」即可保存干净文档。</span>
    </div>
    <div class="toolbar-actions">
      <div class="btn-print-container">
        <button id="btn-print-action" type="button" class="btn-print" aria-describedby="print-tooltip">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
          立即打印 / 另存为 PDF
        </button>
        <div id="print-tooltip" class="print-tooltip guide-visible" role="tooltip">
          <div class="print-tooltip-arrow"></div>
          <div class="print-tooltip-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>点击此处导出 PDF</span>
          </div>
          <div class="print-tooltip-content">
            点击按钮调出系统打印，将「目标打印机」设为「另存为 PDF」即可保存。
          </div>
          <div class="print-tooltip-footer">
            <span class="print-tooltip-kbd">⌘ / Ctrl + P</span>
          </div>
        </div>
      </div>
      <button id="btn-close-action" type="button" class="btn-close">
        关闭窗口
      </button>
    </div>
  </div>

  <div class="document-paper">
    <div class="header-box">
      <h1 class="title">${escapeHtml(cleanTitle)}</h1>
      <div class="meta-info">
        ${pageUrl ? `<span><strong>来源:</strong> <a href="${escapeHtml(pageUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(pageUrl)}</a></span>` : ''}
        <span><strong>采集时间:</strong> ${exportDate}</span>
      </div>
    </div>
    <div class="content-body">
      ${sanitizedHtml}
    </div>
  </div>

  <script>
    (function() {
      // 1. Bind action buttons via addEventListener to comply with CSP
      var printBtn = document.getElementById('btn-print-action');
      var tooltip = document.getElementById('print-tooltip');

      function hideGuideTooltip() {
        if (tooltip) {
          tooltip.classList.remove('guide-visible');
        }
      }

      if (printBtn) {
        printBtn.addEventListener('click', function(e) {
          e.preventDefault();
          hideGuideTooltip();
          window.focus();
          window.print();
        });
      }

      var closeBtn = document.getElementById('btn-close-action');
      if (closeBtn) {
        closeBtn.addEventListener('click', function(e) {
          e.preventDefault();
          try {
            window.close();
          } catch (err) {}
          setTimeout(function() {
            if (!window.closed) {
              window.open('', '_self', '');
              window.close();
            }
          }, 100);
        });
      }

      // Keyboard shortcut for printing
      window.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
          e.preventDefault();
          hideGuideTooltip();
          window.focus();
          window.print();
        }
      });

      // Auto dismiss initial guide tooltip after 6 seconds or on document click
      var guideTimer = setTimeout(hideGuideTooltip, 6000);
      document.addEventListener('click', function(e) {
        if (!e.target.closest || !e.target.closest('.btn-print-container')) {
          clearTimeout(guideTimer);
          hideGuideTooltip();
        }
      });
    })();
  </script>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    try {
      printWindow.document.open();
      printWindow.document.write(fullHtml);
      printWindow.document.close();

      // Bind button events directly from the parent execution context to bypass CSP limitations
      const setupListeners = () => {
        try {
          const doc = printWindow.document;
          if (!doc) return;

          const printBtn = doc.getElementById('btn-print-action');
          const tooltip = doc.getElementById('print-tooltip');
          if (printBtn) {
            printBtn.onclick = (e: MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              if (tooltip) tooltip.classList.remove('guide-visible');
              printWindow.focus();
              printWindow.print();
            };
          }

          const closeBtn = doc.getElementById('btn-close-action');
          if (closeBtn) {
            closeBtn.onclick = (e: MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              printWindow.close();
            };
          }
        } catch (err) {
          console.warn('Could not attach printWindow listeners:', err);
        }
      };

      setupListeners();
      setTimeout(setupListeners, 100);
      setTimeout(setupListeners, 300);
      return;
    } catch (e) {
      console.warn('Failed to write to printWindow, falling back to Blob:', e);
    }
  }

  // Fallback: Use Blob URL if window.open writing failed or was restricted
  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const blobWindow = window.open(blobUrl, '_blank');
  if (!blobWindow) {
    alert('请允许弹出窗口以便生成 PDF / 打印');
  }
}
