/**
 * PDF / Document Exporter & Viewer Dispatcher
 *
 * Prepares extracted HTML via Document AST pipeline and dispatches
 * to the modern React-based doc-viewer tab.
 */

import type { GrabbedContent } from '../../types';
import { cleanDocumentTitle, escapeHtml } from './exportUtils';
import { parseHtmlToAst } from '../ast/parser';
import { applyTransforms } from '../ast/transforms/pipeline';
import { defaultAstTransforms } from '../ast';
import { renderAstToHtml } from '../ast/renderers/astToHtml';
import { openDocViewerInNewTab } from '../docViewerHelper';

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
 * Open a dedicated clean DocViewer tab to print / export as PDF with high-fidelity styling
 */
export function exportPdf(
  title: string,
  htmlContent: string,
  pageUrl?: string,
  grabbedContent?: GrabbedContent,
): void {
  openDocViewerInNewTab({
    title,
    htmlContent,
    pageUrl,
    grabbedContent,
  }).catch((err) => {
    console.error('Failed to open doc viewer via helper:', err);
  });
}
