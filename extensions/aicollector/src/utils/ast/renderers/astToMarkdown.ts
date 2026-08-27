/**
 * AST to Markdown Renderer
 * Converts DocumentAST into clean, standard GitHub Flavored Markdown (GFM).
 */

import type {
  DocumentAST,
  BlockNode,
  InlineNode,
  ListItemBlock,
} from '../types';

/**
 * Renders an inline node into Markdown syntax
 */
export function renderInlineToMarkdown(node: InlineNode): string {
  switch (node.type) {
    case 'text':
      return node.value;

    case 'inline_code':
      return `\`${node.value}\``;

    case 'link': {
      const text = node.children.map(renderInlineToMarkdown).join('').trim() || node.url;
      const titleSuffix = node.title ? ` "${node.title}"` : '';
      return `[${text}](${node.url}${titleSuffix})`;
    }

    case 'formatted': {
      let content = node.children.map(renderInlineToMarkdown).join('');
      if (!content.trim()) return '';

      if (node.bold) content = `**${content}**`;
      if (node.italic) content = `*${content}*`;
      if (node.strikethrough) content = `~~${content}~~`;
      return content;
    }

    default:
      return '';
  }
}

/**
 * Renders a list item recursively with indentation
 */
function renderListItem(item: ListItemBlock, indentLevel = 0, marker = '- '): string {
  const indent = '  '.repeat(indentLevel);
  const contents: string[] = [];

  for (const child of item.children) {
    if ('type' in child && child.type === 'list') {
      const subItems = child.items
        .map((sub, idx) => {
          const subMarker = child.ordered ? `${idx + 1}. ` : '- ';
          return renderListItem(sub, indentLevel + 1, subMarker);
        })
        .join('\n');
      contents.push(`\n${subItems}`);
    } else if ('children' in child && child.type === 'paragraph') {
      contents.push(child.children.map(renderInlineToMarkdown).join(''));
    } else if ('value' in child || 'children' in child) {
      contents.push(renderInlineToMarkdown(child as InlineNode));
    }
  }

  return `${indent}${marker}${contents.join('').trim()}`;
}

/**
 * Renders a table block into Markdown GFM table syntax
 */
function renderTableBlock(headers: string[], rows: string[][]): string {
  if (headers.length === 0 && rows.length === 0) return '';

  const colCount = Math.max(
    headers.length,
    ...rows.map((r) => r.length),
  );

  const normalizedHeaders = Array.from({ length: colCount }, (_, i) => headers[i] || `Col ${i + 1}`);
  const separator = Array.from({ length: colCount }, () => '---');

  const headerLine = `| ${normalizedHeaders.join(' | ')} |`;
  const sepLine = `| ${separator.join(' | ')} |`;
  const rowLines = rows.map((row) => {
    const normalizedRow = Array.from({ length: colCount }, (_, i) => (row[i] || '').replace(/\|/g, '\\|'));
    return `| ${normalizedRow.join(' | ')} |`;
  });

  return `\n${[headerLine, sepLine, ...rowLines].join('\n')}\n`;
}

/**
 * Renders a single block node into Markdown syntax
 */
export function renderBlockToMarkdown(block: BlockNode): string {
  switch (block.type) {
    case 'heading': {
      const hashes = '#'.repeat(block.level);
      const text = block.children.map(renderInlineToMarkdown).join('').trim();
      return `\n${hashes} ${text}\n`;
    }

    case 'paragraph': {
      const text = block.children.map(renderInlineToMarkdown).join('').trim();
      return text ? `\n${text}\n` : '';
    }

    case 'blockquote': {
      const innerText = block.children
        .map((c) => ('children' in c && c.type === 'paragraph' ? renderBlockToMarkdown(c) : renderInlineToMarkdown(c as InlineNode)))
        .join('')
        .trim();
      const lines = innerText.split('\n').map((l) => `> ${l}`).join('\n');
      return `\n${lines}\n`;
    }

    case 'code': {
      const lang = block.language || '';
      return `\n\`\`\`${lang}\n${block.code.trim()}\n\`\`\`\n`;
    }

    case 'list': {
      const lines = block.items.map((item, idx) => {
        const marker = block.ordered ? `${(block.start || 1) + idx}. ` : '- ';
        return renderListItem(item, 0, marker);
      });
      return `\n${lines.join('\n')}\n`;
    }

    case 'image': {
      const alt = block.alt || '';
      const title = block.title ? ` "${block.title}"` : '';
      return `\n![${alt}](${block.src}${title})\n`;
    }

    case 'video': {
      const title = block.title || '视频播放';
      return `\n🎥 [${title}](${block.src})\n`;
    }

    case 'table':
      return renderTableBlock(block.headers, block.rows);

    case 'divider':
      return '\n---\n';

    default:
      return '';
  }
}

/**
 * Renders an entire DocumentAST into formatted Markdown
 */
export function renderAstToMarkdown(
  ast: DocumentAST,
  options?: {
    includeHeader?: boolean;
  },
): string {
  const parts: string[] = [];

  if (options?.includeHeader) {
    if (ast.metadata.title) {
      parts.push(`# ${ast.metadata.title}\n`);
    }
    if (ast.metadata.cleanUrl || ast.metadata.url) {
      parts.push(`> 来源: [${ast.metadata.siteName || '原网页'}](${ast.metadata.cleanUrl || ast.metadata.url})\n`);
    }
  }

  for (const block of ast.children) {
    const md = renderBlockToMarkdown(block);
    if (md) parts.push(md);
  }

  // Collapse consecutive newlines (more than 2)
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
