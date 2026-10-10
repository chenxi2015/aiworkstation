import { app, BrowserWindow, dialog } from "electron";
import { isDev, resolveFromRoot } from "./config.js";
import { startNitroServer, stopNitroServer } from "./server.js";
import { setupAutoUpdater } from "./updater.js";
import { createMainWindow, focusMainWindow } from "./window.js";

// ── Enforce Single Instance ───────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
	app.quit();
} else {
	// If a second instance attempts to run, restore and focus the existing window
	app.on("second-instance", () => {
		focusMainWindow();
	});

	// ── Application Initialization ──────────────────────────────────────────────
	app.whenReady().then(async () => {
		// Set dock icon in dev mode (packaged app uses build/icon.icns automatically)
		if (isDev && process.platform === "darwin") {
			const devIconPath = resolveFromRoot("build", "icon.png");
			app.dock?.setIcon(devIconPath);
		}

		try {
			const serverPort = await startNitroServer();
			await createMainWindow(serverPort);
			setupAutoUpdater();
		} catch (err) {
			console.error("[electron] Startup failed:", err);
			dialog.showErrorBox(
				"Application Startup Error",
				`Failed to start local service:\n${err instanceof Error ? err.message : String(err)}`,
			);
			app.quit();
		}

		// macOS: re-create window when dock icon is clicked
		app.on("activate", async () => {
			if (BrowserWindow.getAllWindows().length === 0) {
				const { getServerPort } = await import("./server.js");
				await createMainWindow(getServerPort());
			}
		});
	});

	// ── Application Lifecycle Events ────────────────────────────────────────────
	app.on("window-all-closed", () => {
		if (process.platform !== "darwin") {
			app.quit();
		}
	});

	const cleanup = () => {
		stopNitroServer();
	};

	app.on("before-quit", cleanup);
	process.on("exit", cleanup);
	process.on("SIGINT", () => {
		cleanup();
		process.exit(0);
	});
}
