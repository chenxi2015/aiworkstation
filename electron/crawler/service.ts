import { BrowserWindow, session } from "electron";
import { CHROME_USER_AGENT } from "../publish/redbook/sessionManager.js";
import { buildExtractorScript } from "./extractorScript.js";
import type { CrawlJob, CrawlJobResult } from "./types.js";

const CRAWLER_SESSION_PARTITION = "persist:electron-crawler";
const MAX_CRAWL_TIMEOUT_MS = 15_000;

let isHeaderFilterConfigured = false;

/**
 * Configure request interceptors for the crawler session to block heavy media streams.
 * Note: We let Chromium's `images: false` handle image skipping naturally rather than
 * throwing `cancel: true` network errors which can disrupt page JavaScript execution.
 */
function setupCrawlerSessionFilters(): void {
	if (isHeaderFilterConfigured) return;
	isHeaderFilterConfigured = true;

	const ses = session.fromPartition(CRAWLER_SESSION_PARTITION);
	ses.setUserAgent(CHROME_USER_AGENT);

	// Intercept heavy audio and video media streams
	ses.webRequest.onBeforeRequest((details, callback) => {
		if (details.resourceType === "media") {
			callback({ cancel: true });
			return;
		}
		callback({ cancel: false });
	});
}

/**
 * Headless In-App Crawler Service leveraging an offscreen Electron BrowserWindow.
 */
export class ElectronCrawlerService {
	/**
	 * Crawls a dynamic or SPA webpage silently in a background Chromium instance.
	 */
	public static async crawl(job: CrawlJob): Promise<CrawlJobResult> {
		setupCrawlerSessionFilters();

		const win = new BrowserWindow({
			show: false,
			width: 1280,
			height: 800,
			webPreferences: {
				partition: CRAWLER_SESSION_PARTITION,
				javascript: true,
				images: false,
				offscreen: true,
				backgroundThrottling: false, // Prevent Chromium from freezing timers in hidden background tabs
			},
		});

		try {
			// 1. Wait for page DOM readiness and content presence (adaptive, avoids 25s timeout)
			await this.waitForPageReady(win, job);

			// 2. Inject extraction script to extract title, markdown, html, and images
			const script = buildExtractorScript(job);
			const result = (await win.webContents.executeJavaScript(
				script,
			)) as CrawlJobResult;

			return result;
		} catch (err: unknown) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			console.warn(`[ElectronCrawler] Crawl failed for ${job.url}:`, errorMsg);
			return {
				success: false,
				error: errorMsg,
			};
		} finally {
			if (!win.isDestroyed()) {
				win.destroy();
			}
		}
	}

	/**
	 * Fast adaptive page readiness probe:
	 * Resolves as soon as main content is detected in the DOM, or after a brief settle wait for SPAs.
	 */
	private static waitForPageReady(win: BrowserWindow, job: CrawlJob): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			let isSettled = false;
			let timer: NodeJS.Timeout | null = null;

			const finish = () => {
				if (isSettled) return;
				isSettled = true;
				if (timer) clearTimeout(timer);
				resolve();
			};

			const fail = (err: Error) => {
				if (isSettled) return;
				isSettled = true;
				if (timer) clearTimeout(timer);
				reject(err);
			};

			timer = setTimeout(() => {
				// On safety timeout, resolve to salvage whatever DOM was constructed
				finish();
			}, MAX_CRAWL_TIMEOUT_MS);

			// Probe DOM to check if main article content is already rendered
			const checkContentReady = async () => {
				try {
					if (win.isDestroyed() || isSettled) return;
					const ready = await win.webContents.executeJavaScript(`
						(() => {
							const hasMain = Boolean(
								document.querySelector("#js_content, .rich_media_content, article, main, [role='main'], #content, .post-content")
							);
							const textLen = (document.body ? document.body.innerText : "").trim().length;
							return hasMain || textLen > 200;
						})()
					`);
					if (ready) {
						finish();
					}
				} catch {
					// Ignore DOM errors during early navigation
				}
			};

			win.webContents.once("dom-ready", () => {
				// Once DOM tree is constructed, check immediately (SSR pages like WeChat are ready now)
				void checkContentReady();

				// Short settle timer for client-side JS hydration (SPAs)
				const settleWait = Math.min(job.waitMs ?? 1000, 3000);
				setTimeout(() => {
					finish();
				}, settleWait);
			});

			win.webContents.once("did-finish-load", () => {
				// If full page load completes before settle timer, finish quickly
				setTimeout(finish, 200);
			});

			win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, _url, isMainFrame) => {
				if (isMainFrame && errorCode !== -3 /* ABORTED */) {
					fail(new Error(`Page failed to load: ${errorDescription} (${errorCode})`));
				}
			});

			win.loadURL(job.url).catch((err) => {
				if (!isSettled) {
					console.warn(`[ElectronCrawler] Navigation error for ${job.url}:`, err);
				}
			});
		});
	}
}

