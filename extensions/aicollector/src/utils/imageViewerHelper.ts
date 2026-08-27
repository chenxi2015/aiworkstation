/**
 * Fullscreen Image Viewer Helper
 *
 * Stores viewer payload in chrome.storage.local and launches the native
 * extension viewer page (`viewer.html`) in a new browser tab with full
 * React-driven controls, animations, and zero CSP limitations.
 */

export interface ImageViewerOptions {
  url: string;
  title?: string;
  dimensions?: {
    width: number;
    height: number;
  };
  tag?: string;
}

export async function openImageViewerInNewTab(
  options: ImageViewerOptions,
): Promise<void> {
  const { url, title = '区域截图', dimensions, tag } = options;

  try {
    await chrome.storage.local.set({
      viewer_image: {
        url,
        title,
        dimensions,
        tag,
        timestamp: Date.now(),
      },
    });

    const viewerUrl = chrome.runtime.getURL('/viewer.html');
    await chrome.tabs.create({ url: viewerUrl });
  } catch (error) {
    console.error('Failed to open image viewer tab:', error);
    // Fallback if tabs.create fails
    const win = window.open(url, '_blank');
    if (win) win.focus();
  }
}
