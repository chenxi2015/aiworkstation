import type {
	ApiResponse,
	CreateOrderResponse,
	OrderStatusResponse,
	QrCheckResponse,
	QrTicketResponse,
	SubscriptionPlan,
	UserProfile,
} from "@aiworkstation/shared-types";
import {
	activateOfficialChannelsFn,
	refreshEntitlementsFn,
} from "../../server/functions/channels";
import {
	getSettings,
	saveSettings,
} from "../../services/storage/settingsStorage";

const TOKEN_KEY = "aiworkstation_cloud_token";
const USER_KEY = "aiworkstation_cloud_user";
const API_BASE_KEY = "aiworkstation_cloud_api_base";

// Cloud server base URL resolution order:
//   1. localStorage override (setApiBase, e.g. from a settings UI)
//   2. VITE_CLOUD_API_BASE env var at build/dev time (see .env.example)
//   3. Local dev server fallback
const ENV_API_BASE = import.meta.env.VITE_CLOUD_API_BASE?.trim();
const DEFAULT_API_BASE = ENV_API_BASE || "http://localhost:4000";

type AuthListener = (user: UserProfile | null) => void;

class CloudClient {
	private listeners = new Set<AuthListener>();

	/**
	 * Get the cloud server base URL
	 */
	getApiBase(): string {
		if (typeof window === "undefined") return DEFAULT_API_BASE;
		return localStorage.getItem(API_BASE_KEY) || DEFAULT_API_BASE;
	}

	/**
	 * Set a custom cloud server base URL
	 */
	setApiBase(url: string) {
		if (typeof window !== "undefined") {
			localStorage.setItem(API_BASE_KEY, url);
		}
	}

	/**
	 * Get current auth token
	 */
	getToken(): string | null {
		if (typeof window === "undefined") return null;
		return localStorage.getItem(TOKEN_KEY);
	}

	/**
	 * Get cached user profile
	 */
	getUser(): UserProfile | null {
		if (typeof window === "undefined") return null;
		const raw = localStorage.getItem(USER_KEY);
		if (!raw) return null;
		try {
			return JSON.parse(raw) as UserProfile;
		} catch {
			return null;
		}
	}

	/**
	 * Save session token and user info
	 */
	setSession(token: string, user: UserProfile) {
		if (typeof window !== "undefined") {
			localStorage.setItem(TOKEN_KEY, token);
			localStorage.setItem(USER_KEY, JSON.stringify(user));
			this.notifyListeners(user);
		}
		this.syncSessionToLocalSettings();
	}

	/**
	 * Clear session (logout)
	 */
	clearSession() {
		if (typeof window !== "undefined") {
			localStorage.removeItem(TOKEN_KEY);
			localStorage.removeItem(USER_KEY);
			this.notifyListeners(null);
		}
		this.syncSessionToLocalSettings();
	}

	/**
	 * Mirror the cloud token + gateway base URL into workbench settings (SQLite),
	 * so the local 3888 server can authenticate against the official AI channel
	 * reverse proxy without reading browser localStorage.
	 *
	 * Note: saveSettings writes through to syncChannelsFromSettings, which
	 * ensures official channel rows exist without overwriting user-configured
	 * custom channels (e.g. SiliconFlow embedding, Kimi chat).
	 */
	private syncSessionToLocalSettings(activateOfficial = false) {
		if (typeof window === "undefined") return;
		try {
			const settings = getSettings();
			const token = this.getToken();
			saveSettings({
				...settings,
				cloudToken: token || undefined,
				cloudApiBase: token ? this.getApiBase() : undefined,
			});
			if (token) {
				if (activateOfficial) {
					activateOfficialChannelsFn().catch((err) =>
						console.warn("[CloudClient] activateOfficialChannels error:", err),
					);
				}
				refreshEntitlementsFn().catch((err) =>
					console.warn("[CloudClient] refreshEntitlements error:", err),
				);
			}
		} catch (err) {
			console.warn("[CloudClient] Failed to sync session to settings:", err);
		}
	}

