import { BrowserWindow, session } from "electron";
import { CHROME_USER_AGENT } from "../publish/redbook/sessionManager.js";
import { buildExtractorScript } from "./extractorScript.js";
import type { CrawlJob, CrawlJobResult } from "./types.js";

const CRAWLER_SESSION_PARTITION = "persist:electron-crawler";
const DEFAULT_TIMEOUT_MS = 25_000;

let isHeaderFilterConfigured = false;

/**
 * Configure request interceptors for the crawler session to block images,
 * audio, video, and fonts to accelerate crawling and save memory.
 */
function setupCrawlerSessionFilters(): void {
	if (isHeaderFilterConfigured) return;
	isHeaderFilterConfigured = true;

	const ses = session.fromPartition(CRAWLER_SESSION_PARTITION);
	ses.setUserAgent(CHROME_USER_AGENT);

	// Intercept media and heavy static resources
	ses.webRequest.onBeforeRequest((details, callback) => {
		const resourceType = details.resourceType;
		if (
			resourceType === "image" ||
			resourceType === "media" ||
			resourceType === "font"
		) {
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
			},
		});

		try {
			// 1. Navigate to target URL with timeout guard
			const loadPromise = win.loadURL(job.url);
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => {
					reject(new Error(`Page load timed out after ${DEFAULT_TIMEOUT_MS}ms`));
				}, DEFAULT_TIMEOUT_MS);
			});

			await Promise.race([loadPromise, timeoutPromise]);

			// 2. Wait for SPA client-side JavaScript hydration and DOM settlement
			const settleWait = Math.min(job.waitMs ?? 1500, 8000);
			if (settleWait > 0) {
				await new Promise((resolve) => setTimeout(resolve, settleWait));
			}

			// 3. Inject extraction script to extract title, markdown, or skeleton
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
}

