/**
 * Document AST (Abstract Syntax Tree) Engine
 * Unified semantic parsing, transformations, and multi-target emissions for web content extraction.
 */

import type { GrabbedContent } from '../../types';
import type { DocumentAST, ASTTransform } from './types';
import { grabbedContentToAst } from './parser';
import {
  applyTransforms,
  cleanLinksTransform,
  normalizeImagesTransform,
  pruneEmptyTransform,
} from './transforms';

export * from './types';
export * from './visitor';
export * from './parser';
export * from './transforms';
export * from './renderers';

/**
 * Standard default transform pipeline
 */
export const defaultAstTransforms: ASTTransform[] = [
  normalizeImagesTransform,
  cleanLinksTransform,
  pruneEmptyTransform,
];

/**
 * High-level convenience function: Convert GrabbedContent to fully normalized AST
 */
export function convertGrabbedToAst(
  grabbedContent: GrabbedContent,
  customTransforms?: ASTTransform[],
): DocumentAST {
  const rawAst = grabbedContentToAst(grabbedContent);
  const transforms = customTransforms || defaultAstTransforms;
  return applyTransforms(rawAst, ...transforms);
}
