/**
 * Legacy compatibility wrapper for Xiaohongshu session management.
 * Delegates to the unified RedbookPublishService.
 */

import { redbookPublishService } from "./redbook/index.js";

export * from "./redbook/types.js";
export { CHROME_USER_AGENT } from "./redbook/sessionManager.js";

export function getRedbookSession() {
	return redbookPublishService.getSessionManager().getSession();
}

export async function checkRedbookLoginStatus() {
	return redbookPublishService.checkStatus();
}

export async function openRedbookLoginWindow() {
	return redbookPublishService.login();
}

export async function logoutRedbook() {
	return redbookPublishService.logout();
}
