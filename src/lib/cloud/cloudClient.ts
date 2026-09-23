import type {
	ApiResponse,
	CreateOrderResponse,
	OrderStatusResponse,
	QrCheckResponse,
	QrTicketResponse,
	SubscriptionPlan,
	UserProfile,
} from "@aiworkstation/shared-types";

const TOKEN_KEY = "aiworkstation_cloud_token";
const USER_KEY = "aiworkstation_cloud_user";
const API_BASE_KEY = "aiworkstation_cloud_api_base";

// Default to local cloud server
const DEFAULT_API_BASE = "http://localhost:4000";

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
		const user = await this.fetchApi<UserProfile>("/api/auth/me");
		const token = this.getToken();
		if (token) {
			this.setSession(token, user);
		}
		return user;
	}

	// --- Payment APIs ---

	/**
	 * Get available membership subscription plans
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
	 * Mock payment fulfillment for testing
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
