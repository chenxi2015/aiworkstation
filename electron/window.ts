import { BrowserWindow, ipcMain, screen, session, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { isDev, resolveDataDir, resolvePreloadPath, SERVER_CONFIG, WINDOW_CONFIG } from "./config.js";

export type WindowMode = "login" | "main";

const WINDOW_MODE_FILE = "window-mode.json";

/**
 * Retrieve the saved window mode from local persistence
 */
function getStoredWindowMode(): WindowMode {
	try {
		const filePath = path.join(resolveDataDir(), WINDOW_MODE_FILE);
		if (fs.existsSync(filePath)) {
			const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
			if (data.mode === "login" || data.mode === "main") {
				return data.mode;
			}
		}
	} catch (err) {
		console.warn("[electron] Failed to read stored window mode:", err);
	}
	return "login";
}

/**
 * Persist the current window mode to local disk
 */
function saveStoredWindowMode(mode: WindowMode): void {
	try {
		const dir = resolveDataDir();
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.writeFileSync(path.join(dir, WINDOW_MODE_FILE), JSON.stringify({ mode }), "utf-8");
	} catch (err) {
		console.warn("[electron] Failed to save stored window mode:", err);
	}
}

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let currentWindowMode: WindowMode = getStoredWindowMode();

/**
 * Set the quitting state flag before application exit
 */
export function setIsQuitting(val: boolean): void {
	isQuitting = val;
}

/**
 * Get the current quitting state flag
 */
export function getIsQuitting(): boolean {
	return isQuitting;
}

/**
 * Switch the application window between compact login modal and full dashboard layout.
 * Uses center-anchored setBounds animation so the window expands/collapses symmetrically
 * from the center instead of expanding to the bottom-right.
 * Safely handles Windows Win32 window styles (WS_THICKFRAME) and minimum size constraints.
 */
export async function setWindowMode(mode: WindowMode): Promise<void> {
	if (!mainWindow || mainWindow.isDestroyed()) return;

	const currentBounds = mainWindow.getBounds();
	const currentDisplay = screen.getDisplayMatching(currentBounds);
	const { x: workX, y: workY, width: workWidth, height: workHeight } = currentDisplay.workArea;

	// Calculate the current window center point
	const currentCenterX = currentBounds.x + currentBounds.width / 2;
	const currentCenterY = currentBounds.y + currentBounds.height / 2;

	if (mode === "login") {
		currentWindowMode = "login";
		saveStoredWindowMode("login");

		const targetWidth = Math.min(WINDOW_CONFIG.LOGIN_WIDTH, workWidth);
		const targetHeight = Math.min(WINDOW_CONFIG.LOGIN_HEIGHT, workHeight);

		// Align to center of the current window location
		let targetX = Math.round(currentCenterX - targetWidth / 2);
		let targetY = Math.round(currentCenterY - targetHeight / 2);

		// Clamp within current display work area
		targetX = Math.max(workX, Math.min(targetX, workX + workWidth - targetWidth));
		targetY = Math.max(workY, Math.min(targetY, workY + workHeight - targetHeight));

		if (mainWindow.isMaximized()) {
			mainWindow.unmaximize();
		}

		// Unlock constraints first so shrinking is not blocked by current min sizes
		mainWindow.setMinimumSize(0, 0);
		if (process.platform === "win32") {
			mainWindow.setMaximumSize(0, 0);
		} else {
			mainWindow.setMaximumSize(10000, 10000);
		}

		const isDarwin = process.platform === "darwin";
		mainWindow.setBounds(
			{ x: targetX, y: targetY, width: targetWidth, height: targetHeight },
			isDarwin,
		);

		if (process.platform === "win32") {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}

		// Apply constraints for compact login window
		mainWindow.setResizable(false);
		mainWindow.setMaximizable(false);
		mainWindow.setMinimumSize(targetWidth, targetHeight);
		mainWindow.setMaximumSize(targetWidth, targetHeight);
	} else {
		const optimalWidth = Math.min(WINDOW_CONFIG.OPTIMAL_WIDTH, workWidth);
		const optimalHeight = Math.min(WINDOW_CONFIG.OPTIMAL_HEIGHT, workHeight);
		const minWidth = Math.min(WINDOW_CONFIG.MIN_WIDTH, workWidth);
		const minHeight = Math.min(WINDOW_CONFIG.MIN_HEIGHT, workHeight);

		// Avoid redundant resize if already expanded in main mode and bounds are adequate
		if (
			currentWindowMode === "main" &&
			currentBounds.width >= minWidth &&
			currentBounds.height >= minHeight
		) {
			return;
		}

		currentWindowMode = "main";
		saveStoredWindowMode("main");

		// Align to center of the current window location
		let targetX = Math.round(currentCenterX - optimalWidth / 2);
		let targetY = Math.round(currentCenterY - optimalHeight / 2);

		// Clamp within current display work area
		targetX = Math.max(workX, Math.min(targetX, workX + workWidth - optimalWidth));
		targetY = Math.max(workY, Math.min(targetY, workY + workHeight - optimalHeight));

		// 1. If window was minimized/maximized, restore normal state
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		if (mainWindow.isMaximized()) {
			mainWindow.unmaximize();
		}

		// 2. Unlock resizability and maximizeability BEFORE changing constraints or bounds
		mainWindow.setResizable(true);
		mainWindow.setMaximizable(true);

		// 3. Clear minimum size and maximum size constraints first
		// (On Windows Win32, minWidth cannot be set before the window bounds exceed it)
		mainWindow.setMinimumSize(0, 0);
		if (process.platform === "win32") {
			mainWindow.setMaximumSize(0, 0);
		} else {
			mainWindow.setMaximumSize(10000, 10000);
		}

		// 4. Yield a tick on Windows to allow native window styles (WS_THICKFRAME) to apply
		if (process.platform === "win32") {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}

		// 5. Apply the target expanded bounds (smooth native animation on macOS)
		const isDarwin = process.platform === "darwin";
		mainWindow.setBounds(
			{ x: targetX, y: targetY, width: optimalWidth, height: optimalHeight },
			isDarwin,
		);

		// 6. Verify and retry for Windows OS message pump settling
		if (process.platform === "win32") {
			await new Promise((resolve) => setTimeout(resolve, 60));
			const settledBounds = mainWindow.getBounds();
			if (
				settledBounds.width < minWidth ||
				settledBounds.height < minHeight ||
				settledBounds.width < optimalWidth - 100
			) {
				console.warn(
					"[electron] Windows bounds did not settle properly, reapplying target bounds:",
					settledBounds,
				);
				mainWindow.setBounds(
					{ x: targetX, y: targetY, width: optimalWidth, height: optimalHeight },
					false,
				);
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		}

		// 7. Finally apply minWidth / minHeight constraints after window has reached target size
		mainWindow.setMinimumSize(minWidth, minHeight);
	}
}

let isAntiHotlinkConfigured = false;

/**
 * Strips Referer and Origin headers for major hotlink-protected image CDNs
 * (e.g. WeChat, Zhihu, Sina) so images display directly in rich text without local downloading.
 */
function setupAntiHotlinkHeaders(): void {
	if (isAntiHotlinkConfigured) return;
	isAntiHotlinkConfigured = true;

	const HOTLINK_URL_PATTERNS = [
		"*://*.qpic.cn/*",
		"*://*.weixin.qq.com/*",
		"*://*.zhimg.com/*",
		"*://*.sinaimg.cn/*",
	];

	session.defaultSession.webRequest.onBeforeSendHeaders(
		{ urls: HOTLINK_URL_PATTERNS },
		(details, callback) => {
			delete details.requestHeaders.Referer;
			delete details.requestHeaders.Origin;
			callback({ requestHeaders: details.requestHeaders });
		},
	);
}

/**
 * Create and configure the primary application BrowserWindow
 */
export async function createMainWindow(serverPort: number): Promise<BrowserWindow> {
	setupAntiHotlinkHeaders();

	const primaryDisplay = screen.getPrimaryDisplay();
	const { width: workWidth, height: workHeight } = primaryDisplay.workAreaSize;

	const optimalWidth = Math.min(WINDOW_CONFIG.OPTIMAL_WIDTH, workWidth);
	const optimalHeight = Math.min(WINDOW_CONFIG.OPTIMAL_HEIGHT, workHeight);
	const minWidth = Math.min(WINDOW_CONFIG.MIN_WIDTH, workWidth);
	const minHeight = Math.min(WINDOW_CONFIG.MIN_HEIGHT, workHeight);

	const initialMode = getStoredWindowMode();
	currentWindowMode = initialMode;
	const isLoginMode = initialMode === "login";

	const initialWidth = isLoginMode
		? Math.min(WINDOW_CONFIG.LOGIN_WIDTH, workWidth)
		: optimalWidth;
	const initialHeight = isLoginMode
		? Math.min(WINDOW_CONFIG.LOGIN_HEIGHT, workHeight)
		: optimalHeight;

	mainWindow = new BrowserWindow({
		width: initialWidth,
		height: initialHeight,
		minWidth: isLoginMode ? initialWidth : minWidth,
		minHeight: isLoginMode ? initialHeight : minHeight,
		maxWidth: isLoginMode ? initialWidth : undefined,
		maxHeight: isLoginMode ? initialHeight : undefined,
		resizable: !isLoginMode,
		maximizable: !isLoginMode,
		center: true,
		titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
		...(process.platform === "darwin"
			? { trafficLightPosition: { x: 18, y: 20 } }
			: {}),
		webPreferences: {
			preload: resolvePreloadPath(),
			contextIsolation: true,
			nodeIntegration: false,
			webSecurity: true,
		},
		autoHideMenuBar: process.platform !== "darwin",
		show: false,
	});

	// On Windows and Linux, remove the default legacy menu bar to keep layout clean
	if (process.platform !== "darwin") {
		mainWindow.removeMenu();
	}

	ipcMain.removeHandler("window:set-mode");
	ipcMain.handle("window:set-mode", async (_event, mode: WindowMode) => {
		await setWindowMode(mode);
		return { success: true };
	});

	const serverUrl = `http://${SERVER_CONFIG.HOST}:${serverPort}`;
	mainWindow.loadURL(serverUrl);

	mainWindow.once("ready-to-show", () => {
		mainWindow?.show();
		if (isDev) {
			mainWindow?.webContents.openDevTools();
		}
	});

	// Retry loading if initial connection refused while server warms up
	mainWindow.webContents.on(
		"did-fail-load",
		(_event, errorCode, errorDescription, validatedURL) => {
			console.error(
				`[electron] Page load failed: ${validatedURL} (${errorCode} - ${errorDescription})`,
			);
			if (errorCode === -102 /* ERR_CONNECTION_REFUSED */) {
				setTimeout(() => {
					mainWindow?.loadURL(serverUrl);
				}, 500);
			}
		},
	);

	// Enable DevTools shortcut (F12 or Cmd+Alt+I) even in packaged app for diagnostics
	mainWindow.webContents.on("before-input-event", (_event, input) => {
		const isDevToolsKey =
			input.key === "F12" ||
			((input.meta || input.control) && input.alt && input.key.toLowerCase() === "i");
		if (isDevToolsKey && input.type === "keyDown") {
			mainWindow?.webContents.toggleDevTools();
		}
	});

	// Open external links in default system browser rather than internal window
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (!url.startsWith(serverUrl)) {
			shell.openExternal(url);
			return { action: "deny" };
		}
		return { action: "allow" };
	});

	// Intercept window close to keep application running in system tray
	mainWindow.on("close", (event) => {
		if (!isQuitting) {
			event.preventDefault();
			mainWindow?.hide();
		}
	});

	mainWindow.on("closed", () => {
		mainWindow = null;
	});

	return mainWindow;
}

/**
 * Get the current primary BrowserWindow instance
 */
export function getMainWindow(): BrowserWindow | null {
	return mainWindow;
}

/**
 * Show, restore, and focus the primary application window
 */
export function showMainWindow(): void {
	if (!mainWindow || mainWindow.isDestroyed()) return;
	if (mainWindow.isMinimized()) {
		mainWindow.restore();
	}
	if (!mainWindow.isVisible()) {
		mainWindow.show();
	}
	mainWindow.focus();
}

/**
 * Focus or restore the main window when a duplicate instance attempts to launch
 */
export function focusMainWindow(): void {
	showMainWindow();
}
