/**
 * AST to FlowBlock Converter
 * Transforms DocumentAST into an ordered, simplified sequence of layout flow blocks.
 */

import { parseHtmlToAst } from '../ast/parser';
import { applyTransforms } from '../ast/transforms/pipeline';
import { defaultAstTransforms } from '../ast';
import { renderInlineToPlainText, renderBlockToPlainText } from '../ast/renderers/astToPlainText';
import type { BlockNode } from '../ast/types';
import type { FlowBlock } from './types';

/**
 * Converts a single AST block node into FlowBlock(s)
 */
export function convertAstBlockToFlowBlocks(block: BlockNode): FlowBlock[] {
  switch (block.type) {
    case 'heading': {
      const text = block.children.map(renderInlineToPlainText).join('').trim();
      return text ? [{ type: 'heading', level: block.level, text }] : [];
    }
    case 'paragraph': {
      const text = block.children.map(renderInlineToPlainText).join('').trim();
      return text ? [{ type: 'paragraph', text }] : [];
    }
    case 'blockquote': {
      const text = renderBlockToPlainText(block);
      return text ? [{ type: 'blockquote', text }] : [];
    }
    case 'list': {
      return block.items
        .map((item) => {
          const text = renderBlockToPlainText(item);
          return { type: 'list-item' as const, text };
        })
        .filter((item) => item.text.length > 0);
    }
    case 'image': {
      return [{ type: 'image', src: block.src, alt: block.alt || '' }];
    }
    case 'video': {
      return [
        {
          type: 'video',
          src: block.src,
          poster: block.poster,
          title: block.title,
        },
      ];
    }
    case 'code': {
      return [{ type: 'paragraph', text: block.code }];
    }
    case 'table': {
      const text = renderBlockToPlainText(block);
      return text ? [{ type: 'paragraph', text }] : [];
    }
    default:
      return [];
  }
}

/**
 * Parses selected HTML into an ordered sequence of flow blocks via Document AST
 */
export function parseHtmlToFlowBlocks(
  html: string,
  fallbackText: string,
  fallbackImages: string[],
): FlowBlock[] {
  const blocks: FlowBlock[] = [];

  if (html && html.trim()) {
    try {
      const rawAst = parseHtmlToAst(html);
      const cleanAst = applyTransforms(rawAst, ...defaultAstTransforms);
      for (const astBlock of cleanAst.children) {
        blocks.push(...convertAstBlockToFlowBlocks(astBlock));
      }
    } catch (err) {
      console.warn('Failed to parse HTML to AST in parseHtmlToFlowBlocks, falling back:', err);
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
