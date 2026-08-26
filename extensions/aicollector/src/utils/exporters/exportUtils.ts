/**
 * General document export utilities: Blob downloading, title cleaning, HTML escaping,
 * Markdown & JSON exporters, and structured content formatting.
 */

import type { GrabbedContent } from '../../types';
import { parseHtmlToFlowBlocks } from '../contentImageGenerator';
import { htmlToMarkdown } from '../markdownConverter';
import { cleanUrl } from '../urlCleaner';

/**
 * Trigger browser file download from a Blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();

  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Sanitizes and cleans webpage document titles
 * Removes notification counters (e.g. "(1)", "[99+]"), trailing site names (" / X", " - 知乎"), and excess whitespace
 */
export function cleanDocumentTitle(rawTitle: string): string {
  if (!rawTitle || typeof rawTitle !== 'string') return '选区文档';
  let title = rawTitle.trim();

  // 1. Remove leading notification counts like (1), (99+), [2], 【1条】
  title = title.replace(/^[\(\[\{（【]\s*\d+\+?\s*(条|未读)?\s*[\)\]\}）】]\s*/, '');

  // 2. Remove common trailing platform / site names
  title = title.replace(
    /\s*[\/\-_|•]\s*(X|Twitter|知乎|知乎专栏|掘金|简书|微信公众平台|微信公众号|CSDN|CSDN博客|Bilibili|哔哩哔哩|bilibili|微博|Weibo|GitHub|V2EX|Medium|Substack|YouTube|Reddit|小红书|豆瓣|Douban|语雀|Notion)$/i,
    '',
  );

  return title.trim() || '选区文档';
}

/**
 * Escapes HTML characters for safe template insertion
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Export plain Markdown as a .md file
 */
export function exportMarkdown(content: string, filename = 'document.md'): void {
  const finalName = filename.endsWith('.md') ? filename : `${filename}.md`;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(blob, finalName);
}

/**
 * Export arbitrary data object as formatted JSON file
 */
export function exportJson(data: unknown, filename = 'document.json'): void {
  const finalName = filename.endsWith('.json') ? filename : `${filename}.json`;
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, finalName);
}

export interface StructuredContentExport {
  metadata: {
    title: string;
    url: string;
    cleanUrl: string;
    exportedAt: string;
    selector: string;
    tag: string;
    dimensions: { width: number; height: number };
    tdk: GrabbedContent['tdk'];
  };
  blocks: Array<{
    type: 'heading' | 'paragraph' | 'blockquote' | 'list-item' | 'image';
    text?: string;
    level?: number;
    src?: string;
    alt?: string;
  }>;
  markdown: string;
  images: string[];
  rawText: string;
}

/**
 * Build clean, serializable structured JSON dataset from grabbed DOM element
 */
export function createStructuredContentJson(
  grabbedContent: GrabbedContent,
): StructuredContentExport {
  const rawBlocks = parseHtmlToFlowBlocks(
    grabbedContent.selectedHtml,
    grabbedContent.selectedText,
    grabbedContent.images || [],
  );

  const blocks = rawBlocks.map((block) => {
    if (block.type === 'image') {
      return {
        type: block.type,
        src: block.src,
        alt: block.alt || '',
      };
    }
    return {
      type: block.type,
      text: block.text,
      ...(block.level !== undefined ? { level: block.level } : {}),
    };
  });

  return {
    metadata: {
      title: cleanDocumentTitle(grabbedContent.tdk.title || '选区内容'),
      url: grabbedContent.url,
      cleanUrl: cleanUrl(grabbedContent.url),
      exportedAt: new Date().toISOString(),
      selector: grabbedContent.selector,
      tag: grabbedContent.tag,
      dimensions: grabbedContent.dimensions,
      tdk: grabbedContent.tdk,
    },
    blocks,
    markdown: htmlToMarkdown(grabbedContent.selectedHtml, grabbedContent.url),
    images: grabbedContent.images || [],
    rawText: grabbedContent.selectedText,
  };
}