	/**
	 * Subscribe to auth state changes
	 */
	subscribe(listener: AuthListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notifyListeners(user: UserProfile | null) {
		for (const listener of this.listeners) {
			try {
				listener(user);
			} catch (err) {
				console.error("[CloudClient] Listener error:", err);
			}
		}
	}

	/**
	 * Standard authenticated fetch helper
	 */
	private async fetchApi<T>(
		path: string,
		options: RequestInit = {},
	): Promise<T> {
		const token = this.getToken();
		const headers = new Headers(options.headers || {});
		if (token) {
			headers.set("Authorization", `Bearer ${token}`);
		}
		if (
			!headers.has("Content-Type") &&
			options.body &&
			typeof options.body === "string"
		) {
			headers.set("Content-Type", "application/json");
		}

		const url = `${this.getApiBase()}${path}`;
		const res = await fetch(url, {
			...options,
			headers,
		});

		const json = (await res.json()) as ApiResponse<T>;
		if (!res.ok || json.code !== 0) {
			throw new Error(
				json.message || `Request failed with status ${res.status}`,
			);
		}

		return json.data;
	}

	// --- Auth APIs ---

	/**
	 * Request WeChat QR code ticket
	 */
	async getQrTicket(): Promise<QrTicketResponse> {
		return this.fetchApi<QrTicketResponse>("/api/auth/wx/qrcode");
	}

	/**
	 * Poll WeChat QR scan status
	 */
	async checkQrStatus(ticket: string): Promise<QrCheckResponse> {
		return this.fetchApi<QrCheckResponse>(
			`/api/auth/wx/check?ticket=${encodeURIComponent(ticket)}`,
		);
	}

	/**
	 * Fetch latest profile of authenticated user
	 */
	async getMe(): Promise<UserProfile> {
		const token = this.getToken();
		if (token?.startsWith("dev_local_token_")) {
			const cached = this.getUser();
			if (cached) return cached;
		}

		try {
			const user = await this.fetchApi<UserProfile>("/api/auth/me");
			if (token) {
				this.setSession(token, user);
			}
			return user;
		} catch (err) {
			// If it's a dev token or local mock session, fallback to cached user
			if (token?.startsWith("dev_local_token_")) {
				const cached = this.getUser();
				if (cached) return cached;
			}
			throw err;
		}
	}

	/**
	 * Log in by existing userId or raw token
	 */
	async loginWithIdentifier(
		identifier: string,
	): Promise<{ token: string; user: UserProfile }> {
		const trimmed = identifier.trim();
		if (!trimmed) {
			throw new Error("请输入 User ID 或 Token");
		}

		// Case 1: Input is already a token (dev token or JWT format)
		const isDevToken = trimmed.startsWith("dev_local_token_");
		const isJwtToken =
			trimmed.startsWith("eyJ") || trimmed.split(".").length === 3;

		if (isDevToken) {
			const mockId = trimmed.replace("dev_local_token_", "") || "dev_user";
			const user: UserProfile = {
				id: mockId,
				nickname: `开发用户 (${mockId})`,
				avatarUrl: "",
				memberTier: "VIP",
				memberExpiresAt: null,
				createdAt: new Date().toISOString(),
			};
			return { token: trimmed, user };
		}

		if (isJwtToken) {
			// Try validating with remote server first
			try {
				const headers = new Headers();
				headers.set("Authorization", `Bearer ${trimmed}`);
				const url = `${this.getApiBase()}/api/auth/me`;
				const res = await fetch(url, { headers });
				const json = (await res.json()) as ApiResponse<UserProfile>;
				if (res.ok && json.code === 0 && json.data) {
					return { token: trimmed, user: json.data };
				}
			} catch (err) {
				console.warn("[CloudClient] Failed to verify token with server:", err);
			}

			// Local fallback: decode JWT payload
			try {
				const payloadBase64 = trimmed.split(".")[1];
				const decoded = atob(
					payloadBase64.replace(/-/g, "+").replace(/_/g, "/"),
				);
				const payload = JSON.parse(decoded);
				const userId = payload.userId || payload.sub || "user_jwt";
				const user: UserProfile = {
					id: userId,
					nickname: payload.nickname || `用户 (${userId})`,
					avatarUrl: payload.avatarUrl || "",
					memberTier: payload.memberTier || "VIP",
					memberExpiresAt: payload.memberExpiresAt || null,
					createdAt: new Date().toISOString(),
				};
				return { token: trimmed, user };
			} catch {
				throw new Error("Token 无效或格式不正确，请重新输入");
			}
		}

		// Case 2: Input is a userId
		try {
			const res = await this.fetchApi<{ token: string; user: UserProfile }>(
				`/api/auth/token?userId=${encodeURIComponent(trimmed)}`,
			);
			if (res?.token && res?.user) {
				return res;
			}
		} catch (err) {
			console.warn("[CloudClient] /api/auth/token failed, falling back to local session:", err);
			// Fallback session so client user is never blocked by offline/mock server
			const fallbackToken = `dev_local_token_${trimmed}`;
			const fallbackUser: UserProfile = {
				id: trimmed,
				nickname: `用户 ${trimmed}`,
				avatarUrl: "",
				memberTier: "VIP",
				memberExpiresAt: null,
				createdAt: new Date().toISOString(),
			};
			return { token: fallbackToken, user: fallbackUser };
		}

		throw new Error("登录失败，未能获取用户信息");
	}

	// --- Payment APIs ---

	/**
	 * Get available membership subscription plans from backend database
	 */
	async getPlans(): Promise<SubscriptionPlan[]> {
		return this.fetchApi<SubscriptionPlan[]>("/api/pay/plans");
	}

	/**
	 * Create membership payment order
	 */
	async createOrder(planId: string): Promise<CreateOrderResponse> {
		const token = this.getToken();
		if (token?.startsWith("dev_local_token_")) {
			// Mock order for dev environment testing
			return {
				orderNo: `ORDER_DEV_${Date.now()}`,
				codeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
					`WECHAT_PAY_MOCK_ORDER_${planId}`,
				)}`,
				amountCents: 3600,
				expiresInSeconds: 300,
			};
		}
		return this.fetchApi<CreateOrderResponse>("/api/pay/create-order", {
			method: "POST",
			body: JSON.stringify({ planId }),
		});
	}

	/**
	 * Poll payment order status
	 */
	async checkOrderStatus(orderNo: string): Promise<OrderStatusResponse> {
		if (orderNo.startsWith("ORDER_DEV_")) {
			return {
				orderNo,
				status: "PENDING",
				paidAt: null,
				tier: "PRO",
				memberExpiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
			};
		}
		return this.fetchApi<OrderStatusResponse>(
			`/api/pay/order-status/${encodeURIComponent(orderNo)}`,
		);
	}

	/**
	 * Mock payment fulfillment for testing
	 */
	async mockFulfillOrder(orderNo: string): Promise<void> {
		if (orderNo.startsWith("ORDER_DEV_")) {
			return;
		}
		await this.fetchApi(
			`/api/pay/mock-fulfill/${encodeURIComponent(orderNo)}`,
			{
				method: "POST",
			},
		);
	}
}

export const cloudClient = new CloudClient();
