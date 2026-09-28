import { registerBookmarkSyncListeners } from '../src/background/bookmarkSync';
import { injectContentScriptsIntoOpenTabs } from '../src/background/contentScriptInjector';
import { registerMessageHandlers } from '../src/background/messageRouter';
import { registerTabLifecycleListeners } from '../src/background/tabLifecycle';
import { registerWebRequestSniffer } from '../src/background/webRequestSniffer';
import { startCrawlerLoop } from '../src/services/crawlerClient';

/**
 * Background service worker entry: thin wiring layer only.
 * Feature implementations live in src/background/* modules:
 *   - streamStore / streamRegistry: per-tab sniffed stream storage + registration
 *   - bilibiliResolver / tabScanner / webRequestSniffer: stream discovery channels
 *   - bookmarkSync / syncLog: native bookmark sync + activity log
 *   - messageRouter / tabCapture / imageFetch: sidepanel & content script commands
 *   - tabLifecycle / contentScriptInjector: tab housekeeping + script injection
 */
export default defineBackground(() => {
  // 1. Configure Side Panel default behavior to open on action click
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err: unknown) => console.warn('Failed to set panel behavior:', err));
  }

  // 2. Inject content scripts into tabs that were already open when the
  // extension was installed / reloaded. Also run once per service worker
  // startup: covers extension reloads from chrome://extensions (which do
  // not fire onInstalled). The content script has a double-injection
  // guard, so repeated runs are safe.
  chrome.runtime.onInstalled.addListener(() => {
    injectContentScriptsIntoOpenTabs().catch((err: unknown) =>
      console.warn('Failed to inject content scripts into open tabs:', err),
    );
  });
  injectContentScriptsIntoOpenTabs().catch((err: unknown) =>
    console.warn('Failed to inject content scripts into open tabs:', err),
  );

  // 3. Native bookmark creation/removal sync
  registerBookmarkSyncListeners();

  // 4. Tab lifecycle: sniffed-stream housekeeping + Bilibili DASH resolution
  registerTabLifecycleListeners();

  // 5. Runtime message router (sidepanel / content script commands)
  registerMessageHandlers();

  // 6. Passive network sniffer for video streams across all frames and workers
  registerWebRequestSniffer();

  // 7. Silent crawler channel: long-poll workbench server for crawl jobs
  try {
    startCrawlerLoop();
  } catch (err) {
    console.warn('[AI Collector] Failed to start crawler loop:', err);
  }
});
