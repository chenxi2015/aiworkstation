import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DB_DIR } from "../db/connection.ts";
import { getConfiguredFilesRoot } from "./filesRoot.ts";

export interface OpenInOsOptions {
	/** If true and target is a directory that does not exist, create it first */
	ensureDir?: boolean;
	/**
	 * If true and target is a file, reveal/select it in the file manager
	 * instead of opening it with the default application.
	 */
	reveal?: boolean;
	/** Skip allowed root directory security check if already validated */
	skipRootCheck?: boolean;
}

/**
 * Returns the list of permitted root directories for opening files/folders.
 * Includes DB_DIR, system Downloads, and user configured filesRootDir.
 */
export function getAllowedRoots(): string[] {
	const roots = [DB_DIR, path.join(os.homedir(), "Downloads")];
	const filesRoot = getConfiguredFilesRoot();
	if (filesRoot) roots.push(filesRoot);
	return roots.map((p) => path.resolve(p));
}

/**
 * Verify that the target path is within the allowed root boundaries.
 */
export function assertPathWithinAllowedRoots(resolvedPath: string): void {
	const allowed = getAllowedRoots().some(
		(root) =>
			resolvedPath === root || resolvedPath.startsWith(`${root}${path.sep}`),
	);
	if (!allowed) {
		throw new Error(
			"出于安全考虑，仅允许打开工作台数据目录与文件管理根目录内的文件",
		);
	}
}

/**
 * Resolves the OS-specific command and arguments to open or reveal a path.
 */
function resolveSystemCommand(
	targetPath: string,
	isDirectory: boolean,
	reveal: boolean,
): { cmd: string; args: string[] } {
	const normalizedPath = path.normalize(targetPath);

	if (process.platform === "darwin") {
		if (!isDirectory && reveal) {
			return { cmd: "open", args: ["-R", normalizedPath] };
		}
		return { cmd: "open", args: [normalizedPath] };
	}

	if (process.platform === "win32") {
		if (!isDirectory && reveal) {
			return { cmd: "explorer.exe", args: [`/select,${normalizedPath}`] };
		}
		return { cmd: "explorer.exe", args: [normalizedPath] };
	}

	// Linux & other Unix-like systems
	if (!isDirectory && reveal) {
		return { cmd: "xdg-open", args: [path.dirname(normalizedPath)] };
	}
	return { cmd: "xdg-open", args: [normalizedPath] };
}

/**
 * Unified cross-platform utility to open or reveal a file/directory in the host OS.
 */
export function openInOs(
	targetPath: string,
	options: OpenInOsOptions = {},
): Promise<{ success: boolean; path: string }> {
	return new Promise((resolve, reject) => {
		const raw = (targetPath || "").trim();
		if (!raw) {
			return reject(new Error("路径不能为空"));
		}
		const resolved = path.resolve(raw);

		if (!options.skipRootCheck) {
			assertPathWithinAllowedRoots(resolved);
		}

		let isDir = false;
		if (fs.existsSync(resolved)) {
			isDir = fs.statSync(resolved).isDirectory();
		} else if (options.ensureDir) {
			fs.mkdirSync(resolved, { recursive: true });
			isDir = true;
		} else {
			return reject(new Error("文件或目录不存在或已被移动"));
		}

		const { cmd, args } = resolveSystemCommand(
			resolved,
			isDir,
			options.reveal ?? false,
		);

		try {
			const child = spawn(cmd, args, {
				detached: true,
				stdio: "ignore",
			});
			child.on("error", (err) => {
				reject(err);
			});
			child.unref();

			// Brief tick to catch immediate spawn failure
			setTimeout(() => {
				resolve({ success: true, path: resolved });
			}, 50);
		} catch (err) {
			reject(err);
		}
	});
}
