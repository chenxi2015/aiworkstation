import type {
	ApiResponse,
	CreateOrderResponse,
	MemberTier,
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

/**
 * Decode and extract payload from a JWT token without network verification
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
	try {
		const parts = token.trim().split(".");
		if (parts.length !== 3 || !parts[1]) return null;
		const base64Url = parts[1];
		const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
		const padded = base64.padEnd(
			base64.length + ((4 - (base64.length % 4)) % 4),
			"=",
		);
		const jsonString = decodeURIComponent(
			atob(padded)
				.split("")
				.map((c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`)
				.join(""),
		);
		return JSON.parse(jsonString) as Record<string, unknown>;
	} catch {
		return null;
	}
}

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
		const cleanToken = token.trim();
		// Reject invalid tokens with non-ASCII or whitespace characters
		if (!cleanToken || !/^[\x21-\x7E]+$/.test(cleanToken)) {
			console.error(
				"[CloudClient] Refusing to set invalid token containing non-ASCII or blank characters",
			);
			return;
		}
		if (typeof window !== "undefined") {
			localStorage.setItem(TOKEN_KEY, cleanToken);
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
			// Ensure token only contains valid ASCII ByteString characters
			if (/^[\x21-\x7E]+$/.test(token)) {
				headers.set("Authorization", `Bearer ${token}`);
			} else {
				console.warn(
					"[CloudClient] Stored token has invalid characters, clearing session",
				);
				this.clearSession();
				throw new Error("登录凭证已失效，请重新登录");
			}
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
		if (!token) {
			throw new Error("用户未登录");
		}

		try {
			const user = await this.fetchApi<UserProfile>("/api/auth/me");
			this.setSession(token, user);
			return user;
		} catch (err) {
			// Fallback gracefully to cached profile if remote server is unreachable
			const cachedUser = this.getUser();
			const rawMsg = err instanceof Error ? err.message : String(err);
			const isNetworkError =
				rawMsg.includes("Failed to fetch") ||
				rawMsg.includes("NetworkError") ||
				rawMsg.includes("fetch failed");

			if (isNetworkError && cachedUser) {
				console.warn(
					"[CloudClient] Remote server unreachable, maintaining cached profile",
				);
				return cachedUser;
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

		// Case 1: Input is a JWT token (verify format/payload locally without blocking remote network call)
		const isJwtToken =
			trimmed.startsWith("eyJ") || trimmed.split(".").length === 3;

		if (isJwtToken) {
			const payload = decodeJwtPayload(trimmed);
			if (!payload) {
				throw new Error("Token 格式无效，无法解析");
			}

			// Validate token expiration if exp claim is present
			if (typeof payload.exp === "number") {
				const nowSeconds = Math.floor(Date.now() / 1000);
				if (nowSeconds >= payload.exp) {
					throw new Error("Token 已过期");
				}
			}

			const userId = String(
				payload.userId || payload.sub || payload.id || "",
			).trim();
			if (!userId) {
				throw new Error("Token 无效：缺少用户标识");
			}

			const cachedUser = this.getUser();
			const tierStr =
				typeof payload.memberTier === "string" ? payload.memberTier : "";
			const validTiers: MemberTier[] = [
				"FREE",
				"VIP",
				"SVIP",
				"LIFETIME",
				"PRO",
			];
			const memberTier: MemberTier = validTiers.includes(tierStr as MemberTier)
				? (tierStr as MemberTier)
				: cachedUser?.id === userId
					? cachedUser.memberTier
					: "VIP";

			const user: UserProfile = {
				id: userId,
				nickname:
					(typeof payload.nickname === "string" && payload.nickname) ||
					(typeof payload.name === "string" && payload.name) ||
					(cachedUser?.id === userId
						? cachedUser.nickname
						: `用户_${userId.slice(-6)}`),
				avatarUrl:
					(typeof payload.avatarUrl === "string" && payload.avatarUrl) ||
					(typeof payload.avatar === "string" && payload.avatar) ||
					(cachedUser?.id === userId ? cachedUser.avatarUrl : ""),
				memberTier,
				memberExpiresAt:
					typeof payload.exp === "number"
						? new Date(payload.exp * 1000).toISOString()
						: cachedUser?.id === userId
							? cachedUser.memberExpiresAt
							: null,
				createdAt:
					typeof payload.iat === "number"
						? new Date(payload.iat * 1000).toISOString()
						: cachedUser?.id === userId
							? cachedUser.createdAt
							: new Date().toISOString(),
			};

			return { token: trimmed, user };
		}

		// Case 2: Input is a userId - strictly verify existence in database via /api/auth/token
		try {
			const res = await this.fetchApi<{ token: string; user: UserProfile }>(
				`/api/auth/token?userId=${encodeURIComponent(trimmed)}`,
			);
			if (res?.token && res?.user) {
				return res;
			}
			throw new Error("用户不存在");
		} catch (err) {
			const rawMsg = err instanceof Error ? err.message : String(err);
			if (
				rawMsg.includes("User not found") ||
				rawMsg.includes("not found") ||
				rawMsg.includes("404")
			) {
				throw new Error("用户不存在，请输入正确用户ID");
			}
			if (rawMsg.includes("Failed to fetch") || rawMsg.includes("NetworkError")) {
				throw new Error("无法连接云端鉴权服务，请确保服务端正在运行");
			}
			throw new Error(rawMsg || "登录验证失败，请确认输入的 User ID 是否正确");
		}
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
		return this.fetchApi<CreateOrderResponse>("/api/pay/create-order", {
			method: "POST",
			body: JSON.stringify({ planId }),
		});
	}

	/**
	 * Poll payment order status
	 */
	async checkOrderStatus(orderNo: string): Promise<OrderStatusResponse> {
		return this.fetchApi<OrderStatusResponse>(
			`/api/pay/order-status/${encodeURIComponent(orderNo)}`,
		);
	}

	/**
	 * Trigger payment fulfillment for testing
	 */
	async mockFulfillOrder(orderNo: string): Promise<void> {
		await this.fetchApi(
			`/api/pay/mock-fulfill/${encodeURIComponent(orderNo)}`,
			{
				method: "POST",
			},
		);
	}
}

export const cloudClient = new CloudClient();
