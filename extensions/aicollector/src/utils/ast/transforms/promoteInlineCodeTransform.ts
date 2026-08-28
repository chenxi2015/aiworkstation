/**
 * AST Transform: Intelligently promotes long/structured inline code (e.g. JSON objects,
 * Python functions, complex snippets) into first-class multi-line CodeBlock nodes.
 */

import type { DocumentAST, ASTTransform, BlockNode, ParagraphBlock, InlineNode, CodeBlock } from '../types';

/**
 * Detect language and optionally format the code string
 */
function inspectCode(rawText: string): { lang?: string; code: string; isCode: boolean } {
  const text = rawText.trim();
  if (text.length < 28 && !text.includes('\n')) {
    return { isCode: false, code: text };
  }

  // 1. JSON check
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      // Normalize single quotes or JSON-like object strings
      let jsonCandidate = text;
      // Handle single-quoted keys/values if strict JSON fails
      try {
        const parsed = JSON.parse(jsonCandidate);
        return {
          isCode: true,
          lang: 'json',
          code: JSON.stringify(parsed, null, 2),
        };
      } catch {
        // Try loose JSON with single quote replacement
        const normalized = jsonCandidate.replace(/'/g, '"');
        const parsed = JSON.parse(normalized);
        return {
          isCode: true,
          lang: 'json',
          code: JSON.stringify(parsed, null, 2),
        };
      }
    } catch {
      if (text.includes('"') && text.includes(':')) {
        return { isCode: true, lang: 'json', code: text };
      }
    }
  }

  // 2. Python check
  const pythonPatterns = [
    /\bdef\s+\w+\s*\(/,
    /\bclass\s+\w+[\s:(]/,
    /\bself\.\w+/,
    /->\s*(?:None|Dict|List|str|int|float|Optional|Any|bool)/,
    /\bimport\s+[\w.]+\s+as\s+\w+/,
    /\bfrom\s+[\w.]+\s+import\s+/,
    /#\s*[\u4e00-\u9fa5\w]+/,
  ];
  if (pythonPatterns.some((pattern) => pattern.test(text))) {
    return { isCode: true, lang: 'python', code: text };
  }

  // 3. JavaScript / TypeScript check
  const jsPatterns = [
    /\b(?:const|let|var)\s+\w+\s*=/,
    /\bfunction\s*\w*\s*\(/,
    /\bexport\s+(?:default|const|class|function)\b/,
    /\bimport\s+.*from\s+['"]/,
    /=>\s*\{/,
    /\bconsole\.(?:log|error|warn)\s*\(/,
  ];
  if (jsPatterns.some((pattern) => pattern.test(text))) {
    return { isCode: true, lang: 'typescript', code: text };
  }

  // 4. SQL check
  if (/^\s*(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\b/i.test(text)) {
    return { isCode: true, lang: 'sql', code: text };
  }

  // 5. Shell / CLI command check
  if (/^\s*(?:pnpm|npm|yarn|pip|docker|kubectl|git|curl|brew)\s+[a-z0-9_-]+/i.test(text)) {
    return { isCode: true, lang: 'bash', code: text };
  }

  // 6. Generic multiline code
  if (text.includes('\n') && text.length > 30) {
    return { isCode: true, code: text };
  }

  return { isCode: false, code: text };
}

export const promoteInlineCodeTransform: ASTTransform = (ast: DocumentAST): DocumentAST => {
  const nextChildren: BlockNode[] = [];

  for (const block of ast.children) {
    if (block.type !== 'paragraph') {
      nextChildren.push(block);
      continue;
    }

    const paragraph = block as ParagraphBlock;
    const hasPromotableInline = paragraph.children.some((child) => {
      if (child.type === 'inline_code') {
        const info = inspectCode(child.value);
        return info.isCode;
      }
      return false;
    });

    if (!hasPromotableInline) {
      nextChildren.push(block);
      continue;
    }

    // Split paragraph by promotable inline code nodes
    let currentInlines: InlineNode[] = [];

    const flushInlines = () => {
      const meaningful = currentInlines.filter((n) => {
        if (n.type === 'text') return n.value.trim().length > 0;
        return true;
      });
      if (meaningful.length > 0) {
        nextChildren.push({ type: 'paragraph', children: [...currentInlines] });
      }
      currentInlines = [];
    };

    for (const inline of paragraph.children) {
      if (inline.type === 'inline_code') {
        const info = inspectCode(inline.value);
        if (info.isCode) {
          flushInlines();
          nextChildren.push({
            type: 'code',
            code: info.code,
            language: info.lang,
          });
          continue;
        }
      }
      currentInlines.push(inline);
    }

    flushInlines();
  }

  return {
    ...ast,
    children: nextChildren,
  };
};
