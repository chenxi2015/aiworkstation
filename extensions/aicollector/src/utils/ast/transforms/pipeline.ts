/**
 * AST Transform Pipeline
 * Executes an ordered sequence of AST transformation functions (Middleware/Pipe Pattern).
 */

import type { DocumentAST, ASTTransform } from '../types';
import { calculateAstStats } from '../visitor';

/**
 * Applies a list of transforms sequentially to a DocumentAST
 */
export function applyTransforms(
  ast: DocumentAST,
  ...transforms: ASTTransform[]
): DocumentAST {
  let currentAst = ast;

  for (const transform of transforms) {
    if (typeof transform === 'function') {
      currentAst = transform(currentAst);
    }
  }

  // Recalculate stats after transformations
  return calculateAstStats(currentAst);
}
