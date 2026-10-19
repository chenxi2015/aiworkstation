import { ipcMain } from "electron";
import {
	type RedbookPublishPayload,
	redbookPublishService,
} from "./redbook/index.js";

/**
 * Register all IPC channels for Xiaohongshu publishing and session management
 */
export function setupRedbookPublishIPC(): void {
	// 1. Open QR code login window
	ipcMain.removeHandler("redbook:login");
	ipcMain.handle("redbook:login", async () => {
		try {
			return await redbookPublishService.login();
		} catch (err) {
			console.error("[electron] redbook:login error:", err);
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	});

	// 2. Check current login status
	ipcMain.removeHandler("redbook:check-status");
	ipcMain.handle("redbook:check-status", async () => {
		try {
			return await redbookPublishService.checkStatus();
		} catch (err) {
			console.error("[electron] redbook:check-status error:", err);
			return { isLoggedIn: false };
		}
	});

	// 3. Switch account (clears credentials first)
	ipcMain.removeHandler("redbook:switch-account");
	ipcMain.handle("redbook:switch-account", async () => {
		try {
			return await redbookPublishService.switchAccount();
		} catch (err) {
			console.error("[electron] redbook:switch-account error:", err);
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	});

	// 4. Clear session cookies / logout
	ipcMain.removeHandler("redbook:logout");
	ipcMain.handle("redbook:logout", async () => {
		try {
			return await redbookPublishService.logout();
		} catch (err) {
			console.error("[electron] redbook:logout error:", err);
			return { success: false };
		}
	});

	// 5. Open creator service platform window
	ipcMain.removeHandler("redbook:open-creator-page");
	ipcMain.handle("redbook:open-creator-page", async (_event, url?: string) => {
		try {
			return await redbookPublishService.openCreatorPage(url);
		} catch (err) {
			console.error("[electron] redbook:open-creator-page error:", err);
			return { success: false };
		}
	});

	// 4. Execute native publishing
	ipcMain.removeHandler("redbook:publish");
	ipcMain.handle(
		"redbook:publish",
		async (_event, payload: RedbookPublishPayload) => {
			try {
				return await redbookPublishService.publish(payload);
			} catch (err) {
				console.error("[electron] redbook:publish error:", err);
				return {
					success: false,
					mode: payload.mode || "fill_only",
					message: `发布失败: ${err instanceof Error ? err.message : String(err)}`,
					error: err instanceof Error ? err.message : String(err),
				};
			}
		},
	);
}

export * from "./redbook/index.js";
