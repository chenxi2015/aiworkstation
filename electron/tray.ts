import { app, Menu, nativeImage, Tray } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_CONFIG } from "./config.js";
import { setIsQuitting, showMainWindow } from "./window.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;

/**
 * Resolve the tray icon path across platforms and environments
 */
function resolveTrayIconPath(): string {
	const iconsDir = path.join(__dirname, "icons");

	// Windows: prioritize .ico file
	if (process.platform === "win32") {
		const winIco = path.join(iconsDir, "icon.ico");
		if (fs.existsSync(winIco)) return winIco;
		const rootWinIco = path.resolve(__dirname, "..", "build", "icon.ico");
		if (fs.existsSync(rootWinIco)) return rootWinIco;
	}

	// macOS / Linux: 16x16@2x or 16x16 icon
	const mac2x = path.join(iconsDir, "icon_16x16@2x.png");
	if (fs.existsSync(mac2x)) return mac2x;

	const mac1x = path.join(iconsDir, "icon_16x16.png");
	if (fs.existsSync(mac1x)) return mac1x;

	const iconPng = path.join(iconsDir, "icon.png");
	if (fs.existsSync(iconPng)) return iconPng;

	// Fallback to project root build directory during local development
	const rootIconset = path.resolve(__dirname, "..", "build", "icons.iconset", "icon_16x16@2x.png");
	if (fs.existsSync(rootIconset)) return rootIconset;

	return path.resolve(__dirname, "..", "build", "icon.png");
}

/**
 * Initialize and configure the system tray instance
 */
export function setupTray(): Tray {
	if (tray) return tray;

	const iconPath = resolveTrayIconPath();
	let iconImage = nativeImage.createFromPath(iconPath);

	// On macOS status bar, standard dimensions are 16x16
	if (process.platform === "darwin") {
		iconImage = iconImage.resize({ width: 16, height: 16 });
	}

	tray = new Tray(iconImage);
	tray.setToolTip(APP_CONFIG.NAME);

	const contextMenu = Menu.buildFromTemplate([
		{
			label: `打开 ${APP_CONFIG.NAME}`,
			click: () => {
				showMainWindow();
			},
		},
		{ type: "separator" },
		{
			label: "退出",
			click: () => {
				setIsQuitting(true);
				app.quit();
			},
		},
	]);

	tray.setContextMenu(contextMenu);

	// Left click / double click event handling
	if (process.platform === "win32") {
		tray.on("click", () => {
			showMainWindow();
		});
		tray.on("double-click", () => {
			showMainWindow();
		});
	} else {
		tray.on("double-click", () => {
			showMainWindow();
		});
	}

	return tray;
}

/**
 * Clean up tray instance on application shutdown
 */
export function destroyTray(): void {
	if (tray) {
		tray.destroy();
		tray = null;
	}
}
