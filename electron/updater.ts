import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, ipcMain, net, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { isDev, REPO_CONFIG } from "./config.js";

// ── Update State Machine ──────────────────────────────────────────────────────
// The main process is the single source of truth for update status. Renderers
// only subscribe to `updater:state` broadcasts and issue commands via IPC —
// they never guess outcomes with timers.

export type UpdateStatus =
	| "idle"
	| "checking"
	| "available"
	| "not-available"
	| "downloading"
	| "downloaded"
	| "installing"
	| "error";

export interface UpdateState {
	status: UpdateStatus;
	currentVersion: string;
	latestVersion?: string;
	releaseNotes?: string;
	releaseDate?: string;
	/** 0-100 while status === "downloading" */
	progress?: number;
	/** Absolute path of the local installer once downloaded */
	downloadedFile?: string;
	/** true = quitAndInstall works (Windows NSIS / signed macOS); false = manual DMG flow */
	canAutoInstall: boolean;
	checkedAt?: number;
	error?: string;
}

const STARTUP_CHECK_DELAY_MS = 8_000;
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

let state: UpdateState = {
	status: "idle",
	currentVersion: app.getVersion(),
	canAutoInstall: false,
};

/** DMG file metadata captured from the latest update check (unsigned macOS flow) */
let pendingDmgFile: { fileName: string; sha512?: string } | null = null;

function setState(patch: Partial<UpdateState>): void {
	state = { ...state, ...patch };
	broadcastState();
}

