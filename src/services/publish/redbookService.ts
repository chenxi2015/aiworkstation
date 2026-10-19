import { useCallback, useEffect, useState } from "react";
import { copyRedbookText } from "../../components/editor/publish-center/clipboardChannels";

export interface RedbookUserInfo {
	id?: string;
	nickname?: string;
	avatar?: string;
}

export interface RedbookStatusResult {
	isLoggedIn: boolean;
	user?: RedbookUserInfo;
}

export interface RedbookLoginResult {
	success: boolean;
	user?: RedbookUserInfo;
	error?: string;
}

export interface RedbookPublishPayload {
	title: string;
	content: string;
	topics?: string[];
	images: string[];
	mode?: "auto" | "fill_only";
}

export interface RedbookPublishResult {
	success: boolean;
	mode: "auto" | "fill_only";
	message: string;
	error?: string;
}

/**
 * Frontend client service for interacting with Xiaohongshu desktop capabilities
 */
export class RedbookClientService {
	/**
	 * Check whether desktop native capabilities are available in the current environment
	 */
	public isSupported(): boolean {
		return (
			typeof window !== "undefined" &&
			Boolean(window.electronAPI?.publishToRedbook)
		);
	}

	/**
	 * Open Xiaohongshu creator platform in the system default external browser
	 */
	public openExternal(
		url = "https://creator.xiaohongshu.com/publish/publish",
	): void {
		if (typeof window !== "undefined") {
			window.open(url, "_blank");
		}
	}

	/**
	 * Check current creator authentication status
	 */
	public async checkStatus(): Promise<RedbookStatusResult> {
		if (!this.isSupported() || !window.electronAPI?.checkRedbookStatus) {
			return { isLoggedIn: false };
		}
		try {
			const res = await window.electronAPI.checkRedbookStatus();
			return {
				isLoggedIn: Boolean(res.isLoggedIn),
				user: res.user,
			};
		} catch (err) {
			console.warn("[RedbookClientService] checkStatus error:", err);
			return { isLoggedIn: false };
		}
	}

	/**
	 * Open the creator QR code login window
	 */
	public async login(): Promise<RedbookLoginResult> {
		if (!this.isSupported() || !window.electronAPI?.openRedbookLogin) {
			return {
				success: false,
				error: "当前环境不支持唤起桌面扫码窗口，请在桌面客户端中运行",
			};
		}
		try {
			return await window.electronAPI.openRedbookLogin();
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	/**
	 * Switch account by clearing credentials and opening a clean QR login window
	 */
	public async switchAccount(): Promise<RedbookLoginResult> {
		if (!this.isSupported() || !window.electronAPI?.switchRedbookAccount) {
			await this.logout();
			return this.login();
		}
		try {
			return await window.electronAPI.switchRedbookAccount();
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	/**
	 * Open Xiaohongshu creator platform in a dedicated browser window
	 * to view creator analytics, published notes and account details.
	 */
	public async openCreatorPage(
		url = "https://creator.xiaohongshu.com/creator/home",
	): Promise<{ success: boolean }> {
		if (this.isSupported() && window.electronAPI?.openRedbookCreatorPage) {
			try {
				return await window.electronAPI.openRedbookCreatorPage(url);
			} catch (err) {
				console.warn("[RedbookClientService] openCreatorPage error:", err);
			}
		}
		// Fallback for non-desktop preview
		this.openExternal(url);
		return { success: true };
	}

	/**
	 * Clear local session cookies and log out
	 */
	public async logout(): Promise<{ success: boolean }> {
		if (!this.isSupported() || !window.electronAPI?.logoutRedbook) {
			return { success: false };
		}
		try {
			return await window.electronAPI.logoutRedbook();
		} catch (err) {
			console.warn("[RedbookClientService] logout error:", err);
			return { success: false };
		}
	}

	/**
	 * Publish or prefill Xiaohongshu note
	 */
	public async publish(
		payload: RedbookPublishPayload,
	): Promise<RedbookPublishResult> {
		const mode = payload.mode || "fill_only";

		// 1. Desktop native Electron execution
		if (this.isSupported() && window.electronAPI?.publishToRedbook) {
			// Check local image constraints
			if (!payload.images || payload.images.length === 0) {
				return {
					success: false,
					mode,
					message: "发布失败：小红书图文笔记至少需要提供 1 张封面或配图",
					error: "Missing image",
				};
			}

			// Pre-check login status
			const status = await this.checkStatus();
			if (!status.isLoggedIn) {
				return {
					success: false,
					mode,
					message: "发布失败：未登录小红书账号，请先扫码登录",
					error: "Not logged in",
				};
			}

			const res = await window.electronAPI.publishToRedbook({
				title: payload.title.slice(0, 20),
				content: payload.content,
				topics: payload.topics,
				images: payload.images,
				mode,
			});

			return {
				success: Boolean(res.success),
				mode: res.mode || mode,
				message:
					res.message ||
					(res.success ? "小红书图文内容已成功就绪" : "小红书直发失败"),
				error: res.error,
			};
		}

		// 2. Web preview fallback (copy to clipboard)
		await copyRedbookText({
			title: payload.title.slice(0, 20),
			body: payload.content.slice(0, 1000),
			topics: (payload.topics || []).slice(0, 6),
		});

		return {
			success: true,
			mode: "fill_only",
			message:
				"文案与话题已复制到剪贴板（当前为网页预览环境，原生一键直发请在桌面客户端运行）",
		};
	}
}

/**
 * Singleton instance of RedbookClientService
 */
export const redbookService = new RedbookClientService();

/**
 * React hook for managing Xiaohongshu session state and login workflows
 */
export function useRedbookSession(options: { autoCheck?: boolean } = {}) {
	const { autoCheck = true } = options;
	const [loading, setLoading] = useState(false);
	const [status, setStatus] = useState<{
		checked: boolean;
		isLoggedIn: boolean;
		nickname?: string;
		avatar?: string;
	}>({ checked: false, isLoggedIn: false });

	const refresh = useCallback(async () => {
		const res = await redbookService.checkStatus();
		setStatus({
			checked: true,
			isLoggedIn: res.isLoggedIn,
			nickname: res.user?.nickname,
			avatar: res.user?.avatar,
		});
	}, []);

	const login = useCallback(async () => {
		setLoading(true);
		try {
			const res = await redbookService.login();
			if (res.success) {
				await refresh();
			}
			return res;
		} finally {
			setLoading(false);
		}
	}, [refresh]);

	const switchAccount = useCallback(async () => {
		setLoading(true);
		try {
			const res = await redbookService.switchAccount();
			if (res.success) {
				await refresh();
			}
			return res;
		} finally {
			setLoading(false);
		}
	}, [refresh]);

	const logout = useCallback(async () => {
		setLoading(true);
		try {
			const res = await redbookService.logout();
			if (res.success) {
				await refresh();
			}
			return res.success;
		} finally {
			setLoading(false);
		}
	}, [refresh]);

	const openCreatorPage = useCallback(
		async (url?: string) => {
			const res = await redbookService.openCreatorPage(url);
			// Refresh status in case user changed accounts in the browser window
			await refresh();
			return res;
		},
		[refresh],
	);

	useEffect(() => {
		if (autoCheck) {
			refresh();
		}
	}, [autoCheck, refresh]);

	return {
		isSupported: redbookService.isSupported(),
		status,
		loading,
		refresh,
		login,
		switchAccount,
		logout,
		openCreatorPage,
	};
}
