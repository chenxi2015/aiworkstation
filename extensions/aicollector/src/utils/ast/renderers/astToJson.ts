/**
 * AST to JSON Renderer
 * Serializes DocumentAST into standard or compact JSON strings.
 */

import type { DocumentAST } from '../types';

/**
 * Serializes DocumentAST to formatted JSON string
 */
export function renderAstToJson(ast: DocumentAST, pretty = true): string {
  return JSON.stringify(ast, null, pretty ? 2 : undefined);
}

/**
 * Serializes DocumentAST to lightweight blocks JSON (ideal for AI prompts or content storage)
 */
export function renderAstToBlocksJson(ast: DocumentAST): string {
  const compactPayload = {
    title: ast.metadata.title,
    url: ast.metadata.cleanUrl || ast.metadata.url,
    stats: ast.metadata.stats,
    blocks: ast.children,
  };
  return JSON.stringify(compactPayload, null, 2);
}
