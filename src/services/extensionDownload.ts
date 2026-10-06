import { REPO_CONFIG } from "../config/app.ts";

/**
 * GitHub repository configurations for extension downloads
 */
export const GITHUB_REPO_NAME = REPO_CONFIG.REPO;
export const GITHUB_RELEASES_URL = REPO_CONFIG.RELEASES_URL;
export const CHROME_EXTENSIONS_URL = "chrome://extensions";

interface GitHubReleaseAsset {
	name: string;
	browser_download_url: string;
}

interface GitHubReleaseResponse {
	tag_name?: string;
	html_url?: string;
	assets?: GitHubReleaseAsset[];
}

/**
 * Downloads the AI Collector Chrome extension zip package from GitHub Releases.
 * First queries GitHub API for the latest release asset matching the Chrome extension,
 * falls back to opening the latest release web page if unavailable.
 */
export async function downloadExtensionFromGithub(): Promise<void> {
	try {
		const response = await fetch(REPO_CONFIG.RELEASES_API_URL, {
			headers: {
				Accept: "application/vnd.github.v3+json",
			},
		});

		if (response.ok) {
			const data = (await response.json()) as GitHubReleaseResponse;
			const assets = data.assets || [];

			// Find Chrome extension zip package (e.g. aiworkstation-collector-*-chrome.zip)
			const chromeAsset = assets.find((asset) => {
				const lower = asset.name.toLowerCase();
				return lower.endsWith(".zip") && lower.includes("chrome");
			});

			if (chromeAsset?.browser_download_url) {
				window.open(chromeAsset.browser_download_url, "_blank");
				return;
			}

			if (data.html_url) {
				window.open(data.html_url, "_blank");
				return;
			}
		}
	} catch (error) {
		console.warn("Failed to query latest release from GitHub API:", error);
	}

	// Fallback to opening GitHub releases page directly
	window.open(GITHUB_RELEASES_URL, "_blank");
}
