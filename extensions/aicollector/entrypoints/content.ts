import { VisualGrabber } from '../src/utils/grabber';
import { extractPageTDK } from '../src/utils/tdk';
import { captureAndCropArea } from '../src/utils/screenshotHelper';
import type { ExtensionMessage } from '../src/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const grabber = new VisualGrabber();

    // Listen for messages from background / sidepanel
    chrome.runtime.onMessage.addListener(
      (
        message: ExtensionMessage,
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response?: any) => void,
      ) => {
        switch (message.type) {
          case 'START_VISUAL_GRAB':
            grabber.start();
            sendResponse({ success: true, active: true });
            break;

          case 'CANCEL_VISUAL_GRAB':
            grabber.stop();
            sendResponse({ success: true, active: false });
            break;

          case 'GET_PAGE_TDK': {
            const tdk = extractPageTDK(document);
            sendResponse({ success: true, tdk });
            break;
          }

          case 'CAPTURE_AREA_SCREENSHOT': {
            captureAndCropArea(message.payload.pageRect, (progress) => {
              chrome.runtime
                .sendMessage({
                  type: 'SCREENSHOT_PROGRESS',
                  payload: progress,
                })
                .catch(() => {});
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

          default:
            break;
        }
        return true; // Keep message channel open for async response
      },
    );
  },
});
