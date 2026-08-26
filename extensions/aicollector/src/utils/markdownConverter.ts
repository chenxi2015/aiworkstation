/**
 * Lightweight HTML to Markdown converter utility
 */

/**
 * Clean up text content by collapsing excessive whitespace
 */
function cleanText(text: string): string {
  return text.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ');
}

/**
 * Recursively convert a DOM node into Markdown syntax
 */
function nodeToMarkdown(node: Node, pageUrl?: string): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();

  // Ignore invisible or script/style elements
  if (['script', 'style', 'noscript', 'svg', 'canvas'].includes(tagName)) {
    return '';
  }

  // Convert child nodes first
  const childrenMd = Array.from(element.childNodes)
    .map((child) => nodeToMarkdown(child, pageUrl))
    .join('');

  switch (tagName) {
    case 'h1':
      return `\n\n# ${cleanText(childrenMd).trim()}\n\n`;
    case 'h2':
      return `\n\n## ${cleanText(childrenMd).trim()}\n\n`;
    case 'h3':
      return `\n\n### ${cleanText(childrenMd).trim()}\n\n`;
    case 'h4':
      return `\n\n#### ${cleanText(childrenMd).trim()}\n\n`;
    case 'h5':
      return `\n\n##### ${cleanText(childrenMd).trim()}\n\n`;
    case 'h6':
      return `\n\n###### ${cleanText(childrenMd).trim()}\n\n`;

    case 'p':
      return `\n\n${childrenMd.trim()}\n\n`;

    case 'b':
    case 'strong':
      return childrenMd.trim() ? ` **${childrenMd.trim()}** ` : '';

    case 'i':
    case 'em':
      return childrenMd.trim() ? ` *${childrenMd.trim()}* ` : '';

    case 'del':
    case 's':
      return childrenMd.trim() ? ` ~~${childrenMd.trim()}~~ ` : '';

    case 'code':
      if (element.parentElement?.tagName.toLowerCase() === 'pre') {
        return childrenMd;
      }
      return ` \`${childrenMd.trim()}\` `;

    case 'pre': {
      const code = element.textContent || '';
      return `\n\n\`\`\`\n${code.trim()}\n\`\`\`\n\n`;
    }

    case 'blockquote':
      return `\n\n> ${childrenMd.trim().replace(/\n/g, '\n> ')}\n\n`;

    case 'a': {
      let href = element.getAttribute('href') || '';
      if (href && pageUrl && !href.startsWith('http') && !href.startsWith('//') && !href.startsWith('mailto:')) {
        try {
          href = new URL(href, pageUrl).toString();
        } catch {
          // ignore
        }
      }
      const label = childrenMd.trim() || href;
      return href ? `[${label}](${href})` : label;
    }

    case 'img': {
      let src =
        element.getAttribute('src') ||
        element.getAttribute('data-src') ||
        element.getAttribute('data-original') ||
        '';
      if (src && pageUrl && !src.startsWith('http') && !src.startsWith('//') && !src.startsWith('data:')) {
        try {
          src = new URL(src, pageUrl).toString();
        } catch {
          // ignore
        }
      }
      const alt = element.getAttribute('alt') || 'image';
      return src ? `\n\n![${alt}](${src})\n\n` : '';
    }

    case 'hr':
      return '\n\n---\n\n';

    case 'br':
      return '\n';

    case 'li': {
      const parent = element.parentElement;
      const isOrdered = parent?.tagName.toLowerCase() === 'ol';
      const index = parent ? Array.from(parent.children).indexOf(element) + 1 : 1;
      const prefix = isOrdered ? `${index}. ` : '- ';
      return `\n${prefix}${childrenMd.trim()}`;
    }

    case 'ul':
    case 'ol':
      return `\n\n${childrenMd.trim()}\n\n`;

    case 'table':
      return `\n\n${formatTableToMarkdown(element)}\n\n`;

    default:
      return childrenMd;
  }
}

/**
 * Simple HTML Table to Markdown converter
 */
function formatTableToMarkdown(tableEl: HTMLElement): string {
  const rows = Array.from(tableEl.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  const tableData: string[][] = [];
  rows.forEach((row) => {
    const cells = Array.from(row.querySelectorAll('th, td'));
    tableData.push(cells.map((c) => (c.textContent || '').trim().replace(/\|/g, '\\|')));
  });

  if (tableData.length === 0) return '';

  const maxCols = Math.max(...tableData.map((r) => r.length));
  if (maxCols === 0) return '';

  const lines: string[] = [];
  const headerRow = tableData[0] || [];
  const paddedHeader = Array.from({ length: maxCols }, (_, i) => headerRow[i] || '');
  lines.push(`| ${paddedHeader.join(' | ')} |`);
  lines.push(`| ${Array(maxCols).fill('---').join(' | ')} |`);

  for (let i = 1; i < tableData.length; i++) {
    const row = tableData[i] || [];
    const paddedRow = Array.from({ length: maxCols }, (_, j) => row[j] || '');
    lines.push(`| ${paddedRow.join(' | ')} |`);
  }

  return lines.join('\n');
}

/**
 * Converts an HTML string to structured Markdown
 */
export function htmlToMarkdown(html: string, pageUrl?: string): string {
  if (!html || typeof html !== 'string') return '';

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const md = nodeToMarkdown(doc.body, pageUrl);

    // Normalize multiple newlines
    return md
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch (err) {
    console.error('Failed to convert HTML to Markdown:', err);
    return '';
  }
}
