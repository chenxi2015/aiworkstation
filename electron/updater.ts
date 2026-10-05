import { app, ipcMain, shell, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { isDev, REPO_CONFIG } from "./config.js";

/**
 * Setup and initialize application auto update services and IPC handlers
 */
export function setupAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
	let downloadedFilePath: string | null = null;

	// ── IPC Handlers ────────────────────────────────────────────────────────────

	// Return current running application version
	ipcMain.handle("app:get-version", () => {
		return app.getVersion();
	});

	// Trigger manual update check from renderer
	ipcMain.handle("updater:check-for-updates", async () => {
		const currentVersion = app.getVersion();
		if (isDev) {
			return {
				status: "dev",
				message: "开发模式下不执行实际版本检查",
				currentVersion,
			};
		}
		try {
			const res = await autoUpdater.checkForUpdates();
			const latestVersion = res?.updateInfo?.version;
			const hasUpdate = Boolean(latestVersion && latestVersion !== currentVersion);
			return {
				status: "success",
				hasUpdate,
				currentVersion,
				latestVersion,
				updateInfo: res?.updateInfo,
			};
		} catch (err) {
			return {
				status: "error",
				message: err instanceof Error ? err.message : String(err),
				currentVersion,
			};
		}
	});

	// Trigger manual download from renderer
	ipcMain.handle("updater:start-download", () => {
		try {
			autoUpdater.downloadUpdate();
			return { status: "success" };
		} catch (err) {
			console.error("[electron] downloadUpdate failed:", err);
			return {
				status: "error",
				message: err instanceof Error ? err.message : String(err),
			};
		}
	});

	// Trigger installation and app restart
	ipcMain.handle("updater:install", async () => {
		try {
			console.log("[electron] Attempting autoUpdater.quitAndInstall...");

			// On macOS, unsigned builds fail Apple's Code Signature Verification in ShipIt.
			// Fallback to opening DMG directly if quitAndInstall does not terminate the app.
			if (process.platform === "darwin" && downloadedFilePath) {
				setTimeout(async () => {
					console.warn(
						"[electron] Fallback: opening downloaded DMG directly:",
						downloadedFilePath,
					);
					if (downloadedFilePath) {
						await shell.openPath(downloadedFilePath);
					}
				}, 2000);
			}

			autoUpdater.quitAndInstall(false, true);
			return { status: "success" };
		} catch (err) {
			console.error("[electron] quitAndInstall failed:", err);
			if (process.platform === "darwin" && downloadedFilePath) {
				await shell.openPath(downloadedFilePath);
				return {
					status: "opened_file",
					message: "macOS 签名限制，已为您直接打开安装包",
					openedFile: true,
				};
			}
			return {
				status: "error",
				message: err instanceof Error ? err.message : String(err),
			};
		}
	});

	// Manually open downloaded update file in system file manager
	ipcMain.handle("updater:open-downloaded-file", async () => {
		if (downloadedFilePath) {
			await shell.openPath(downloadedFilePath);
			return { status: "success" };
		}
		shell.openExternal(REPO_CONFIG.RELEASES_URL);
		return { status: "opened_url" };
	});

	// ── autoUpdater Event Subscriptions ─────────────────────────────────────────

	if (isDev) return;

	autoUpdater.autoDownload = false;
	autoUpdater.autoInstallOnAppQuit = true;

	autoUpdater.on("download-progress", (progress) => {
		const mainWindow = getMainWindow();
		if (!mainWindow || mainWindow.isDestroyed()) return;
		mainWindow.webContents.send("updater:download-progress", {
			percent: Math.round(progress.percent),
			bytesPerSecond: progress.bytesPerSecond,
			transferred: progress.transferred,
			total: progress.total,
		});
	});

	autoUpdater.on("update-downloaded", (info) => {
		downloadedFilePath = (info as { downloadedFile?: string })?.downloadedFile || null;
		const mainWindow = getMainWindow();
		if (!mainWindow || mainWindow.isDestroyed()) return;
		mainWindow.webContents.send("updater:update-downloaded", {
			version: info.version,
			releaseNotes:
				typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
			releaseDate: info.releaseDate,
		});
	});

	autoUpdater.on("error", (err) => {
		console.warn("[electron] auto-update error:", err?.message ?? err);
	});

	// Trigger initial background check on startup
	autoUpdater.checkForUpdates().catch((err: unknown) => {
		console.warn("[electron] update check failed:", err instanceof Error ? err.message : err);
	});
}
