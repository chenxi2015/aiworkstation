import fs from "node:fs";
import path from "node:path";
import { app, ipcMain, shell, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { isDev, REPO_CONFIG } from "./config.js";

/**
 * Locate existing local DMG installer in updater cache or system downloads folder
 */
function resolveLocalInstallerFile(targetVersion?: string): string | null {
	if (process.platform !== "darwin") {
		return null;
	}

	const candidatesDirs = [
		path.join(app.getPath("home"), "Library", "Caches", "aiworkstation-updater", "pending"),
		path.join(app.getPath("home"), "Library", "Caches", "aiworkstation-updater"),
		app.getPath("downloads"),
	];

	for (const dir of candidatesDirs) {
		try {
			if (!fs.existsSync(dir)) continue;
			const files = fs.readdirSync(dir);
			const dmgFiles = files
				.filter((f) => f.toLowerCase().endsWith(".dmg") && f.toLowerCase().includes("workstation"))
				.map((f) => {
					const fullPath = path.join(dir, f);
					const stat = fs.statSync(fullPath);
					return { fullPath, name: f, mtime: stat.mtimeMs };
				})
				.sort((a, b) => b.mtime - a.mtime);

			if (dmgFiles.length === 0) continue;

			if (targetVersion) {
				const matched = dmgFiles.find((f) => f.name.includes(targetVersion));
				if (matched) return matched.fullPath;
			}

			return dmgFiles[0].fullPath;
		} catch {
			// Skip directories that cannot be accessed
		}
	}

	return null;
}

/**
 * Setup and initialize application auto update services and IPC handlers
 */
export function setupAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
	let downloadedFilePath: string | null = null;
	let latestTargetVersion: string | null = null;
	let latestDownloadUrl: string | null = null;

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
			if (latestVersion) {
				latestTargetVersion = latestVersion;
			}
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
			if (process.platform === "darwin") {
				setTimeout(async () => {
					const targetDmg =
						(downloadedFilePath && fs.existsSync(downloadedFilePath) ? downloadedFilePath : null) ||
						resolveLocalInstallerFile(latestTargetVersion || undefined);
					if (targetDmg) {
						console.warn("[electron] Fallback: opening downloaded DMG directly:", targetDmg);
						downloadedFilePath = targetDmg;
						await shell.openPath(targetDmg);
					}
				}, 2000);
			}

			autoUpdater.quitAndInstall(false, true);
			return { status: "success" };
		} catch (err) {
			console.error("[electron] quitAndInstall failed:", err);
			if (process.platform === "darwin") {
				const targetDmg =
					(downloadedFilePath && fs.existsSync(downloadedFilePath) ? downloadedFilePath : null) ||
					resolveLocalInstallerFile(latestTargetVersion || undefined);
				if (targetDmg) {
					await shell.openPath(targetDmg);
					return {
						status: "opened_file",
						message: "macOS 签名限制，已为您直接打开安装包",
						openedFile: true,
					};
				}
			}
			return {
				status: "error",
				message: err instanceof Error ? err.message : String(err),
			};
		}
	});

	// Manually open downloaded update file in system file manager or mount DMG
	ipcMain.handle("updater:open-downloaded-file", async () => {
		let targetPath =
			downloadedFilePath && fs.existsSync(downloadedFilePath) ? downloadedFilePath : null;

		if (!targetPath) {
			targetPath = resolveLocalInstallerFile(latestTargetVersion || undefined);
		}

		if (targetPath) {
			downloadedFilePath = targetPath;
			const openErr = await shell.openPath(targetPath);
			if (!openErr) {
				return { status: "success", isLocal: true, path: targetPath };
			}
			console.warn("[electron] shell.openPath failed, falling back to showItemInFolder:", openErr);
			shell.showItemInFolder(targetPath);
			return { status: "success", isLocal: true, path: targetPath };
		}

		// Fallback: If no local dmg installer file is found on disk, open web release page
		const targetUrl = latestDownloadUrl || REPO_CONFIG.RELEASES_URL;
		shell.openExternal(targetUrl);
		return { status: "opened_url", isLocal: false, url: targetUrl };
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
		if (info?.version) {
			latestTargetVersion = info.version;
		}
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
