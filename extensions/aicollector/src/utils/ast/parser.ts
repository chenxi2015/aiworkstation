/**
 * DOM and HTML to Document AST Parser
 * Converts arbitrary webpage DOM elements or HTML snippets into structured DocumentAST.
 */

import type {
  DocumentAST,
  BlockNode,
  InlineNode,
  HeadingBlock,
  ParagraphBlock,
  QuoteBlock,
  CodeBlock,
  ListBlock,
  ListItemBlock,
  ImageBlock,
  VideoBlock,
  TableBlock,
  DividerBlock,
} from './types';
import type { GrabbedContent } from '../../types';
import { normalizeImageUrl } from '../imageExtractor';
import { calculateAstStats } from './visitor';
import { cleanUrl } from '../urlCleaner';

const IGNORED_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'canvas',
  'button',
  'input',
  'textarea',
  'select',
]);

const LAZY_IMAGE_ATTRS = [
  'data-src',
  'data-original',
  'data-original-src',
  'data-actualsrc',
  'data-lazy-src',
  'data-lazyload',
  'data-origin-src',
  'data-echo',
  'data-zoom-src',
  'data-pic',
  'data-url',
  'src',
];

/**
 * Extracts and resolves real image source with lazy loading support
 */
function resolveImageSource(img: HTMLImageElement, pageUrl?: string): string {
  const dataType = img.getAttribute('data-type');
  for (const attr of LAZY_IMAGE_ATTRS) {
    const val = img.getAttribute(attr);
    if (val && !val.startsWith('data:image/svg') && !val.includes('spacer.gif')) {
      const normalized = normalizeImageUrl(val, pageUrl, dataType);
      if (normalized) return normalized;
    }
  }
  return img.src ? normalizeImageUrl(img.src, pageUrl, dataType) || '' : '';
}

/**
 * Parses inline child nodes (text, links, inline styling, code)
 */
export function parseInlineNodes(node: Node, pageUrl?: string): InlineNode[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    if (!text) return [];
    return [{ type: 'text', value: text }];
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return [];
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (IGNORED_TAGS.has(tag)) {
    return [];
  }

  // Recursive parse children
  const children: InlineNode[] = [];
  for (const child of Array.from(el.childNodes)) {
    children.push(...parseInlineNodes(child, pageUrl));
  }

  if (tag === 'a') {
    let href = el.getAttribute('href') || '';
    if (href && pageUrl && !href.startsWith('http') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
      try {
        href = new URL(href, pageUrl).href;
      } catch {
        // Keep raw href on error
      }
    }
    return [
      {
        type: 'link',
        url: href,
        title: el.getAttribute('title') || undefined,
        children: children.length > 0 ? children : [{ type: 'text', value: href || '链接' }],
      },
    ];
  }

  if (tag === 'b' || tag === 'strong') {
    return [{ type: 'formatted', bold: true, children }];
  }

  if (tag === 'i' || tag === 'em') {
    return [{ type: 'formatted', italic: true, children }];
  }

  if (tag === 's' || tag === 'del' || tag === 'strike') {
    return [{ type: 'formatted', strikethrough: true, children }];
  }

  if (tag === 'code') {
    return [{ type: 'inline_code', value: el.textContent || '' }];
  }

  if (tag === 'br') {
    return [{ type: 'text', value: '\n' }];
  }

  return children;
}

/**
 * Parses table element into a structured TableBlock
 */
function parseTable(tableEl: HTMLTableElement): TableBlock {
  const headers: string[] = [];
  const rows: string[][] = [];

  const thElements = tableEl.querySelectorAll('thead th, tr:first-child th');
  thElements.forEach((th) => {
    headers.push((th.textContent || '').trim());
  });

  const trElements = tableEl.querySelectorAll('tbody tr, tr');
  trElements.forEach((tr, index) => {
    // Skip first row if already used as header
    if (index === 0 && headers.length > 0 && tr.querySelector('th')) return;

    const cells: string[] = [];
    tr.querySelectorAll('td, th').forEach((cell) => {
      cells.push((cell.textContent || '').trim());
    });

    if (cells.some((c) => c.length > 0)) {
      rows.push(cells);
    }
  });

  return {
    type: 'table',
    headers,
    rows,
    caption: tableEl.caption?.textContent?.trim() || undefined,
  };
}

