import { VisualGrabber } from '../src/utils/grabber';
import { extractPageTDK } from '../src/utils/tdk';
import type { ExtensionMessage } from '../src/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const grabber = new VisualGrabber();

    // Listen for messages from background / sidepanel
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
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

        default:
          break;
      }
      return true; // Keep message channel open for async response
    });
  },
});
