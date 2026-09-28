/**
 * Inject content scripts into tabs that were already open when the
 * extension was installed / reloaded. Chrome only auto-injects manifest
 * content scripts on NEW navigations, so without this the web app's
 * PING/dataset detection cannot see the extension until a manual refresh.
 */
export async function injectContentScriptsIntoOpenTabs(): Promise<void> {
	if (!chrome.scripting?.executeScript) return;
	const files = (chrome.runtime.getManifest().content_scripts ?? []).flatMap(
		(cs) => cs.js ?? [],
	);
	if (files.length === 0) return;
	const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
	await Promise.all(
		tabs.map(async (tab) => {
			if (tab.id == null) return;
			try {
				await chrome.scripting.executeScript({
					target: { tabId: tab.id, allFrames: true },
					files,
				});
			} catch {
				// Ignore tabs that cannot be injected (chrome://, Web Store, etc.)
			}
		}),
	);
}
