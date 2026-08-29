import JSZip from 'jszip';
import type { GrabbedVideo } from '../../types';
import { downloadBlob } from './exportUtils';
import {
  fetchImageDataUrl,
  resolveImageExtension,
  resolveVideoExtension,
} from '../imageDownloader';

export interface BundleExportOptions {
  markdownContent?: string;
  images?: string[];
  videos?: GrabbedVideo[];
  screenshot?: string;
  pageUrl?: string;
  zipFilename?: string;
  includeMarkdown?: boolean;
  includeImages?: boolean;
  includeVideos?: boolean;
  includeScreenshot?: boolean;
  onProgress?: (progress: {
    loaded: number;
    total: number;
    percent: number;
    message?: string;
  }) => void;
}

/**
 * Convert base64 dataUrl to binary Uint8Array
 */
function base64ToBinary(dataUrl: string): { bytes: Uint8Array; ext: string } {
  const parts = dataUrl.split(',');
  const header = parts[0] || '';
  const base64 = parts[1] || '';

  let ext = 'jpg';
  if (header.includes('image/png')) ext = 'png';
  else if (header.includes('image/webp')) ext = 'webp';
  else if (header.includes('image/gif')) ext = 'gif';
  else if (header.includes('image/svg')) ext = 'svg';

  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return { bytes, ext };
}

/**
 * Export Markdown and all associated media (images, videos, screenshots) bundled into a ZIP archive
 */
export async function exportBundleZip(options: BundleExportOptions): Promise<void> {
  const {
    markdownContent = '',
    images = [],
    videos = [],
    screenshot,
    pageUrl = '',
    zipFilename = 'bundle.zip',
    includeMarkdown = true,
    includeImages = true,
    includeVideos = false,
    includeScreenshot = false,
    onProgress,
  } = options;

  const zip = new JSZip();
  let updatedMarkdown = markdownContent;

  const targetImages = includeImages ? images.filter(Boolean) : [];
  const targetVideos = includeVideos ? videos.filter((v) => Boolean(v?.src)) : [];
  const hasScreenshot = includeScreenshot && Boolean(screenshot);

  const totalTasks =
    targetImages.length + targetVideos.length + (hasScreenshot ? 1 : 0);
  let completedTasks = 0;

  const report = (msg: string) => {
    if (onProgress) {
      const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 85) : 50;
      onProgress({
        loaded: completedTasks,
        total: totalTasks,
        percent: pct,
        message: msg,
      });
    }
  };

  // 1. Process Images
  if (targetImages.length > 0) {
    const imgFolder = zip.folder('images') || zip;
    for (let i = 0; i < targetImages.length; i++) {
      const rawUrl = targetImages[i];
      if (!rawUrl) continue;

      report(`正在下载图片 (${i + 1}/${targetImages.length})...`);
      try {
        const dataUrl = await fetchImageDataUrl(rawUrl, pageUrl);
        const indexStr = String(i + 1).padStart(2, '0');

        if (dataUrl.startsWith('data:')) {
          const { bytes, ext } = base64ToBinary(dataUrl);
          const fileName = `img_${indexStr}.${ext}`;
          imgFolder.file(fileName, bytes, { binary: true });
          const relativePath = `./images/${fileName}`;
          updatedMarkdown = updatedMarkdown.split(rawUrl).join(relativePath);
        } else {
          let fetchUrl = dataUrl;
          if (pageUrl && !dataUrl.startsWith('http') && !dataUrl.startsWith('data:')) {
            try {
              fetchUrl = new URL(dataUrl, pageUrl).toString();
            } catch {
              fetchUrl = dataUrl;
            }
          }
          const res = await fetch(fetchUrl);
          if (res.ok) {
            const buf = await res.arrayBuffer();
            const ext = resolveImageExtension(fetchUrl);
            const fileName = `img_${indexStr}.${ext}`;
            imgFolder.file(fileName, buf, { binary: true });
            const relativePath = `./images/${fileName}`;
            updatedMarkdown = updatedMarkdown.split(rawUrl).join(relativePath);
            if (fetchUrl !== rawUrl) {
              updatedMarkdown = updatedMarkdown.split(fetchUrl).join(relativePath);
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to package image [${rawUrl}]:`, err);
      } finally {
        completedTasks++;
      }
    }
  }

  // 2. Process Videos (when enabled)
  if (targetVideos.length > 0) {
    const vidFolder = zip.folder('videos') || zip;
    for (let i = 0; i < targetVideos.length; i++) {
      const v = targetVideos[i];
      if (!v?.src) continue;

      report(`正在下载视频 (${i + 1}/${targetVideos.length})...`);
      try {
        let fullUrl = v.src;
        if (pageUrl && !fullUrl.startsWith('http') && !fullUrl.startsWith('data:') && !fullUrl.startsWith('blob:')) {
          try {
            fullUrl = new URL(fullUrl, pageUrl).toString();
          } catch {
            fullUrl = v.src;
          }
        }

        const ext = resolveVideoExtension(fullUrl);
        const indexStr = String(i + 1).padStart(2, '0');
        const fileName = `video_${indexStr}.${ext}`;

        const res = await fetch(fullUrl);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          vidFolder.file(fileName, buf, { binary: true });
          const relativePath = `./videos/${fileName}`;
          updatedMarkdown = updatedMarkdown.split(v.src).join(relativePath);
          if (fullUrl !== v.src) {
            updatedMarkdown = updatedMarkdown.split(fullUrl).join(relativePath);
          }
        }
      } catch (err) {
        console.warn(`Failed to package video [${v.src}]:`, err);
      } finally {
        completedTasks++;
      }
    }
  }

  // 3. Process Screenshot (if requested)
  if (hasScreenshot && screenshot) {
    report('正在添加选区截图...');
    try {
      if (screenshot.startsWith('data:')) {
        const { bytes } = base64ToBinary(screenshot);
        zip.file('screenshot.png', bytes, { binary: true });
      }
    } catch (err) {
      console.warn('Failed to package screenshot:', err);
    } finally {
      completedTasks++;
    }
  }

  // 4. Add Markdown file
  if (includeMarkdown && updatedMarkdown) {
    zip.file('index.md', updatedMarkdown);
  }

  // 5. Generate ZIP Blob
  report('正在压缩打包 ZIP...');
  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    (meta) => {
      if (onProgress) {
        const pct = 85 + Math.round(meta.percent * 0.15);
        onProgress({
          loaded: totalTasks,
          total: totalTasks,
          percent: Math.min(100, pct),
          message: '正在生成 ZIP 文件...',
        });
      }
    },
  );

  const finalZipName = zipFilename.endsWith('.zip') ? zipFilename : `${zipFilename}.zip`;
  downloadBlob(zipBlob, finalZipName);
}

/**
 * Export Markdown and all associated images bundled into a ZIP archive (legacy wrapper)
 */
export async function exportMarkdownWithImages(
  markdownContent: string,
  images: string[],
  pageUrl: string,
  zipFilename = 'bundle.zip',
  onProgress?: (progress: { loaded: number; total: number; percent: number }) => void,
): Promise<void> {
  return exportBundleZip({
    markdownContent,
    images,
    pageUrl,
    zipFilename,
    includeMarkdown: true,
    includeImages: true,
    includeVideos: false,
    includeScreenshot: false,
    onProgress: (p) => {
      if (onProgress) {
        onProgress({ loaded: p.loaded, total: p.total, percent: p.percent });
      }
    },
  });
}
