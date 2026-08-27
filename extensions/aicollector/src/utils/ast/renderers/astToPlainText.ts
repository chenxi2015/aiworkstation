/**
 * AST to Plain Text Renderer
 * Extracts structured, human-readable plain text without Markdown or HTML syntax.
 */

import type { DocumentAST, BlockNode, InlineNode } from '../types';

/**
 * Extracts plain text from an inline node
 */
export function renderInlineToPlainText(node: InlineNode): string {
  switch (node.type) {
    case 'text':
    case 'inline_code':
      return node.value;
    case 'link':
    case 'formatted':
      return node.children.map(renderInlineToPlainText).join('');
    default:
      return '';
  }
}

/**
 * Extracts plain text from a block node
 */
export function renderBlockToPlainText(block: BlockNode): string {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
      return block.children.map(renderInlineToPlainText).join('').trim();

    case 'blockquote':
      return block.children
        .map((c) => ('children' in c && c.type === 'paragraph' ? renderBlockToPlainText(c) : renderInlineToPlainText(c as InlineNode)))
        .join('')
        .trim();

    case 'code':
      return block.code.trim();

    case 'list':
      return block.items
        .map((item, idx) => {
          const marker = block.ordered ? `${(block.start || 1) + idx}. ` : '• ';
          const text = item.children
            .map((c) => ('children' in c && c.type === 'paragraph' ? renderBlockToPlainText(c) : renderInlineToPlainText(c as InlineNode)))
            .join('')
            .trim();
          return `${marker}${text}`;
        })
        .join('\n');

    case 'table': {
      const rows = [block.headers, ...block.rows].filter((r) => r.length > 0);
      return rows.map((row) => row.join('\t')).join('\n');
    }

    case 'image':
      return block.alt ? `[图片: ${block.alt}]` : '[图片]';

    case 'video':
      return block.title ? `[视频: ${block.title}]` : '[视频]';

    case 'divider':
      return '----------------';

    default:
      return '';
  }
}

/**
 * Renders an entire DocumentAST to clean plain text
 */
export function renderAstToPlainText(ast: DocumentAST): string {
  return ast.children
    .map(renderBlockToPlainText)
    .filter((text) => text.length > 0)
    .join('\n\n')
    .trim();
}
