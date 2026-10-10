import { toast } from "@heroui/react";

export type AppUpdateCheckOutcome =
	| "dev"
	| "error"
	| "update-available"
	| "latest";

export interface AppUpdateCheckResult {
	outcome: AppUpdateCheckOutcome;
	currentVersion?: string;
}

/**
 * Shared "check for updates" flow used by both the settings page and the
 * user dropdown menu. Handles the toast + update-modal UX and returns the
 * outcome so callers can refresh their local state.
 *
 * - Electron: drives the main-process updater state machine via IPC; when an
 *   update is available/downloading/downloaded the global UpdateDownloadedModal
 *   (mounted in AppShell, listening to `open-update-modal`) takes over.
 * - Web: compares the running version against the latest GitHub release.
 */
export async function checkForAppUpdate(
	fallbackVersion: string,
): Promise<AppUpdateCheckResult> {
	if (window.electronAPI?.checkForUpdates) {
		const res = await window.electronAPI.checkForUpdates();

		if (res?.status === "dev") {
			toast.info("当前处于开发模式，已是最新代码", { timeout: 2500 });
			return { outcome: "dev", currentVersion: res?.currentVersion };
		}
		if (res?.status === "error") {
			toast.warning(`检查更新失败: ${res.error || "网络异常"}`, {
				timeout: 3000,
			});
			return { outcome: "error", currentVersion: res?.currentVersion };
		}
		if (
			res?.status === "available" ||
			res?.status === "downloading" ||
			res?.status === "downloaded"
		) {
			// State machine already carries the details — just open the modal.
			window.dispatchEvent(
				new CustomEvent("open-update-modal", { detail: {} }),
			);
			return {
				outcome: "update-available",
				currentVersion: res?.currentVersion,
			};
		}

		toast.success(
			`当前已是最新版本 (v${res?.currentVersion || fallbackVersion})`,
			{ timeout: 2500 },
		);
		return { outcome: "latest", currentVersion: res?.currentVersion };
	}

	// Lazy import: config/app does dynamic import.meta.env access which crashes
	// the Vite SSR module runner, so it must stay out of the server module graph
	// (this helper is statically imported by the SSR-rendered header).
	const { REPO_CONFIG } = await import("../../config/app");

	const response = await fetch(REPO_CONFIG.RELEASES_API_URL);
	if (response.ok) {
		const data = (await response.json()) as {
			tag_name?: string;
			body?: string;
			html_url?: string;
		};
		const latestTag = (data?.tag_name || "").replace(/^v/, "");
		if (latestTag && latestTag !== fallbackVersion) {
			window.dispatchEvent(
				new CustomEvent("open-update-modal", {
					detail: {
						updateInfo: {
							version: latestTag,
							releaseNotes: data.body,
							downloadUrl: data.html_url || REPO_CONFIG.URL,
						},
					},
				}),
			);
			return { outcome: "update-available" };
		}
	}

	toast.success(`当前已是最新版本 (v${fallbackVersion})`, { timeout: 2500 });
	return { outcome: "latest" };
}
