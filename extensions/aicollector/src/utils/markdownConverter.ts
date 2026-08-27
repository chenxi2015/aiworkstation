/**
 * HTML to Markdown Converter
 * Powered by Document AST Engine for robust and standard-compliant GFM conversion.
 */

import { parseHtmlToAst } from './ast/parser';
import { applyTransforms } from './ast/transforms/pipeline';
import { defaultAstTransforms } from './ast';
import { renderAstToMarkdown } from './ast/renderers/astToMarkdown';

/**
 * Converts an HTML string into clean, structured Markdown via Document AST
 */
export function htmlToMarkdown(html: string, pageUrl?: string): string {
  if (!html || typeof html !== 'string') return '';

  try {
    const rawAst = parseHtmlToAst(html, pageUrl);
    const cleanAst = applyTransforms(rawAst, ...defaultAstTransforms);
    return renderAstToMarkdown(cleanAst);
  } catch (err) {
    console.error('Failed to convert HTML to Markdown via AST:', err);
    return '';
  }
}
