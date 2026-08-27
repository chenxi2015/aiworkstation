/**
 * Content summarization and cover extraction utilities
 */

import type { GrabbedContent } from '../types';

export interface SummaryInfo {
  summary: string;
  wordCount: number;
  source: 'selection' | 'meta';
}

export interface CoverInfo {
  url: string;
  source: 'ogImage' | 'selection' | 'fallback';
}

/**
 * Extracts the most suitable cover image from GrabbedContent
 */
export function extractCover(grabbedContent: GrabbedContent): CoverInfo | null {
  // 1. OpenGraph / Twitter meta image
  if (grabbedContent.tdk.ogImage) {
    return {
      url: grabbedContent.tdk.ogImage,
      source: 'ogImage',
    };
  }

  // 2. First image in the grabbed element selection
  if (grabbedContent.images && grabbedContent.images.length > 0 && grabbedContent.images[0]) {
    return {
      url: grabbedContent.images[0],
      source: 'selection',
    };
  }

  // 2.5 Video poster in the grabbed element selection
  if (
    grabbedContent.videos &&
    grabbedContent.videos.length > 0 &&
    grabbedContent.videos[0]?.poster
  ) {
    return {
      url: grabbedContent.videos[0].poster,
      source: 'selection',
    };
  }

  // 3. Favicon as fallback if available
  if (grabbedContent.tdk.favicon) {
    return {
      url: grabbedContent.tdk.favicon,
      source: 'fallback',
    };
  }

  return null;
}

/**
 * Extracts a concise summary from the grabbed text or page description
 */
export function extractSummary(grabbedContent: GrabbedContent, maxLength = 220): SummaryInfo {
  const text = (grabbedContent.selectedText || '').trim();

  if (text.length > 0) {
    const cleaned = text.replace(/\s+/g, ' ');
    const summary = cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}...` : cleaned;
    return {
      summary,
      wordCount: text.length,
      source: 'selection',
    };
  }

  // Fallback to meta description
  const metaDesc = (grabbedContent.tdk.ogDescription || grabbedContent.tdk.description || '').trim();
  if (metaDesc) {
    const summary = metaDesc.length > maxLength ? `${metaDesc.slice(0, maxLength)}...` : metaDesc;
    return {
      summary,
      wordCount: metaDesc.length,
      source: 'meta',
    };
  }

  return {
    summary: '（暂无摘要提取内容）',
    wordCount: 0,
    source: 'selection',
  };
}
