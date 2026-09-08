import { realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** 单文件读取上限：默认 2000 行 / 512KB，超出截断 */
export const MAX_READ_LINES = 2000;
export const MAX_READ_BYTES = 512 * 1024;

/** 搜索结果上限，防止超大目录遍历失控 */
export const MAX_SEARCH_RESULTS = 200;

/** 内容搜索护栏 */
export const MAX_CONTENT_SEARCH_FILE_BYTES = 1024 * 1024;
export const MAX_CONTENT_SEARCH_FILES_SCANNED = 3000;
export const MAX_CONTENT_MATCHES = 50;

/** 目录遍历默认最大深度 */
export const DEFAULT_LIST_DEPTH = 2;
export const MAX_LIST_DEPTH = 6;

/** 系统关键路径黑名单：禁止任何写/删操作 */
const FORBIDDEN_WRITE_PREFIXES = [
	"/System",
	"/usr",
	"/bin",
	"/sbin",
	"/etc",
	"/var",
	"/private/etc",
	"/private/var",
	"/Library",
	"/Applications",
	"C:\\Windows",
	"C:\\Program Files",
];

/**
 * 解析用户传入路径：展开 ~ 、转绝对路径。
 * 返回解析后的绝对路径，非法时抛错（错误信息直接回传给模型）。
 */
export function resolveUserPath(input: string): string {
	const raw = (input || "").trim();
	if (!raw) {
		throw new Error("路径不能为空");
	}
	const expanded =
		raw === "~" ? homedir() : raw.replace(/^~[/\\]/, `${homedir()}/`);
	return resolve(expanded);
}

// macOS 用户临时目录虽在 /var 下，但属于用户空间，放行
const ALLOWED_UNDER_FORBIDDEN = [
	"/var/folders",
	"/private/var/folders",
	"/var/tmp",
	"/private/tmp",
	"/tmp",
];

/**
 * 校验写/删操作目标路径不落在系统关键目录。
 * 读取操作不受此限制（读取系统文件无害）。
 */
export function assertWritablePath(absPath: string): void {
	let real = absPath;
	try {
		real = realpathSync(absPath);
	} catch {
		// 目标尚不存在（新建场景），按解析后的路径校验
	}
	for (const allow of ALLOWED_UNDER_FORBIDDEN) {
		if (real === allow || real.startsWith(`${allow}/`)) {
			return;
		}
	}
	for (const prefix of FORBIDDEN_WRITE_PREFIXES) {
		if (
			real === prefix ||
			real.startsWith(`${prefix}/`) ||
			real.startsWith(`${prefix}\\`)
		) {
			throw new Error(`出于安全考虑，禁止操作系统目录：${real}`);
		}
	}
}

/** 简单二进制嗅探：前 8KB 内出现 NUL 字节即视为二进制 */
export function looksBinary(buf: Buffer): boolean {
	const len = Math.min(buf.length, 8192);
	for (let i = 0; i < len; i++) {
		if (buf[i] === 0) return true;
	}
	return false;
}

/** 格式化字节数为人类可读 */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 全局搜索时的默认根目录（存在的才会被搜索） */
export function defaultSearchRoots(): string[] {
	const home = homedir();
	const candidates = [
		join(home, "Desktop"),
		join(home, "Documents"),
		join(home, "Downloads"),
		join(home, "Projects"),
		join(home, "WebstormProjects"),
		// 工作台运行时数据目录（process.cwd()/.aiworkstation，含 pages/ 爬取全文、workbench.db）
		resolve(".aiworkstation"),
	];
	return candidates.filter((p) => {
		try {
			return statSync(p).isDirectory();
		} catch {
			return false;
		}
	});
}
