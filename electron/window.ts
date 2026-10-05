import { BrowserWindow, ipcMain, screen, shell } from "electron";
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

/**
 * Switch the application window between compact login modal and full dashboard layout.
 * Uses center-anchored setBounds animation so the window expands/collapses symmetrically
 * from the center instead of expanding to the bottom-right.
 */
export function setWindowMode(mode: WindowMode): void {
	if (!mainWindow || mainWindow.isDestroyed()) return;

	saveStoredWindowMode(mode);

	const currentBounds = mainWindow.getBounds();
	const currentDisplay = screen.getDisplayMatching(currentBounds);
	const { x: workX, y: workY, width: workWidth, height: workHeight } = currentDisplay.workArea;

	// Calculate the current window center point
	const currentCenterX = currentBounds.x + currentBounds.width / 2;
	const currentCenterY = currentBounds.y + currentBounds.height / 2;

	if (mode === "login") {
		const targetWidth = Math.min(WINDOW_CONFIG.LOGIN_WIDTH, workWidth);
		const targetHeight = Math.min(WINDOW_CONFIG.LOGIN_HEIGHT, workHeight);

		// Align to center of the current window location
		let targetX = Math.round(currentCenterX - targetWidth / 2);
		let targetY = Math.round(currentCenterY - targetHeight / 2);

		// Clamp within current display work area
		targetX = Math.max(workX, Math.min(targetX, workX + workWidth - targetWidth));
		targetY = Math.max(workY, Math.min(targetY, workY + workHeight - targetHeight));

		// Apply constraints for compact login window
		mainWindow.setMinimumSize(targetWidth, targetHeight);
		mainWindow.setMaximumSize(targetWidth, targetHeight);
		mainWindow.setResizable(false);
		mainWindow.setMaximizable(false);
		mainWindow.setBounds(
			{ x: targetX, y: targetY, width: targetWidth, height: targetHeight },
			false,
		);
	} else {
		const optimalWidth = Math.min(WINDOW_CONFIG.OPTIMAL_WIDTH, workWidth);
		const optimalHeight = Math.min(WINDOW_CONFIG.OPTIMAL_HEIGHT, workHeight);
		const minWidth = Math.min(WINDOW_CONFIG.MIN_WIDTH, workWidth);
		const minHeight = Math.min(WINDOW_CONFIG.MIN_HEIGHT, workHeight);

		// Align to center of the current window location
		let targetX = Math.round(currentCenterX - optimalWidth / 2);
		let targetY = Math.round(currentCenterY - optimalHeight / 2);

		// Clamp within current display work area
		targetX = Math.max(workX, Math.min(targetX, workX + workWidth - optimalWidth));
		targetY = Math.max(workY, Math.min(targetY, workY + workHeight - optimalHeight));

		// Release restrictions for full workspace view
		mainWindow.setMaximumSize(10000, 10000);
		mainWindow.setMinimumSize(minWidth, minHeight);
		mainWindow.setResizable(true);
		mainWindow.setMaximizable(true);
		mainWindow.setBounds(
			{ x: targetX, y: targetY, width: optimalWidth, height: optimalHeight },
			false,
		);
	}
}

/**
 * Create and configure the primary application BrowserWindow
 */
export async function createMainWindow(serverPort: number): Promise<BrowserWindow> {
	const primaryDisplay = screen.getPrimaryDisplay();
	const { width: workWidth, height: workHeight } = primaryDisplay.workAreaSize;

	const optimalWidth = Math.min(WINDOW_CONFIG.OPTIMAL_WIDTH, workWidth);
	const optimalHeight = Math.min(WINDOW_CONFIG.OPTIMAL_HEIGHT, workHeight);
	const minWidth = Math.min(WINDOW_CONFIG.MIN_WIDTH, workWidth);
	const minHeight = Math.min(WINDOW_CONFIG.MIN_HEIGHT, workHeight);

	const initialMode = getStoredWindowMode();
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
		show: false,
	});

	ipcMain.removeHandler("window:set-mode");
	ipcMain.handle("window:set-mode", (_event, mode: WindowMode) => {
		setWindowMode(mode);
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
 * Focus or restore the main window when a duplicate instance attempts to launch
 */
export function focusMainWindow(): void {
	if (mainWindow) {
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	}
}
