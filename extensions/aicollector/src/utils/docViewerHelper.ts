/**
 * Document & PDF Viewer Helper
 *
 * Stores document payload in chrome.storage.local and launches the native
 * extension doc-viewer page (`doc-viewer.html`) in a new browser tab with full
 * React-driven controls, HeroUI components, Word/PDF exporter actions, and zero CSP limitations.
 */

import type { GrabbedContent } from '../types';
import { cleanDocumentTitle } from './exporters/exportUtils';
import { prepareHtmlForPdf } from './exporters/pdfExporter';

export interface DocViewerPayload {
  title: string;
  htmlContent: string;
  pageUrl?: string;
  grabbedContent?: GrabbedContent;
  exportDate?: string;
  timestamp: number;
}

export interface DocViewerOptions {
  title: string;
  htmlContent: string;
  pageUrl?: string;
  grabbedContent?: GrabbedContent;
}

export async function openDocViewerInNewTab(options: DocViewerOptions): Promise<void> {
  const { title, htmlContent, pageUrl, grabbedContent } = options;
  const cleanTitle = cleanDocumentTitle(title);
  const sanitizedHtml = prepareHtmlForPdf(htmlContent, pageUrl, grabbedContent);

  const exportDate = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const payload: DocViewerPayload = {
    title: cleanTitle,
    htmlContent: sanitizedHtml,
    pageUrl,
    grabbedContent,
    exportDate,
    timestamp: Date.now(),
  };

  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({
        viewer_doc: payload,
      });
    }

    const docViewerUrl = typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('/doc-viewer.html')
      : '/doc-viewer.html';

    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      await chrome.tabs.create({ url: docViewerUrl });
    } else {
      window.open(docViewerUrl, '_blank');
    }
  } catch (error) {
    console.error('Failed to open doc viewer tab:', error);
    const docViewerUrl = typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('/doc-viewer.html')
      : '/doc-viewer.html';
    window.open(docViewerUrl, '_blank');
  }
}
