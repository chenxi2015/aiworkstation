/**
 * AST Transform: Splits Markdown fenced code blocks within paragraphs into first-class CodeBlock nodes.
 * Prevents raw backticks (```python) from leaking into output documents.
 */

import type { DocumentAST, ASTTransform, BlockNode, ParagraphBlock } from '../types';

export const splitFencedCodeBlocksTransform: ASTTransform = (ast: DocumentAST): DocumentAST => {
  const nextChildren: BlockNode[] = [];

  for (const block of ast.children) {
    if (block.type !== 'paragraph') {
      nextChildren.push(block);
      continue;
    }

    const paragraph = block as ParagraphBlock;
    // Extract combined text if simple text/inlines
    const combinedText = paragraph.children
      .map((child) => ('value' in child ? child.value : ''))
      .join('');

    if (!combinedText.includes('```')) {
      nextChildren.push(block);
      continue;
    }

    // Regex to detect fenced code blocks ```lang\ncode\n```
    const fenceRegex = /```([a-zA-Z0-9_-]*)\s*\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let hasFences = false;

    while ((match = fenceRegex.exec(combinedText)) !== null) {
      hasFences = true;
      const matchStart = match.index;
      const matchEnd = fenceRegex.lastIndex;

      // 1. Text before the fence
      const beforeText = combinedText.slice(lastIndex, matchStart).trim();
      if (beforeText) {
        nextChildren.push({
          type: 'paragraph',
          children: [{ type: 'text', value: beforeText }],
        });
      }

      // 2. The code block itself
      const language = match[1]?.trim() || undefined;
      const rawCode = match[2] || '';
      nextChildren.push({
        type: 'code',
        code: rawCode.replace(/\r\n/g, '\n'),
        language,
      });

      lastIndex = matchEnd;
    }

    if (hasFences) {
      // 3. Text after the last fence
      const afterText = combinedText.slice(lastIndex).trim();
      if (afterText) {
        nextChildren.push({
          type: 'paragraph',
          children: [{ type: 'text', value: afterText }],
        });
      }
    } else {
      nextChildren.push(block);
    }
  }

  return {
    ...ast,
    children: nextChildren,
  };
};
