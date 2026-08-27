/**
 * Prune Empty AST Transform
 * Removes empty paragraphs, empty headings, and excessive whitespace.
 */

import type { DocumentAST, ASTTransform, BlockNode, InlineNode } from '../types';
import { traverseAst } from '../visitor';

/**
 * Checks whether an inline node has non-empty text content
 */
function hasInlineContent(node: InlineNode): boolean {
  if (node.type === 'text') {
    return node.value.trim().length > 0;
  }
  if (node.type === 'inline_code') {
    return node.value.trim().length > 0;
  }
  if ('children' in node && Array.isArray(node.children)) {
    return node.children.some(hasInlineContent);
  }
  return false;
}

/**
 * Creates an AST transform that cleans empty block nodes
 */
export const pruneEmptyTransform: ASTTransform = (ast: DocumentAST): DocumentAST => {
  return traverseAst(ast, {
    enterBlock: (block: BlockNode) => {
      if (block.type === 'paragraph' || block.type === 'heading') {
        const hasContent = block.children.some(hasInlineContent);
        if (!hasContent) {
          return false; // Remove empty block
        }
      }

      if (block.type === 'blockquote') {
        if (block.children.length === 0) {
          return false;
        }
      }

      if (block.type === 'list') {
        if (block.items.length === 0) {
          return false;
        }
      }

      if (block.type === 'table') {
        if (block.headers.length === 0 && block.rows.length === 0) {
          return false;
        }
      }

      return block;
    },
  });
};
