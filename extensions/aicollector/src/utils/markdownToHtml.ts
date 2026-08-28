/**
 * High-Performance & Standard-Compliant Markdown to HTML Converter
 * Powered by Marked & PrismJS for robust GFM rendering and syntax highlighting.
 */

import { Marked, type RendererObject } from 'marked';
import { highlightCodeToHtml } from './syntaxHighlighter';
import { escapeHtml } from './exporters/exportUtils';

// Configure custom renderer for rich styling and syntax highlighting
const customRenderer: RendererObject = {
  code({ text, lang }: { text: string; lang?: string }): string {
    const language = lang?.trim() || '';
    const langClass = language ? ` class="language-${escapeHtml(language)}"` : '';
    const highlighted = highlightCodeToHtml(text, language);
    return `<pre class="ast-code-block"><code${langClass}>${highlighted}</code></pre>`;
  },

  link({ href, title, text }: { href: string; title?: string | null; text: string }): string {
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    const safeHref = escapeHtml(href);
    return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  },

  image({ href, title, text }: { href: string; title?: string | null; text: string }): string {
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    const altAttr = text ? ` alt="${escapeHtml(text)}"` : '';
    const captionHtml = title ? `<figcaption class="ast-image-caption">${escapeHtml(title)}</figcaption>` : '';
    return `<figure class="ast-image-card"><img src="${escapeHtml(href)}"${altAttr}${titleAttr} loading="lazy" />${captionHtml}</figure>`;
  },

  codespan({ text }: { text: string }): string {
    return `<code>${text}</code>`;
  },
};

// Initialize marked instance with GFM defaults
const markedInstance = new Marked({
  gfm: true,
  breaks: false,
  renderer: customRenderer,
});

/**
 * Converts Markdown string into clean, highlighted, and semantic HTML
 */
export function markdownToHtml(md: string): string {
  if (!md || !md.trim()) {
    return '<p class="empty-content">（暂无正文内容）</p>';
  }

  try {
    const result = markedInstance.parse(md);
    return typeof result === 'string' ? result : '';
  } catch (err) {
    console.error('Failed to parse Markdown to HTML with marked:', err);
    return `<p class="empty-content">${escapeHtml(md)}</p>`;
  }
}
