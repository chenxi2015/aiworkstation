import { VisualGrabber, extractFullPageContent } from '../src/utils/grabber';
import { extractPageTDK } from '../src/utils/tdk';
import { captureAndCropArea, calculateFullPageDimensions } from '../src/utils/screenshotHelper';
import type { ExtensionMessage } from '../src/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  main(ctx) {
    if (typeof chrome === 'undefined' || !chrome?.runtime?.onMessage) {
      return;
    }

    const isTop = window === window.top;
    const grabber = isTop ? new VisualGrabber() : null;

    // Inject the MAIN-world HLS sniffer (external file so page CSP cannot
    // block it the way it would block an inline script), then relay detected
    // playlist URLs to the background service worker.
    const injectHlsSniffer = () => {
      try {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('hls-sniffer.js');
        script.async = false;
        script.onload = () => script.remove();
        (document.head || document.documentElement).appendChild(script);
      } catch {
        // Injection may fail on restricted pages; safe to ignore
      }
    };
    injectHlsSniffer();

    const snifferMessageListener = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== 'aic-hls-sniffer' || data.type !== 'HLS_DETECTED') return;
      const url = data.payload?.url;
      if (typeof url !== 'string') return;

      chrome.runtime
        .sendMessage({
          type: 'HLS_STREAM_DETECTED',
          payload: {
            url,
            via: data.payload?.via,
            pageUrl: window.location.href,
            pageTitle: document.title,
          },
        })
        ?.catch?.(() => {});
    };
    window.addEventListener('message', snifferMessageListener);

    // Listen for messages from background / sidepanel
    const messageListener = (
      message: ExtensionMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      // Non-sniffer UI/Capture operations should only run in the top-level window
      if (!isTop && message.type !== 'RESCAN_PAGE_VIDEO') {
        return;
      }

      switch (message.type) {
        case 'START_VISUAL_GRAB':
          grabber?.start();
          sendResponse({ success: true, active: true });
          break;

        case 'CANCEL_VISUAL_GRAB':
          grabber?.stop();
          sendResponse({ success: true, active: false });
          break;

        case 'GET_PAGE_TDK': {
          const tdk = extractPageTDK(document);
          sendResponse({ success: true, tdk });
          break;
        }

        case 'CAPTURE_FULL_PAGE': {
          const { width: fullWidth, height: fullHeight } = calculateFullPageDimensions();
          const pageRect = { left: 0, top: 0, width: fullWidth, height: fullHeight };

          captureAndCropArea(pageRect, (progress) => {
            chrome?.runtime
              ?.sendMessage({
                type: 'SCREENSHOT_PROGRESS',
                payload: progress,
              })
              ?.catch?.(() => {});
          })
            .then((screenshot) => {
              const content = extractFullPageContent(screenshot);
              sendResponse({ success: true, content });
            })
            .catch((err) => {
              console.error('[AI Collector] Capture full page error:', err);
              sendResponse({ success: false, error: String(err) });
            });
          return true; // Keep channel open for async response
        }


        case 'CAPTURE_AREA_SCREENSHOT': {
          captureAndCropArea(message.payload.pageRect, (progress) => {
            chrome?.runtime
              ?.sendMessage({
                type: 'SCREENSHOT_PROGRESS',
                payload: progress,
              })
              ?.catch?.(() => {});
          })
            .then((screenshot) => {
              sendResponse({ success: !!screenshot, screenshot });
            })
            .catch((err) => {
              console.error('[AI Collector] Capture area screenshot error:', err);
              sendResponse({ success: false, error: String(err) });
            });
          return true; // Keep channel open for async response
        }

        case 'SCROLL_TO_AREA': {
          const { pageRect, pageScroll } = message.payload;
          // Restore the exact grab-time viewport when available so the capture
          // anchors to the same coordinate frame the selection was measured in;
          // otherwise fall back to scrolling the selection top into view.
          const targetX = pageScroll ? pageScroll.x : Math.max(0, pageRect.left);
          const targetY = pageScroll ? pageScroll.y : Math.max(0, pageRect.top);
          window.scrollTo({
            left: Math.max(0, targetX),
            top: Math.max(0, targetY),
            behavior: 'instant' as ScrollBehavior,
          });
          // Wait for scroll to settle before responding
          requestAnimationFrame(() => {
            setTimeout(() => {
              sendResponse({ success: true, scrollY: window.scrollY });
            }, 100);
          });
          return true; // Keep channel open for async response
        }

        case 'READ_PAGE_BLOB': {
          const { blobUrl } = message;
          if (!blobUrl || !blobUrl.startsWith('blob:')) {
            sendResponse({ success: false, error: 'Invalid blob URL' });
            break;
          }

          fetch(blobUrl)
            .then((res) => {
              if (!res.ok) throw new Error(`Fetch blob failed with status ${res.status}`);
              return res.blob();
            })
            .then((blob) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                if (typeof reader.result === 'string') {
                  sendResponse({ success: true, dataUrl: reader.result });
                } else {
                  sendResponse({ success: false, error: 'FileReader did not return string' });
                }
              };
              reader.onerror = () => sendResponse({ success: false, error: 'FileReader read error' });
              reader.readAsDataURL(blob);
            })
            .catch((err) => {
              console.warn('[AI Collector] Failed to read page blob:', err);
              sendResponse({ success: false, error: String(err?.message || err) });
            });
          return true; // Keep channel open for async response
        }

        case 'EXTRACT_IMAGE_CANVAS': {
          const { imageUrl } = message;
          if (!imageUrl) {
            sendResponse({ success: false, error: 'Missing image URL' });
            break;
          }

          // Try to find matching image element already in the DOM
          const matchingImg = Array.from(document.querySelectorAll<HTMLImageElement>('img')).find(
            (img) => img.src === imageUrl || img.currentSrc === imageUrl || img.getAttribute('data-src') === imageUrl,
          );

          if (matchingImg && matchingImg.complete && matchingImg.naturalWidth > 0) {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = matchingImg.naturalWidth;
              canvas.height = matchingImg.naturalHeight;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(matchingImg, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                sendResponse({ success: true, dataUrl });
                return true;
              }
            } catch (err) {
              console.warn('[AI Collector] Canvas extraction tainted or failed:', err);
            }
          }

          // Fallback: create temporary in-memory Image with anonymous CORS
          const tempImg = new Image();
          tempImg.crossOrigin = 'anonymous';
          tempImg.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = tempImg.naturalWidth;
              canvas.height = tempImg.naturalHeight;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(tempImg, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                sendResponse({ success: true, dataUrl });
              } else {
                sendResponse({ success: false, error: 'Failed to create canvas context' });
              }
            } catch (err) {
              sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
            }
          };
          tempImg.onerror = (err) => {
            sendResponse({ success: false, error: 'Failed to load image in content script' });
          };
          tempImg.src = imageUrl;
          return true; // Keep channel open for async response
        }

        case 'RESCAN_PAGE_VIDEO': {
          // 1. Notify main-world sniffer to reset seen cache and rescan performance buffer
          window.postMessage({ source: 'aic-content', type: 'RESCAN_HLS_STREAMS' }, '*');

          // 2. Scan active <video> and <source> elements in the page
          try {
            const mediaElements = document.querySelectorAll('video, source');
            mediaElements.forEach((el) => {
              const src = (el as HTMLVideoElement | HTMLSourceElement).src || (el as any).currentSrc;
              if (src && /\.m3u8(\?|#|$)/i.test(src)) {
                chrome.runtime
                  .sendMessage({
                    type: 'HLS_STREAM_DETECTED',
                    payload: {
                      url: src,
                      via: 'dom-element',
                      pageUrl: window.location.href,
                      pageTitle: document.title,
                    },
                  })
                  ?.catch?.(() => {});
              }
            });
          } catch {
            // DOM query warning
          }

          sendResponse({ success: true });
          return true;
        }

        default:
          break;
      }
      return true; // Keep message channel open for async response
    };

    chrome.runtime.onMessage.addListener(messageListener);

    ctx?.onInvalidated?.(() => {
      try {
        chrome?.runtime?.onMessage?.removeListener?.(messageListener);
      } catch {}
      window.removeEventListener('message', snifferMessageListener);
      grabber?.stop();
    });
  },
});
