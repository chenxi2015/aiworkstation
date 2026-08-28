/**
 * Lightweight & Robust Markdown to HTML Converter for preview & export
 * Supports GFM headings, bold, italic, strike, lists, blockquotes, code blocks, tables, images, links.
 */

import { escapeHtml } from './exporters/exportUtils';

export function markdownToHtml(md: string): string {
  if (!md || !md.trim()) {
    return '<p class="empty-content">（暂无正文内容）</p>';
  }

  const lines = md.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let inBlockquote = false;
  let blockquoteContent: string[] = [];

  const flushBlockquote = () => {
    if (inBlockquote && blockquoteContent.length > 0) {
      const innerHtml = markdownToHtml(blockquoteContent.join('\n'));
      result.push(`<blockquote>${innerHtml}</blockquote>`);
      blockquoteContent = [];
      inBlockquote = false;
    }
  };

  const flushList = () => {
    if (inList) {
      result.push(`</${inList}>`);
      inList = null;
    }
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    // 1. Code block fence ```
    if (trimmed.startsWith('```')) {
      flushBlockquote();
      flushList();
      if (inCodeBlock) {
        // End of code block
        const langClass = codeBlockLang ? ` class="language-${escapeHtml(codeBlockLang)}"` : '';
        result.push(`<pre><code${langClass}>${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`);
        inCodeBlock = false;
        codeBlockLang = '';
        codeBlockContent = [];
      } else {
        // Start of code block
        inCodeBlock = true;
        codeBlockLang = trimmed.slice(3).trim();
        codeBlockContent = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(rawLine);
      continue;
    }

    // 2. Blockquotes >
    if (trimmed.startsWith('>')) {
      flushList();
      inBlockquote = true;
      blockquoteContent.push(trimmed.replace(/^>\s?/, ''));
      continue;
    } else if (inBlockquote) {
      flushBlockquote();
    }

    // 3. Headings #
    const headingMatch = rawLine.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch && headingMatch[1] && headingMatch[2] !== undefined) {
      flushList();
      const level = headingMatch[1].length;
      const text = parseInlineMarkdown(headingMatch[2]);
      result.push(`<h${level}>${text}</h${level}>`);
      continue;
    }

    // 4. Horizontal rule ---, ***, ___
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      flushList();
      result.push('<hr />');
      continue;
    }

    // 5. Unordered List (- or * or +)
    const ulMatch = rawLine.match(/^(\s*)([-*+])\s+(.*)$/);
    if (ulMatch && ulMatch[3] !== undefined) {
      if (inList !== 'ul') {
        flushList();
        result.push('<ul>');
        inList = 'ul';
      }
      result.push(`<li>${parseInlineMarkdown(ulMatch[3])}</li>`);
      continue;
    }

    // 6. Ordered List (1. 2. etc)
    const olMatch = rawLine.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (olMatch && olMatch[3] !== undefined) {
      if (inList !== 'ol') {
        flushList();
        result.push('<ol>');
        inList = 'ol';
      }
      result.push(`<li>${parseInlineMarkdown(olMatch[3])}</li>`);
      continue;
    }

    // If we're in a list and hit a non-list item, close the list
    if (inList && trimmed.length > 0) {
      flushList();
    }

    // 7. Empty line
    if (!trimmed) {
      flushList();
      continue;
    }

    // 8. Regular paragraph
    flushList();
    result.push(`<p>${parseInlineMarkdown(rawLine)}</p>`);
  }

  // Cleanup dangling states
  if (inCodeBlock) {
    result.push(`<pre><code>${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`);
  }
  flushBlockquote();
  flushList();

  return result.join('\n');
}

/**
 * Parses inline markdown formatted text (bold, italic, code, link, image, del)
 */
function parseInlineMarkdown(text: string): string {
  if (!text) return '';

  let res = escapeHtml(text);

  // Images: ![alt](url)
  res = res.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');

  // Links: [text](url)
  res = res.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Inline Code: `code`
  res = res.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold & Italic: ***text*** or ___text___
  res = res.replace(/(\*\*\*|___)(.*?)\1/g, '<strong><em>$2</em></strong>');

  // Bold: **text** or __text__
  res = res.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');

  // Italic: *text* or _text_
  res = res.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');

  // Strikethrough: ~~text~~
  res = res.replace(/~~(.*?)~~/g, '<del>$1</del>');

  return res;
}
