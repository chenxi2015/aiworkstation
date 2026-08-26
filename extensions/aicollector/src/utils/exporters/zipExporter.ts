/**
 * ZIP archive exporter: bundles Markdown document and all referenced images
 * with local relative path rewriting.
 */

import JSZip from 'jszip';
import { downloadBlob } from './exportUtils';

/**
 * Export Markdown and all associated images bundled into a ZIP archive
 */
export async function exportMarkdownWithImages(
  markdownContent: string,
  images: string[],
  pageUrl: string,
  zipFilename = 'bundle.zip',
  onProgress?: (progress: { loaded: number; total: number; percent: number }) => void,
): Promise<void> {
  const zip = new JSZip();
  const imgFolder = zip.folder('images');

  let updatedMarkdown = markdownContent;
  const total = images.length;
  let loaded = 0;

  for (let i = 0; i < images.length; i++) {
    const rawUrl = images[i];
    if (!rawUrl) continue;

    let fullUrl = rawUrl;

    if (pageUrl && !rawUrl.startsWith('http') && !rawUrl.startsWith('data:')) {
      try {
        fullUrl = new URL(rawUrl, pageUrl).toString();
      } catch {
        fullUrl = rawUrl;
      }
    }

    try {
      const resp = await fetch(fullUrl, { mode: 'cors' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();

      // Determine extension
      let ext = 'png';
      const mime = blob.type.toLowerCase();
      if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
      else if (mime.includes('webp')) ext = 'webp';
      else if (mime.includes('gif')) ext = 'gif';
      else if (mime.includes('svg')) ext = 'svg';

      const localFileName = `img_${i + 1}.${ext}`;
      const relativePath = `./images/${localFileName}`;

      if (imgFolder) {
        imgFolder.file(localFileName, blob);
      }

      // Replace image link in Markdown
      updatedMarkdown = updatedMarkdown.split(rawUrl).join(relativePath);
      if (fullUrl !== rawUrl) {
        updatedMarkdown = updatedMarkdown.split(fullUrl).join(relativePath);
      }
    } catch (err) {
      console.warn(`Failed to fetch image ${rawUrl} for zip bundle:`, err);
    } finally {
      loaded++;
      if (onProgress) {
        onProgress({
          loaded,
          total,
          percent: Math.round((loaded / (total || 1)) * 100),
        });
      }
    }
  }

  zip.file('index.md', updatedMarkdown);

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const finalZipName = zipFilename.endsWith('.zip') ? zipFilename : `${zipFilename}.zip`;
  downloadBlob(zipBlob, finalZipName);
}
