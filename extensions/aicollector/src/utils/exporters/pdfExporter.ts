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
 * Compact CSS stylesheet for high-contrast PDF export and paper simulation
 */
const PDF_PRINT_CSS = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  :root { color-scheme: light; }
  body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.8; color: #1e293b !important; background-color: #f8fafc; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
  .print-toolbar { position: sticky; top: 0; z-index: 10000; background: #ffffff; border-bottom: 1px solid #e2e8f0; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05); padding: 10px 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; user-select: none; }
  .toolbar-left { display: flex; align-items: center; gap: 12px; font-size: 13px; }
  .toolbar-title { font-weight: 600; color: #0f172a; display: flex; align-items: center; gap: 6px; }
  .toolbar-tip { color: #64748b; font-size: 12px; }
  .toolbar-actions { display: flex; align-items: center; gap: 8px; }
  .btn-print { display: inline-flex; align-items: center; gap: 6px; background: #2563eb; color: #ffffff !important; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; pointer-events: auto; transition: background-color 0.15s, transform 0.05s; }
  .btn-print:hover { background: #1d4ed8; }
  .btn-print:active { transform: scale(0.98); }
  .btn-close { display: inline-flex; align-items: center; background: #f1f5f9; color: #475569 !important; border: 1px solid #cbd5e1; padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; pointer-events: auto; transition: all 0.15s; }
  .btn-close:hover { background: #e2e8f0; color: #1e293b !important; }
  .btn-close:active { transform: scale(0.98); }
  .document-paper { max-width: 820px; margin: 24px auto 40px auto; padding: 40px 48px; background: #ffffff; border-radius: 8px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); border: 1px solid #e2e8f0; }
  .header-box { border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }
  h1.title { font-size: 22px; font-weight: 700; color: #0f172a !important; line-height: 1.4; margin: 0 0 12px 0; letter-spacing: -0.01em; }
  .meta-info { font-size: 12px; color: #64748b; display: flex; flex-wrap: wrap; gap: 16px; line-height: 1.5; }
  .meta-info a { color: #2563eb !important; text-decoration: none; word-break: break-all; }
  .meta-info a:hover { text-decoration: underline; }
  .content-body { font-size: 15px; line-height: 1.85; color: #1e293b !important; word-break: break-word; white-space: pre-wrap; }
  .content-body, .content-body *, .content-body div, .content-body span, .content-body p, .content-body li { color: #1e293b !important; background-color: transparent !important; opacity: 1 !important; text-shadow: none !important; }
  .content-body table, .content-body ul, .content-body ol { white-space: normal; }
  .content-body div { margin-bottom: 0.6em; }
  .content-body p { margin-top: 0; margin-bottom: 14px; text-align: justify; }
  .content-body br { display: block; content: ""; margin-top: 0.5em; }
  .content-body h1 { font-size: 20px; font-weight: 700; color: #0f172a !important; margin-top: 24px; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; }
  .content-body h2 { font-size: 18px; font-weight: 600; color: #0f172a !important; margin-top: 20px; margin-bottom: 10px; }
  .content-body h3 { font-size: 16px; font-weight: 600; color: #1e293b !important; margin-top: 16px; margin-bottom: 8px; }
  .content-body h4, .content-body h5, .content-body h6 { font-size: 14px; font-weight: 600; color: #334155 !important; margin-top: 12px; margin-bottom: 6px; }
  .content-body a, .content-body a * { color: #2563eb !important; text-decoration: underline !important; word-break: break-all; }
  .content-body img { max-width: 100%; height: auto; display: block; margin: 16px auto; border-radius: 8px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08); break-inside: avoid; page-break-inside: avoid; }
  .content-body table { border-collapse: collapse; width: 100%; margin: 18px 0; font-size: 13px; break-inside: avoid; page-break-inside: avoid; }
  .content-body th, .content-body td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
  .content-body th { background-color: #f8fafc !important; font-weight: 600; color: #0f172a !important; }
  .content-body tr:nth-child(even) td { background-color: #fafbfc !important; }
  .content-body blockquote, .content-body blockquote * { color: #334155 !important; }
  .content-body blockquote { border-left: 4px solid #3b82f6 !important; margin: 16px 0; padding: 12px 18px; background-color: #f8fafc !important; border-radius: 0 8px 8px 0; break-inside: avoid; page-break-inside: avoid; }
  .content-body pre { background-color: #0f172a !important; padding: 14px 18px; border-radius: 8px; overflow-x: auto; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; line-height: 1.6; margin: 16px 0; break-inside: avoid; page-break-inside: avoid; }
  .content-body pre, .content-body pre * { color: #f8fafc !important; background-color: transparent !important; }
  .content-body code { background-color: #f1f5f9 !important; color: #0284c7 !important; padding: 2px 6px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; }
  .content-body pre code { background-color: transparent !important; color: inherit !important; padding: 0; }
  .content-body ul, .content-body ol { margin: 10px 0 16px 0; padding-left: 24px; }
  .content-body li { margin-bottom: 6px; }
  .content-body hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
  @media print {
    body { background-color: #ffffff !important; padding: 18mm 16mm !important; }
    .no-print { display: none !important; }
    .document-paper { max-width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
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
      <button id="btn-print-action" type="button" class="btn-print">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
        立即打印 / 另存为 PDF
      </button>
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
      if (printBtn) {
        printBtn.addEventListener('click', function(e) {
          e.preventDefault();
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

      // 2. Auto trigger print when images are fully decoded
      var images = Array.from(document.querySelectorAll('.content-body img'));
      var printTriggered = false;

      function triggerPrint() {
        if (printTriggered) return;
        printTriggered = true;
        window.focus();
        window.print();
      }

      if (images.length === 0) {
        setTimeout(triggerPrint, 350);
      } else {
        var pending = images.length;
        function checkImage() {
          pending--;
          if (pending <= 0) {
            setTimeout(triggerPrint, 350);
          }
        }
        images.forEach(function(img) {
          if (img.complete) {
            checkImage();
          } else {
            img.onload = checkImage;
            img.onerror = checkImage;
          }
        });
        // Fallback timeout in case any image takes too long
        setTimeout(triggerPrint, 2500);
      }
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
          if (printBtn) {
            printBtn.onclick = (e: MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
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

      // Auto trigger print when images are fully ready
      const doc = printWindow.document;
      const images = Array.from(doc.querySelectorAll('.content-body img')) as HTMLImageElement[];
      let printFired = false;
      const triggerPrint = () => {
        if (printFired || printWindow.closed) return;
        printFired = true;
        printWindow.focus();
        printWindow.print();
      };

      if (images.length === 0) {
        setTimeout(triggerPrint, 350);
      } else {
        let remaining = images.length;
        const checkDone = () => {
          remaining--;
          if (remaining <= 0) {
            setTimeout(triggerPrint, 350);
          }
        };
        images.forEach((img) => {
          if (img.complete && img.naturalWidth > 0) {
            checkDone();
          } else {
            img.onload = checkDone;
            img.onerror = checkDone;
          }
        });
        setTimeout(triggerPrint, 2500);
      }

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