function broadcastState(): void {
	for (const win of BrowserWindow.getAllWindows()) {
		if (!win.isDestroyed()) {
			win.webContents.send("updater:state", state);
		}
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Numeric semver-ish comparison: returns >0 if a > b, <0 if a < b, 0 if equal */
function compareVersions(a: string, b: string): number {
	const pa = a.replace(/^v/, "").split(".").map((n) => Number.parseInt(n, 10) || 0);
	const pb = b.replace(/^v/, "").split(".").map((n) => Number.parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const diff = (pa[i] || 0) - (pb[i] || 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

function normalizeReleaseNotes(notes: unknown): string | undefined {
	if (typeof notes === "string") return notes;
	if (Array.isArray(notes)) {
		return notes
			.map((n) =>
				typeof n === "object" && n !== null && "note" in n
					? String((n as { note: unknown }).note)
					: JSON.stringify(n),
			)
			.join("\n");
	}
	return undefined;
}

/**
 * Whether autoUpdater.quitAndInstall can actually replace the app on this machine.
 * - Windows NSIS: works unsigned.
 * - macOS: Squirrel/ShipIt requires a Developer ID signature; adhoc/unsigned builds fail.
 */
function resolveCanAutoInstall(): Promise<boolean> {
	if (process.platform === "win32") return Promise.resolve(true);
	if (process.platform !== "darwin" || !app.isPackaged) return Promise.resolve(false);

	return new Promise((resolve) => {
		const bundlePath = path.resolve(app.getPath("exe"), "..", "..", "..");
		const child = spawn("codesign", ["-dv", "--verbose=4", bundlePath]);
		let output = "";
		child.stdout.on("data", (chunk) => {
			output += chunk;
		});
		child.stderr.on("data", (chunk) => {
			output += chunk;
		});
		child.on("error", () => resolve(false));
		child.on("close", (code) => {
			if (code !== 0) return resolve(false);
			const team = output.match(/TeamIdentifier=(.+)/)?.[1]?.trim();
			resolve(Boolean(team && team !== "not set"));
		});
	});
}

// ── Core Flows ────────────────────────────────────────────────────────────────

async function runCheck(): Promise<UpdateState> {
	if (state.status === "checking" || state.status === "downloading") {
		return state;
	}
	const prev = { ...state };
	setState({ status: "checking", error: undefined, checkedAt: Date.now() });

	try {
		const result = await autoUpdater.checkForUpdates();
		const latest = result?.updateInfo?.version;

		if (!latest || compareVersions(latest, state.currentVersion) <= 0) {
			setState({ status: "not-available", latestVersion: undefined });
			return state;
		}

		// A newer build is already downloading — keep that state.
		if (latest === prev.latestVersion && prev.status === "downloading") {
			setState({ status: "downloading" });
			return state;
		}

		// Already downloaded this version — keep it only if the installer file
		// still exists on disk; otherwise fall through to "available" so the
		// caller re-downloads a fresh copy instead of trusting a deleted file.
		if (
			latest === prev.latestVersion &&
			prev.status === "downloaded" &&
			prev.downloadedFile &&
			fs.existsSync(prev.downloadedFile)
		) {
			setState({ status: "downloaded" });
			return state;
		}

		pendingDmgFile =
			result?.updateInfo?.files
				?.map((f) => ({ fileName: f.url, sha512: f.sha512 }))
				.find((f) => f.fileName.toLowerCase().endsWith(".dmg")) || null;

		setState({
			status: "available",
			latestVersion: latest,
			releaseNotes: normalizeReleaseNotes(result?.updateInfo?.releaseNotes),
			releaseDate: result?.updateInfo?.releaseDate,
			progress: undefined,
			downloadedFile: undefined,
		});
		return state;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.warn("[updater] check failed:", message);
		setState({ status: "error", error: message });
		return state;
	}
}

async function runDownload(): Promise<UpdateState> {
	if (state.status === "downloading" || state.status === "downloaded") {
		return state;
	}
	// Allow retrying after a failed download as long as we know the target version.
	const canAttempt =
		state.status === "available" ||
		(state.status === "error" && Boolean(state.latestVersion));
	if (!canAttempt || !state.latestVersion) {
		return state;
	}

	setState({ status: "downloading", progress: 0, error: undefined });

	try {
		if (state.canAutoInstall) {
			// Windows NSIS / signed macOS: electron-updater downloads to its cache;
			// progress + update-downloaded events drive the state machine.
			await autoUpdater.downloadUpdate();
		} else if (process.platform === "darwin") {
			await downloadDmgManually();
		} else {
			throw new Error("当前平台暂不支持应用内下载，请前往发布页手动下载");
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.warn("[updater] download failed:", message);
		setState({ status: "error", error: message });
	}
	return state;
}

/**
 * Unsigned macOS builds cannot be installed by Squirrel, so skip the zip that
 * electron-updater would fetch and download the DMG ourselves into userData.
 * The user gets a real local installer with in-app progress and sha512 verification.
 */
async function downloadDmgManually(): Promise<void> {
	if (!pendingDmgFile || !state.latestVersion) {
		throw new Error("未找到 DMG 安装包信息，请重新检查更新");
	}

	const { fileName, sha512 } = pendingDmgFile;
	const url = `https://github.com/${REPO_CONFIG.REPO}/releases/download/v${state.latestVersion}/${encodeURIComponent(fileName)}`;
	const destDir = path.join(app.getPath("userData"), "updates");
	fs.mkdirSync(destDir, { recursive: true });
	const destPath = path.join(destDir, fileName);

	const response = await net.fetch(url, { redirect: "follow" });
	if (!response.ok || !response.body) {
		throw new Error(`安装包下载失败 (HTTP ${response.status})`);
	}

	const total = Number(response.headers.get("content-length") || 0);
	const reader = response.body.getReader();
	const handle = await fs.promises.open(destPath, "w");
	let transferred = 0;
	let lastReported = -1;

	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			await handle.write(value);
			transferred += value.length;
			if (total > 0) {
				const percent = Math.round((transferred / total) * 100);
				if (percent !== lastReported) {
					lastReported = percent;
					setState({ progress: percent });
				}
			}
		}
	} finally {
		await handle.close();
	}

	if (sha512 && !(await verifySha512(destPath, sha512))) {
		fs.rmSync(destPath, { force: true });
		throw new Error("安装包完整性校验失败，请重新下载");
	}

	setState({ status: "downloaded", progress: 100, downloadedFile: destPath });
}

async function verifySha512(
	file: string,
	expectedBase64: string,
): Promise<boolean> {
	const digest = crypto.createHash("sha512");
	await new Promise<void>((resolvePromise, rejectPromise) => {
		fs.createReadStream(file)
			.on("data", (chunk) => digest.update(chunk))
			.on("end", () => resolvePromise())
			.on("error", rejectPromise);
	});
	return digest.digest("base64") === expectedBase64;
}

async function checkThenAutoDownload(): Promise<void> {
	const result = await runCheck();
	if (result.status === "available") {
		await runDownload();
	}
}

/**
 * If the state machine believes an update is ready but the local installer was
 * deleted (or moved) since, demote back to "available" so the UI switches from
 * "install now" to "download again". Returns true when a demotion happened.
 */
function demoteIfInstallerMissing(): boolean {
	if (state.status !== "downloaded" && state.status !== "installing") {
		return false;
	}
	if (state.downloadedFile && fs.existsSync(state.downloadedFile)) {
		return false;
	}
	setState({
		status: "available",
		progress: undefined,
		downloadedFile: undefined,
	});
	return true;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupAutoUpdater(): void {
	// IPC handlers are registered in every mode so the renderer bridge is stable.
	ipcMain.handle("app:get-version", () => app.getVersion());
	ipcMain.handle("updater:get-state", () => state);

	ipcMain.handle("updater:check", async () => {
		if (isDev) {
			return { ...state, status: "dev" as const };
		}
		return runCheck();
	});

	ipcMain.handle("updater:download", async () => {
		if (isDev) return { ...state, status: "dev" as const };
		return runDownload();
	});

	ipcMain.handle("updater:install", async () => {
		if (state.status !== "downloaded") {
			return { status: "not-ready", message: "更新尚未下载完成" };
		}
		if (demoteIfInstallerMissing()) {
			return {
				status: "error",
				message: "本地安装包已被删除，请重新下载",
			};
		}

		if (state.canAutoInstall) {
			setState({ status: "installing" });
			setImmediate(() => autoUpdater.quitAndInstall(false, true));
			return { status: "installing" };
		}

		// Unsigned macOS: open the local DMG and quit so the user can drag-replace.
		const file = state.downloadedFile;
		if (file && fs.existsSync(file)) {
			// Re-verify integrity right before installing — a stale/corrupt local
			// file must not derail the update flow; fall back to a fresh download.
			if (pendingDmgFile?.sha512) {
				const intact = await verifySha512(file, pendingDmgFile.sha512);
				if (!intact) {
					fs.rmSync(file, { force: true });
					setState({
						status: "available",
						progress: undefined,
						downloadedFile: undefined,
					});
					return {
						status: "error",
						message: "本地安装包已损坏，请重新下载",
					};
				}
			}
			const openError = await shell.openPath(file);
			if (!openError) {
				setTimeout(() => app.quit(), 1500);
				return { status: "opened_file", path: file };
			}
			return { status: "error", message: openError };
		}
		return { status: "error", message: "本地安装包不存在，请重新下载" };
	});

	ipcMain.handle("updater:open-downloaded-file", async () => {
		demoteIfInstallerMissing();
		const file = state.downloadedFile;
		if (file && fs.existsSync(file)) {
			const openError = await shell.openPath(file);
			if (openError) {
				shell.showItemInFolder(file);
			}
			return { status: "success", isLocal: true, path: file };
		}
		shell.openExternal(REPO_CONFIG.RELEASES_URL);
		return { status: "opened_url", isLocal: false, url: REPO_CONFIG.RELEASES_URL };
	});

	ipcMain.handle("updater:show-downloaded-in-folder", () => {
		demoteIfInstallerMissing();
		const file = state.downloadedFile;
		if (file && fs.existsSync(file)) {
			shell.showItemInFolder(file);
			return { status: "success", path: file };
		}
		return { status: "error", message: "本地安装包不存在，请重新下载" };
	});

	if (isDev) return;

	void initializeUpdater();
}

async function initializeUpdater(): Promise<void> {
	const canAutoInstall = await resolveCanAutoInstall();
	console.log(
		`[updater] platform=${process.platform} canAutoInstall=${canAutoInstall}`,
	);
	state = { ...state, canAutoInstall };

	autoUpdater.autoDownload = false;
	autoUpdater.autoInstallOnAppQuit = true;

	autoUpdater.on("download-progress", (progress) => {
		if (state.status !== "downloading") return;
		setState({ progress: Math.round(progress.percent) });
	});

	autoUpdater.on("update-downloaded", (info) => {
		const downloadedFile =
			(info as { downloadedFile?: string }).downloadedFile || undefined;
		setState({
			status: "downloaded",
			progress: 100,
			latestVersion: info.version || state.latestVersion,
			downloadedFile,
		});
	});

	autoUpdater.on("error", (err) => {
		// Only surface failures from an in-flight check/download; never clobber a
		// ready-to-install state with background noise.
		if (state.status === "checking" || state.status === "downloading") {
			const message = err instanceof Error ? err.message : String(err);
			console.warn("[updater] error:", message);
			setState({ status: "error", error: message });
		}
	});

	// Always check fresh on startup (no local-file restore — a stale or corrupt
	// installer must never short-circuit the update flow), then poll periodically.
	setTimeout(() => {
		checkThenAutoDownload().catch((err) =>
			console.warn("[updater] startup check failed:", err),
		);
	}, STARTUP_CHECK_DELAY_MS);

	setInterval(() => {
		checkThenAutoDownload().catch((err) =>
			console.warn("[updater] poll check failed:", err),
		);
	}, POLL_INTERVAL_MS);
}