/**
 * Parses a list element (ul or ol) recursively into ListBlock
 */
function parseList(listEl: HTMLElement, pageUrl?: string): ListBlock {
  const isOrdered = listEl.tagName.toLowerCase() === 'ol';
  const startAttr = listEl.getAttribute('start');
  const start = startAttr ? parseInt(startAttr, 10) : undefined;
  const items: ListItemBlock[] = [];

  const directItems = Array.from(listEl.children).filter(
    (child) => child.tagName.toLowerCase() === 'li',
  ) as HTMLElement[];

  for (const li of directItems) {
    const itemChildren: (BlockNode | InlineNode)[] = [];

    for (const child of Array.from(li.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child as HTMLElement;
        const childTag = childEl.tagName.toLowerCase();

        if (childTag === 'ul' || childTag === 'ol') {
          itemChildren.push(parseList(childEl, pageUrl));
          continue;
        }
      }
      itemChildren.push(...parseInlineNodes(child, pageUrl));
    }

    items.push({
      type: 'list_item',
      children: itemChildren,
    });
  }

  return {
    type: 'list',
    ordered: isOrdered,
    start,
    items,
  };
}

/**
 * Parses a code block (<pre> or <pre><code>)
 */
function parseCodeBlock(el: HTMLElement): CodeBlock {
  const codeEl = el.querySelector('code') || el;
  const rawCode = codeEl.textContent || '';

  // Extract language from class (e.g. language-typescript, lang-js)
  const classNames = (codeEl.className + ' ' + el.className).split(/\s+/);
  let language = '';
  for (const cls of classNames) {
    const match = cls.match(/^(?:language|lang)-([a-zA-Z0-9_-]+)$/);
    if (match && match[1]) {
      language = match[1];
      break;
    }
  }

  return {
    type: 'code',
    code: rawCode.replace(/\r\n/g, '\n'),
    language: language || undefined,
  };
}

/**
 * Recursively parses an HTMLElement into BlockNode[]
 */
