import { BrowserWindow, type Session, session } from "electron";
import type {
	RedbookLoginResult,
	RedbookStatusResult,
	RedbookUserInfo,
} from "./types.js";

export const CHROME_USER_AGENT =
	process.platform === "darwin"
		? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
		: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const REDBOOK_PARTITION = "persist:xiaohongshu";
const CREATOR_BASE_URL = "https://creator.xiaohongshu.com";
const USER_INFO_ENDPOINT = "https://creator.xiaohongshu.com/api/galaxy/v1/user/me";

/**
 * Manages Xiaohongshu Electron session, cookies, authentication and QR login window.
 */
export class RedbookSessionManager {
	private isHeadersConfigured = false;

	/**
	 * Get or create dedicated persistent session for Xiaohongshu
	 */
	public getSession(): Session {
		const ses = session.fromPartition(REDBOOK_PARTITION);

		// Clean up the User-Agent to disguise Electron as genuine Google Chrome
		// without breaking Chromium's internal Client Hints (sec-ch-ua) structures
		const rawUA = ses.getUserAgent();
		const cleanUA = rawUA
			.replace(/Electron\/[^\s]+\s?/g, "")
			.replace(/aiworkstation\/[^\s]+\s?/g, "")
			.trim();
		ses.setUserAgent(cleanUA || CHROME_USER_AGENT);

		if (!this.isHeadersConfigured) {
			this.isHeadersConfigured = true;

			// Do NOT overwrite sec-ch-ua client hints in onBeforeSendHeaders!
			// Overwriting client hints in WebRequest causes net::ERR_FAILED (-2) in modern Chromium.
			ses.webRequest.onBeforeSendHeaders((details, callback) => {
				if (!details.requestHeaders["Accept-Language"]) {
					details.requestHeaders["Accept-Language"] =
						"zh-CN,zh;q=0.9,en;q=0.8,en-US;q=0.7";
				}
				callback({ requestHeaders: details.requestHeaders });
			});

			ses.webRequest.onErrorOccurred((details) => {
				if (details.url.includes("xiaohongshu.com")) {
					console.warn(
						`[RedbookSessionManager] Request error: ${details.url} -> ${details.error}`,
					);
				}
			});
		}

		return ses;
	}

	/**
	 * Check if current session has active creator authentication
	 */
	public async checkLoginStatus(): Promise<RedbookStatusResult> {
		const ses = this.getSession();

		try {
			// 1. Inspect cookies for key session tokens
			const cookies = await ses.cookies.get({ domain: ".xiaohongshu.com" });
			const hasSessionCookie = cookies.some(
				(c) => c.name === "web_session" || c.name === "a1",
			);

			if (!hasSessionCookie) {
				return { isLoggedIn: false };
			}

			// 2. Query Xiaohongshu creator user info endpoint using session's fetch
			const response = await ses.fetch(USER_INFO_ENDPOINT, {
				method: "GET",
				headers: {
					Referer: `${CREATOR_BASE_URL}/`,
					Accept: "application/json, text/plain, */*",
				},
			});

			if (response.ok) {
				const data = (await response.json()) as {
					code?: number;
					data?: {
						user_id?: string;
						id?: string;
						nickname?: string;
						name?: string;
						image?: string;
						avatar?: string;
					};
				};

				if (data && data.code === 0 && data.data) {
					const user: RedbookUserInfo = {
						id: data.data.user_id || data.data.id || "",
						nickname: data.data.nickname || data.data.name || "小红书创作者",
						avatar: data.data.image || data.data.avatar || "",
					};
					return {
						isLoggedIn: true,
						user,
					};
				}
			}

			// Fallback: If network check returns unexpected code but session cookie exists
			return {
				isLoggedIn: hasSessionCookie,
				user: {
					id: "",
					nickname: "已登录创作者",
					avatar: "",
				},
			};
		} catch (err) {
			console.warn("[RedbookSessionManager] Failed to verify login status:", err);
			return { isLoggedIn: false };
		}
	}

