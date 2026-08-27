/**
 * Normalize Images AST Transform
 * Normalizes relative image paths and filters out spacer/tracker 1x1 images.
 */

import type { DocumentAST, ASTTransform, ImageBlock } from '../types';
import { traverseAst } from '../visitor';
import { normalizeImageUrl } from '../../imageExtractor';

/**
 * Creates an AST transform that normalizes images and removes spacer gifs
 */
export const normalizeImagesTransform: ASTTransform = (ast: DocumentAST): DocumentAST => {
  const pageUrl = ast.metadata.url;

  return traverseAst(ast, {
    enterBlock: (block) => {
      if (block.type === 'image') {
        const imageNode = block as ImageBlock;

        // Filter out spacer gifs and tiny tracking gifs
        if (
          imageNode.src.includes('spacer.gif') ||
          imageNode.src.includes('blank.gif') ||
          imageNode.src.startsWith('data:image/svg+xml')
        ) {
          return false; // Remove block
        }

        const normalized = normalizeImageUrl(imageNode.src, pageUrl);
        if (normalized && normalized !== imageNode.src) {
          return {
            ...imageNode,
            src: normalized,
          };
        }
      }
      return block;
    },
  });
};
