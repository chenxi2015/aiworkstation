/**
 * High-risk command patterns that must be blocked for system security
 */
const FORBIDDEN_COMMAND_PATTERNS: RegExp[] = [
	/\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+([/~]|\/\*|\$HOME)/i, // rm -rf / or ~
	/\brm\s+-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*\s+([/~]|\/\*|\$HOME)/i, // rm -fr / or ~
	/\bmkfs\b/i, // Disk formatting
	/\bdd\s+if=\/dev\/(zero|random|urandom)\s+of=\/dev\//i, // Overwriting disk devices
	/\bformat\s+[a-zA-Z]:/i, // Windows format drive
	/\bdel\s+\/[fsq\s]*[a-zA-Z]:\\/i, // Windows del /s /q C:\
	/\brd\s+\/[sq\s]*[a-zA-Z]:\\/i, // Windows rd /s /q C:\
	/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/i, // Bash fork bomb
];

export interface CommandSafetyCheckResult {
	safe: boolean;
	reason?: string;
}

/**
 * Validate command against high-risk destructive patterns
 */
export function validateCommandSafety(
	command: string,
): CommandSafetyCheckResult {
	const trimmed = (command || "").trim();
	if (!trimmed) {
		return { safe: false, reason: "Command cannot be empty" };
	}

	for (const pattern of FORBIDDEN_COMMAND_PATTERNS) {
		if (pattern.test(trimmed)) {
			return {
				safe: false,
				reason: `Command blocked by safety policy: contains potentially destructive pattern (${trimmed})`,
			};
		}
	}

	return { safe: true };
}
