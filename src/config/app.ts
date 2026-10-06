/**
 * Global repository and application metadata configurations
 */
const DEFAULT_REPO = "chenxi2015/aiworkstation";

// Safely resolve environment variables across Vite, Node.js, and Electron environments
function resolveEnv(key: string): string | undefined {
	const metaEnv = (import.meta as unknown as { env?: Record<string, string> })
		?.env;
	if (metaEnv?.[key]) {
		return metaEnv[key];
	}
	if (typeof process !== "undefined" && process.env?.[key]) {
		return process.env[key];
	}
	return undefined;
}

const resolvedRepo =
	resolveEnv("VITE_GITHUB_REPO") || resolveEnv("GITHUB_REPO") || DEFAULT_REPO;

const [owner, name] = resolvedRepo.split("/");

export const SUPPORT_EMAIL =
	resolveEnv("VITE_SUPPORT_EMAIL") ||
	resolveEnv("SUPPORT_EMAIL") ||
	"bbxycx18@gmail.com";

export const REPO_CONFIG = {
	OWNER: owner || "chenxi2015",
	NAME: name || "aiworkstation",
	REPO: resolvedRepo,
	URL: `https://github.com/${resolvedRepo}`,
	RELEASES_URL: `https://github.com/${resolvedRepo}/releases/latest`,
	RELEASES_API_URL: `https://api.github.com/repos/${resolvedRepo}/releases/latest`,
	ISSUES_URL: `https://github.com/${resolvedRepo}/issues`,
} as const;