export function parseElementToBlocks(element: HTMLElement, pageUrl?: string): BlockNode[] {
  const blocks: BlockNode[] = [];
  const tag = element.tagName.toLowerCase();

  if (IGNORED_TAGS.has(tag)) {
    return [];
  }

  // 1. Heading Elements (h1 - h6)
  if (/^h[1-6]$/.test(tag)) {
    const level = parseInt(tag[1] || '2', 10) as HeadingBlock['level'];
    const inlines = parseInlineNodes(element, pageUrl);
    if (inlines.length > 0) {
      blocks.push({ type: 'heading', level, children: inlines });
    }
    return blocks;
  }

  // 2. Code Block (<pre>)
  if (tag === 'pre') {
    blocks.push(parseCodeBlock(element));
    return blocks;
  }

  // 3. Blockquote
  if (tag === 'blockquote') {
    const inlines = parseInlineNodes(element, pageUrl);
    if (inlines.length > 0) {
      blocks.push({ type: 'blockquote', children: inlines });
    }
    return blocks;
  }

  // 4. Lists (ul, ol)
  if (tag === 'ul' || tag === 'ol') {
    blocks.push(parseList(element, pageUrl));
    return blocks;
  }

  // 5. Table
  if (tag === 'table') {
    blocks.push(parseTable(element as HTMLTableElement));
    return blocks;
  }

  // 6. Horizontal Rule (hr)
  if (tag === 'hr') {
    blocks.push({ type: 'divider' });
    return blocks;
  }

  // 7. Image
  if (tag === 'img') {
    const src = resolveImageSource(element as HTMLImageElement, pageUrl);
    if (src) {
      blocks.push({
        type: 'image',
        src,
        alt: (element as HTMLImageElement).alt || undefined,
        title: element.getAttribute('title') || undefined,
      });
    }
    return blocks;
  }

  // 8. Video
  if (tag === 'video') {
    const videoEl = element as HTMLVideoElement;
    const src = videoEl.currentSrc || videoEl.src || videoEl.querySelector('source')?.src || '';
    if (src) {
      blocks.push({
        type: 'video',
        src,
        poster: videoEl.poster || undefined,
        title: element.getAttribute('title') || undefined,
      });
    }
    return blocks;
  }

  // 9. Paragraph (<p>)
  if (tag === 'p') {
    const inlines = parseInlineNodes(element, pageUrl);
    if (inlines.length > 0) {
      blocks.push({ type: 'paragraph', children: inlines });
    }
    return blocks;
  }

  // 10. Container Elements (div, article, section, main, etc.)
  // Check if container contains nested block-level elements
  const hasNestedBlocks = Array.from(element.children).some((child) =>
    /^(div|p|h[1-6]|ul|ol|pre|blockquote|table|section|article|figure)$/i.test(child.tagName),
  );

  if (hasNestedBlocks) {
    for (const child of Array.from(element.children)) {
      blocks.push(...parseElementToBlocks(child as HTMLElement, pageUrl));
    }
  } else {
    // Leaf container: treat as paragraph if containing meaningful text/elements
    const inlines = parseInlineNodes(element, pageUrl);
    if (inlines.length > 0) {
      blocks.push({ type: 'paragraph', children: inlines });
    }
  }

  return blocks;
}

/**
 * Parses an active DOM element into a complete DocumentAST
 */
export function parseDomToAst(
  element: HTMLElement,
  options?: {
    pageUrl?: string;
    metadata?: Partial<DocumentAST['metadata']>;
  },
): DocumentAST {
  const pageUrl = options?.pageUrl || (typeof window !== 'undefined' ? window.location.href : '');
  const blocks = parseElementToBlocks(element, pageUrl);

  const ast: DocumentAST = {
    version: '1.0',
    metadata: {
      title: options?.metadata?.title || (typeof document !== 'undefined' ? document.title : 'Document'),
      url: pageUrl,
      cleanUrl: pageUrl ? cleanUrl(pageUrl) : '',
      description: options?.metadata?.description,
      siteName: options?.metadata?.siteName,
      capturedAt: Date.now(),
      selector: options?.metadata?.selector,
      tag: element.tagName.toLowerCase(),
      tdk: options?.metadata?.tdk,
      stats: {
        wordCount: 0,
        imageCount: 0,
        videoCount: 0,
        linkCount: 0,
        blockCount: 0,
      },
    },
    children: blocks,
  };

  return calculateAstStats(ast);
}

/**
 * Parses raw HTML string into DocumentAST
 */
export function parseHtmlToAst(
  html: string,
  pageUrl?: string,
  metadata?: Partial<DocumentAST['metadata']>,
): DocumentAST {
  if (typeof document === 'undefined') {
    throw new Error('parseHtmlToAst requires DOM environment (browser or jsdom)');
  }

  const container = document.createElement('div');
  container.innerHTML = html;
  return parseDomToAst(container, { pageUrl, metadata });
}

/**
 * Converts a GrabbedContent object into DocumentAST
 */
export function grabbedContentToAst(grabbed: GrabbedContent): DocumentAST {
  const ast = parseHtmlToAst(grabbed.selectedHtml, grabbed.url, {
    title: grabbed.tdk.title || '选区文档',
    description: grabbed.tdk.description,
    siteName: grabbed.tdk.siteName,
    selector: grabbed.selector,
    tag: grabbed.tag,
    tdk: grabbed.tdk,
    capturedAt: grabbed.createdAt,
  });

  return ast;
}
