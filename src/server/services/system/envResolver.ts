import { execSync } from "node:child_process";
import os from "node:os";

/**
 * Cached enriched environment variables for child processes
 */
let cachedEnv: NodeJS.ProcessEnv | null = null;

/**
 * Resolve enriched PATH and environment variables across platforms.
 * Resolves missing brew, nvm, and global bin paths when launched as desktop GUI.
 */
export function getEnrichedEnv(): NodeJS.ProcessEnv {
	if (cachedEnv) {
		return cachedEnv;
	}

	const baseEnv: NodeJS.ProcessEnv = { ...process.env };
	const platform = os.platform();

	if (platform === "darwin") {
		try {
			// Extract user login shell PATH on macOS (loads ~/.zprofile and ~/.zshrc)
			const shell = process.env.SHELL || "/bin/zsh";
			const shellPath = execSync(`${shell} -ilc 'echo -n "$PATH"'`, {
				encoding: "utf-8",
				timeout: 2000,
				stdio: ["ignore", "pipe", "ignore"],
			}).trim();

			if (shellPath) {
				baseEnv.PATH = shellPath;
			}
		} catch {
			// Fallback: prepend common macOS user binary directories
			const userHome = process.env.HOME || "";
			const fallbackBinaries = [
				"/opt/homebrew/bin",
				"/opt/homebrew/sbin",
				"/usr/local/bin",
				"/usr/bin",
				"/bin",
				"/usr/sbin",
				"/sbin",
				`${userHome}/.npm-global/bin`,
				`${userHome}/Library/pnpm`,
				`${userHome}/.cargo/bin`,
				baseEnv.PATH || "",
			].filter(Boolean);

			baseEnv.PATH = fallbackBinaries.join(":");
		}
	} else if (platform === "win32") {
		// Ensure UTF-8 output encoding for Windows consoles and runtimes
		baseEnv.PYTHONIOENCODING = "utf-8";
	}

	cachedEnv = baseEnv;
	return cachedEnv;
}
