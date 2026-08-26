import JSZip from 'jszip';

/**
 * Utility functions for downloading images and archiving into ZIP in the extension
 */

/**
 * Fetch image dataURL via background script to bypass Referer / CORS restrictions
 */
export async function fetchImageDataUrl(url: string, pageUrl?: string): Promise<string> {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }

  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        {
          type: 'FETCH_IMAGE_DATA',
          url,
          pageUrl,
        },
        (res) => {
          if (res?.success && res.dataUrl) {
            resolve(res.dataUrl);
          } else {
            resolve(url);
          }
        },
      );
    } catch {
      resolve(url);
    }
  });
}

/**
 * Extract image extension from URL or mime type
 */
export function resolveImageExtension(url?: string, dataUrl?: string): string {
  if (dataUrl) {
    if (dataUrl.startsWith('data:image/png')) return 'png';
    if (dataUrl.startsWith('data:image/webp')) return 'webp';
    if (dataUrl.startsWith('data:image/gif')) return 'gif';
    if (dataUrl.startsWith('data:image/svg')) return 'svg';
    if (dataUrl.startsWith('data:image/jpeg')) return 'jpg';
  }

  if (url) {
    try {
      const parsed = new URL(url);
      const match = parsed.pathname.match(/\.(jpg|jpeg|png|webp|gif|svg|bmp)$/i);
      if (match && match[1]) {
        return match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
      }
    } catch {
      // ignore
    }
  }

  return 'jpg';
}

/**
 * Convert base64 dataUrl to Uint8Array binary
 */
function dataUrlToBinary(dataUrl: string): { bytes: Uint8Array; ext: string } {
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
 * Trigger file download via chrome.downloads or DOM fallback
 */
export async function triggerBlobDownload(blob: Blob, filename: string): Promise<void> {
  const objectUrl = URL.createObjectURL(blob);

  if (chrome?.downloads?.download) {
    try {
      await chrome.downloads.download({
        url: objectUrl,
        filename,
        conflictAction: 'uniquify',
        saveAs: false,
      });
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
      return;
    } catch (err) {
      console.warn('chrome.downloads.download failed, fallback to <a> click:', err);
    }
  }

  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
}

/**
 * Download a single image by URL/dataURL
 */
export async function downloadImage(
  url: string,
  pageUrl?: string,
  customFilename?: string,
): Promise<void> {
  if (!url) return;
  const dataUrl = await fetchImageDataUrl(url, pageUrl);
  const ext = resolveImageExtension(url, dataUrl);
  const filename = customFilename || `image_${Date.now()}.${ext}`;

  if (dataUrl.startsWith('data:')) {
    const { bytes } = dataUrlToBinary(dataUrl);
    const blob = new Blob([bytes.buffer as ArrayBuffer]);
    await triggerBlobDownload(blob, filename);
  } else {
    // If regular URL
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Bundle all images into a ZIP archive and download
 */
export async function downloadImagesAsZip(
  urls: string[],
  pageUrl?: string,
  zipFilename?: string,
  onProgress?: (progress: { current: number; total: number; percent: number }) => void,
): Promise<void> {
  const validUrls = urls.filter((u): u is string => Boolean(u));
  if (validUrls.length === 0) return;

  const zip = new JSZip();
  const folder = zip.folder('images') || zip;

  for (let i = 0; i < validUrls.length; i++) {
    const url = validUrls[i];
    if (!url) continue;

    const dataUrl = await fetchImageDataUrl(url, pageUrl);
    const indexStr = String(i + 1).padStart(2, '0');

    if (dataUrl.startsWith('data:')) {
      const { bytes, ext } = dataUrlToBinary(dataUrl);
      folder.file(`img_${indexStr}.${ext}`, bytes, { binary: true });
    } else {
      try {
        const res = await fetch(dataUrl);
        const buffer = await res.arrayBuffer();
        const ext = resolveImageExtension(url);
        folder.file(`img_${indexStr}.${ext}`, buffer, { binary: true });
      } catch {
        // ignore single failed image
      }
    }

    if (onProgress) {
      const fetchPercent = Math.round(((i + 1) / validUrls.length) * 80);
      onProgress({ current: i + 1, total: validUrls.length, percent: fetchPercent });
    }
  }

  // Generate zip file with compression
  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    (meta) => {
      if (onProgress) {
        const compressPercent = 80 + Math.round(meta.percent * 0.2);
        onProgress({
          current: validUrls.length,
          total: validUrls.length,
          percent: compressPercent,
        });
      }
    },
  );

  const filename = zipFilename || `images_${Date.now()}.zip`;
  await triggerBlobDownload(zipBlob, filename);
}
