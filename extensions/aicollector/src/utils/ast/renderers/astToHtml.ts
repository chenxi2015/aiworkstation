/**
 * AST to HTML Renderer
 * Converts DocumentAST into clean, semantic, and sanitized HTML.
 */

import type {
  DocumentAST,
  BlockNode,
  InlineNode,
  ListItemBlock,
} from '../types';
import { highlightCodeToHtml } from '../../syntaxHighlighter';

/**
 * Escapes unsafe HTML characters
 */
function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Renders an inline node to HTML
 */
export function renderInlineToHtml(node: InlineNode): string {
  switch (node.type) {
    case 'text':
      return escapeHtml(node.value);

    case 'inline_code':
      return `<code>${escapeHtml(node.value)}</code>`;

    case 'link': {
      const text = node.children.map(renderInlineToHtml).join('') || escapeHtml(node.url);
      const titleAttr = node.title ? ` title="${escapeHtml(node.title)}"` : '';
      return `<a href="${escapeHtml(node.url)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    }

    case 'formatted': {
      let content = node.children.map(renderInlineToHtml).join('');
      if (node.bold) content = `<strong>${content}</strong>`;
      if (node.italic) content = `<em>${content}</em>`;
      if (node.strikethrough) content = `<del>${content}</del>`;
      return content;
    }

    default:
      return '';
  }
}

/**
 * Renders a list item to HTML
 */
function renderListItemHtml(item: ListItemBlock): string {
  const contents = item.children
    .map((child) => {
      if ('type' in child && child.type === 'list') {
        return renderBlockToHtml(child);
      }
      if ('children' in child && child.type === 'paragraph') {
        return child.children.map(renderInlineToHtml).join('');
      }
      return renderInlineToHtml(child as InlineNode);
    })
    .join('');

  return `<li>${contents}</li>`;
}

/**
 * Renders a block node to semantic HTML
 */
export function renderBlockToHtml(block: BlockNode): string {
  switch (block.type) {
    case 'heading': {
      const tag = `h${block.level}`;
      const inner = block.children.map(renderInlineToHtml).join('');
      return `<${tag}>${inner}</${tag}>`;
    }

    case 'paragraph': {
      const inner = block.children.map(renderInlineToHtml).join('');
      return inner ? `<p>${inner}</p>` : '';
    }

    case 'blockquote': {
      const inner = block.children
        .map((c) => ('children' in c && c.type === 'paragraph' ? renderBlockToHtml(c) : renderInlineToHtml(c as InlineNode)))
        .join('');
      return `<blockquote>${inner}</blockquote>`;
    }

    case 'code': {
      const lang = block.language || '';
      const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      const highlighted = highlightCodeToHtml(block.code, lang);
      return `<pre class="ast-code-block"><code${langClass}>${highlighted}</code></pre>`;
    }

    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const startAttr = block.start && block.start !== 1 ? ` start="${block.start}"` : '';
      const itemsHtml = block.items.map(renderListItemHtml).join('');
      return `<${tag}${startAttr}>${itemsHtml}</${tag}>`;
    }

    case 'image': {
      const altAttr = block.alt ? ` alt="${escapeHtml(block.alt)}"` : '';
      const titleAttr = block.title ? ` title="${escapeHtml(block.title)}"` : '';
      const captionHtml = block.title ? `<figcaption class="ast-image-caption">${escapeHtml(block.title)}</figcaption>` : '';
      return `<figure class="ast-image-card"><img src="${escapeHtml(block.src)}"${altAttr}${titleAttr} loading="lazy" />${captionHtml}</figure>`;
    }

    case 'video': {
      const posterAttr = block.poster ? ` poster="${escapeHtml(block.poster)}"` : '';
      const captionHtml = block.title ? `<div class="ast-video-caption">${escapeHtml(block.title)}</div>` : '';
      return `<div class="ast-video-card"><video src="${escapeHtml(block.src)}"${posterAttr} controls preload="metadata"></video>${captionHtml}</div>`;
    }

    case 'table': {
      const headHtml = block.headers.length > 0
        ? `<thead><tr>${block.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`
        : '';
      const bodyHtml = `<tbody>${block.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`;
      const captionHtml = block.caption ? `<caption>${escapeHtml(block.caption)}</caption>` : '';
      return `<table>${captionHtml}${headHtml}${bodyHtml}</table>`;
    }

    case 'divider':
      return '<hr />';

    default:
      return '';
  }
}

/**
 * Renders an entire DocumentAST into clean HTML
 */
export function renderAstToHtml(ast: DocumentAST): string {
  const bodyHtml = ast.children.map(renderBlockToHtml).filter(Boolean).join('\n');
  return `<article class="document-ast-root">\n${bodyHtml}\n</article>`;
}
