/**
 * Clean Links AST Transform
 * Removes tracking parameters (UTM, spm, from, etc.) from all Link nodes in the AST.
 */

import type { DocumentAST, ASTTransform, LinkInline } from '../types';
import { traverseAst } from '../visitor';
import { cleanUrl } from '../../urlCleaner';

/**
 * Creates an AST transform that cleans tracking parameters from URLs
 */
export const cleanLinksTransform: ASTTransform = (ast: DocumentAST): DocumentAST => {
  return traverseAst(ast, {
    enterInline: (inline) => {
      if (inline.type === 'link') {
        const linkNode = inline as LinkInline;
        const cleaned = cleanUrl(linkNode.url);
        if (cleaned !== linkNode.url) {
          return {
            ...linkNode,
            url: cleaned,
          };
        }
      }
      return inline;
    },
  });
};
