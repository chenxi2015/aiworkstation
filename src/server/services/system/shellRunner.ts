import { type ChildProcess, spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { getEnrichedEnv } from "./envResolver.ts";

export interface ShellExecOptions {
	cwd?: string;
	timeoutMs?: number;
	env?: NodeJS.ProcessEnv;
	signal?: AbortSignal;
}

export interface ShellExecResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	durationMs: number;
}

/**
 * Platform shell execution strategy interface
 */
interface ShellStrategy {
	getShellCommand(command: string): { binary: string; args: string[] };
}

/**
 * Unix (macOS / Linux) shell execution strategy using login shell (zsh/bash)
 */
class UnixShellStrategy implements ShellStrategy {
	getShellCommand(command: string): { binary: string; args: string[] } {
		const shell = process.env.SHELL || "/bin/zsh";
		return {
			binary: shell,
			args: ["-c", command],
		};
	}
}

/**
 * Windows shell execution strategy using PowerShell with execution policy bypass
 */
class WindowsShellStrategy implements ShellStrategy {
	getShellCommand(command: string): { binary: string; args: string[] } {
		return {
			binary: "powershell.exe",
			args: [
				"-NoProfile",
				"-NonInteractive",
				"-ExecutionPolicy",
				"Bypass",
				"-Command",
				command,
			],
		};
	}
}

/**
 * Strategy factory resolving the current OS strategy
 */
function getPlatformStrategy(): ShellStrategy {
	return os.platform() === "win32"
		? new WindowsShellStrategy()
		: new UnixShellStrategy();
}

/**
 * Resolve directory path supporting ~ homedir expansion
 */
function resolveWorkingDir(targetDir?: string): string {
	if (!targetDir || !targetDir.trim()) {
		return process.cwd();
	}
	const trimmed = targetDir.trim();
	if (trimmed === "~") {
		return os.homedir();
	}
	if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
		return path.join(os.homedir(), trimmed.slice(2));
	}
	if (path.isAbsolute(trimmed)) {
		return trimmed;
	}
	return path.resolve(process.cwd(), trimmed);
}

/**
 * Cross-platform process tree termination
 * On Windows, calls taskkill /PID <pid> /T /F
 * On Unix/macOS, sends SIGKILL to the process group (-child.pid)
 */
export function killProcessTree(child: ChildProcess): void {
	if (!child.pid) return;

	if (os.platform() === "win32") {
		try {
			spawn("taskkill", ["/pid", child.pid.toString(), "/T", "/F"], {
				windowsHide: true,
				stdio: "ignore",
			});
		} catch {
			// Process might already be terminated
		}
	} else {
		try {
			// Kill all descendant processes first to prevent orphaned child processes (e.g. pip, python3)
			spawn("pkill", ["-P", child.pid.toString()], {
				windowsHide: true,
				stdio: "ignore",
			});
		} catch {
			// Ignore if pkill fails or is not available
		}

		try {
			// Kill the entire process group
			process.kill(-child.pid, "SIGKILL");
		} catch {
			try {
				child.kill("SIGKILL");
			} catch {
				// Process might already be terminated
			}
		}
	}
}

/**
 * Execute system command cross-platform with timeout, cancellation and output capture
 */
export function runSystemCommand(
	command: string,
	options: ShellExecOptions = {},
): Promise<ShellExecResult> {
	if (options.signal?.aborted) {
		return Promise.resolve({
			exitCode: -1,
			stdout: "",
			stderr: "[Aborted] Command execution cancelled before start.",
			durationMs: 0,
		});
	}

	return new Promise((resolve) => {
		const startTime = Date.now();
		const strategy = getPlatformStrategy();
		const { binary, args } = strategy.getShellCommand(command);

		const cwd = resolveWorkingDir(options.cwd);
		const env = options.env || getEnrichedEnv();
		const isUnix = os.platform() !== "win32";

		const child = spawn(binary, args, {
			cwd,
			env,
			detached: isUnix,
			windowsHide: true,
		});

		let stdout = "";
		let stderr = "";
		let isAborted = false;
		let isTimedOut = false;
		const maxOutputLength = 512 * 1024; // 512KB output cap to prevent LLM/memory blowup

		child.stdout?.on("data", (chunk: Buffer) => {
			if (stdout.length < maxOutputLength) {
				stdout += chunk.toString("utf-8");
			}
		});

		child.stderr?.on("data", (chunk: Buffer) => {
			if (stderr.length < maxOutputLength) {
				stderr += chunk.toString("utf-8");
			}
		});

		// Timeout management
		const timeout = options.timeoutMs ?? 60_000;
		const timer = setTimeout(() => {
			isTimedOut = true;
			killProcessTree(child);
			stderr += `\n[Timeout] Execution exceeded timeout limit of ${timeout}ms.`;
		}, timeout);

		// Abort signal management
		const abortListener = () => {
			isAborted = true;
			killProcessTree(child);
			stderr += "\n[Aborted] Command execution cancelled by user.";
		};

		if (options.signal) {
			options.signal.addEventListener("abort", abortListener, { once: true });
		}

		const cleanup = () => {
			clearTimeout(timer);
			if (options.signal) {
				options.signal.removeEventListener("abort", abortListener);
			}
		};

		child.on("close", (code) => {
			cleanup();
			const finalExitCode = isAborted || isTimedOut ? -1 : (code ?? -1);
			resolve({
				exitCode: finalExitCode,
				stdout: stdout.trim(),
				stderr: stderr.trim(),
				durationMs: Date.now() - startTime,
			});
		});

		child.on("error", (err) => {
			cleanup();
			resolve({
				exitCode: -1,
				stdout: stdout.trim(),
				stderr: `${stderr}\n${err.message}`.trim(),
				durationMs: Date.now() - startTime,
			});
		});
	});
}