	/**
	 * Open a standalone window for Xiaohongshu creator QR code login
	 */
	public async openLoginWindow(): Promise<RedbookLoginResult> {
		const ses = this.getSession();

		const loginWin = new BrowserWindow({
			width: 860,
			height: 680,
			title: "小红书创作者服务平台 - 扫码登录",
			autoHideMenuBar: true,
			webPreferences: {
				session: ses,
				contextIsolation: true,
				nodeIntegration: false,
			},
		});

		loginWin.webContents.on(
			"did-fail-load",
			(_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
				if (isMainFrame) {
					console.warn(
						`[RedbookSessionManager] Main frame did-fail-load: code=${errorCode}, desc=${errorDescription}, url=${validatedURL}`,
					);
				}
			},
		);

		try {
			await loginWin.loadURL(`${CREATOR_BASE_URL}/login`);
		} catch (err) {
			console.warn(
				"[RedbookSessionManager] Failed to load /login, falling back to base URL:",
				err,
			);
			try {
				await loginWin.loadURL(CREATOR_BASE_URL);
			} catch (fallbackErr) {
				if (!loginWin.isDestroyed()) {
					loginWin.close();
				}
				return {
					success: false,
					error: `无法加载登录页面: ${err instanceof Error ? err.message : String(err)}`,
				};
			}
		}

		return new Promise((resolve) => {
			let isResolved = false;

			const handleNavigation = async (_event: unknown, targetUrl: string) => {
				if (isResolved) return;

				// If redirected to creator dashboard or publish page after QR scan
				if (
					targetUrl.includes("creator.xiaohongshu.com") &&
					!targetUrl.includes("/login")
				) {
					isResolved = true;

					// Brief pause to allow cookies to settle in persistent storage
					await new Promise((r) => setTimeout(r, 1200));

					const status = await this.checkLoginStatus();

					if (!loginWin.isDestroyed()) {
						loginWin.close();
					}

					resolve({
						success: true,
						user: status.user,
					});
				}
			};

			loginWin.webContents.on("did-navigate", handleNavigation);
			loginWin.webContents.on("did-navigate-in-page", handleNavigation);

			loginWin.on("closed", () => {
				if (!isResolved) {
					isResolved = true;
					resolve({ success: false, error: "用户关闭了登录窗口" });
				}
			});
		});
	}

	/**
	 * Switch account by clearing persistent credentials and launching a fresh QR login window
	 */
	public async switchAccount(): Promise<RedbookLoginResult> {
		// 1. Wipe existing session cookies and cache completely
		await this.logout();
		await new Promise((r) => setTimeout(r, 300));

		// 2. Open clean login window for new QR scan
		return this.openLoginWindow();
	}

	private creatorWin: BrowserWindow | null = null;

	/**
	 * Open Xiaohongshu creator service platform in a dedicated Electron window
	 * allowing the user to view creator home, published notes, analytics and manage their account.
	 */
	public async openCreatorPage(
		url = `${CREATOR_BASE_URL}/creator/home`,
	): Promise<{ success: boolean }> {
		const ses = this.getSession();

		if (this.creatorWin && !this.creatorWin.isDestroyed()) {
			this.creatorWin.show();
			this.creatorWin.focus();
			if (url && this.creatorWin.webContents.getURL() !== url) {
				await this.creatorWin.loadURL(url);
			}
			return { success: true };
		}

		this.creatorWin = new BrowserWindow({
			width: 1280,
			height: 850,
			minWidth: 900,
			minHeight: 600,
			title: "小红书创作者服务平台",
			autoHideMenuBar: true,
			webPreferences: {
				session: ses,
				contextIsolation: true,
				nodeIntegration: false,
			},
		});

		this.creatorWin.on("closed", () => {
			this.creatorWin = null;
		});

		try {
			await this.creatorWin.loadURL(url);
			this.creatorWin.show();
			return { success: true };
		} catch (err) {
			console.warn("[RedbookSessionManager] Failed to load creator page:", err);
			if (this.creatorWin && !this.creatorWin.isDestroyed()) {
				this.creatorWin.show();
			}
			return { success: false };
		}
	}

	/**
	 * Log out and clear stored session cookies for Xiaohongshu
	 */
	public async logout(): Promise<{ success: boolean }> {
		try {
			const ses = this.getSession();
			await ses.clearStorageData();
			return { success: true };
		} catch (err) {
			console.warn("[RedbookSessionManager] Failed to clear session data:", err);
			return { success: false };
		}
	}
}
