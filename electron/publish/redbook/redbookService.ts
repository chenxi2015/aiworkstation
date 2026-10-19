import { RedbookNotePublisher } from "./notePublisher.js";
import { RedbookSessionManager } from "./sessionManager.js";
import type {
	IRedbookPublishService,
	RedbookLoginResult,
	RedbookPublishPayload,
	RedbookPublishResult,
	RedbookStatusResult,
} from "./types.js";

/**
 * Cohesive domain service managing Xiaohongshu lifecycle, session authentication and content publishing.
 */
export class RedbookPublishService implements IRedbookPublishService {
	private sessionManager: RedbookSessionManager;
	private publisher: RedbookNotePublisher;

	constructor(
		sessionManager = new RedbookSessionManager(),
		publisher = new RedbookNotePublisher(),
	) {
		this.sessionManager = sessionManager;
		this.publisher = publisher;
	}

	/**
	 * Access internal session manager
	 */
	public getSessionManager(): RedbookSessionManager {
		return this.sessionManager;
	}

	/**
	 * Access internal note publisher
	 */
	public getPublisher(): RedbookNotePublisher {
		return this.publisher;
	}

	/**
	 * Check current Xiaohongshu creator authentication status
	 */
	public async checkStatus(): Promise<RedbookStatusResult> {
		return this.sessionManager.checkLoginStatus();
	}

	/**
	 * Open standalone creator QR code login window
	 */
	public async login(): Promise<RedbookLoginResult> {
		return this.sessionManager.openLoginWindow();
	}

	/**
	 * Switch account by clearing session credentials first
	 */
	public async switchAccount(): Promise<RedbookLoginResult> {
		return this.sessionManager.switchAccount();
	}

	/**
	 * Clear session cookies and log out
	 */
	public async logout(): Promise<{ success: boolean }> {
		return this.sessionManager.logout();
	}

	/**
	 * Open Xiaohongshu creator service platform in a dedicated browser window
	 */
	public async openCreatorPage(url?: string): Promise<{ success: boolean }> {
		return this.sessionManager.openCreatorPage(url);
	}

	/**
	 * Publish image-text note to Xiaohongshu
	 */
	public async publish(
		payload: RedbookPublishPayload,
	): Promise<RedbookPublishResult> {
		// 1. Verify authentication before attempting publication
		const status = await this.sessionManager.checkLoginStatus();
		if (!status.isLoggedIn) {
			throw new Error("小红书创作者账号未登录或会话已过期，请先扫码登录");
		}

		// 2. Validate essential payload fields
		if (!payload.title?.trim()) {
			throw new Error("发布失败：标题不能为空");
		}
		if (!payload.images || payload.images.length === 0) {
			throw new Error("发布失败：小红书图文笔记至少需要 1 张封面或配图");
		}

		// 3. Delegate to publisher with the persistent session
		const session = this.sessionManager.getSession();
		return this.publisher.publish(payload, session);
	}
}

/**
 * Global singleton instance of RedbookPublishService
 */
export const redbookPublishService = new RedbookPublishService();

