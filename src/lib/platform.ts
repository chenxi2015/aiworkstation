/**
 * 宿主操作系统探测与平台相关文案。
 * 本地优先架构下服务端与浏览器同机：客户端用 navigator.userAgent，
 * SSR/服务端渲染时回落到 process.platform，两者结果一致，不会造成水合偏差。
 */
export type HostOS = "macos" | "windows" | "linux" | "other";

export function detectHostOS(): HostOS {
	// 1. Prefer Node.js process.platform on server-side
	if (typeof process !== "undefined" && process.platform) {
		switch (process.platform) {
			case "darwin":
				return "macos";
			case "win32":
				return "windows";
			case "linux":
				return "linux";
		}
	}
	// 2. Client-side browser navigator.userAgent
	if (
		typeof navigator !== "undefined" &&
		typeof navigator.userAgent === "string"
	) {
		const ua = navigator.userAgent;
		if (/windows/i.test(ua)) return "windows";
		if (/mac os|macintosh/i.test(ua)) return "macos";
		if (/linux|android/i.test(ua)) return "linux";
	}
	return "other";
}

/** 各平台文件管理器的本地化叫法 */
export const FILE_MANAGER_NAMES: Record<HostOS, string> = {
	macos: "访达",
	windows: "文件资源管理器",
	linux: "文件管理器",
	other: "文件管理器",
};

export function getFileManagerName(): string {
	return FILE_MANAGER_NAMES[detectHostOS()];
}
