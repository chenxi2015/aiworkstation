import {
	chmodSync,
	closeSync,
	fsyncSync,
	openSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
	sep,
} from "node:path";

/** 单文件读取上限：默认 2000 行 / 512KB，超出截断 */
export const MAX_READ_LINES = 2000;
export const MAX_READ_BYTES = 512 * 1024;

/** 完整读入内存做行分页的上限：超过此大小退化为首窗口读取 */
export const MAX_FULL_READ_BYTES = 8 * 1024 * 1024;

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
	// Windows 文件系统大小写不敏感，统一小写比较避免 "c:\windows" 绕过黑名单
	if (process.platform === "win32") {
		real = real.toLowerCase();
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

/**
 * 原子写入文本文件：先写同目录临时文件（0o600 私有权限），fsync 落盘后
 * rename 一次性发布。任何一步失败都会清理临时文件，目标文件要么保持原样、
 * 要么完整替换，绝不会出现写了一半的损坏文件。覆盖已有文件时保留其权限位。
 * 参考 deepseek-harness fs-local 的 writeFileAtomic 实现（同步版本）。
 */
export function writeTextAtomicSync(absPath: string, content: string): void {
	const dir = dirname(absPath);
	const tempPath = join(dir, `.${basename(absPath)}.${process.pid}.tmp`);
	let fd: number | undefined;
	try {
		fd = openSync(tempPath, "w", 0o600);
		writeFileSync(fd, content, "utf-8");
		fsyncSync(fd);
		closeSync(fd);
		fd = undefined;
		try {
			// 覆盖场景：沿用原文件权限位（如可执行脚本）
			const mode = statSync(absPath).mode & 0o777;
			chmodSync(tempPath, mode);
		} catch {
			// 新文件场景：维持 0o600 之外的默认由 umask 决定，这里放宽为常规 0o644
			try {
				chmodSync(tempPath, 0o644);
			} catch {
				/* Windows 等不支持 chmod 的平台忽略 */
			}
		}
		renameSync(tempPath, absPath);
	} catch (err) {
		if (fd !== undefined) {
			try {
				closeSync(fd);
			} catch {
				/* ignore */
			}
		}
		try {
			rmSync(tempPath, { force: true });
		} catch {
			/* ignore */
		}
		throw err;
	}
}

export type LineEndings = "LF" | "CRLF";

/** 采样前 4KB 检测文件主流行尾风格 */
export function detectLineEndings(raw: string): LineEndings {
	const sample = raw.slice(0, 4096);
	const crlfCount = sample.split("\r\n").length - 1;
	const lfCount = sample.split("\n").length - 1 - crlfCount;
	return crlfCount > lfCount ? "CRLF" : "LF";
}

/** CRLF 归一化为 LF —— 内存中匹配/编辑的统一形态（单独的 \r 不动） */
export function normalizeLineEndings(content: string): string {
	return content.replaceAll("\r\n", "\n");
}

/** 把 LF 归一化后的内容还原为文件原本的换行风格 */
export function restoreLineEndings(
	content: string,
	lineEndings: LineEndings,
): string {
	return lineEndings === "CRLF" ? content.replaceAll("\n", "\r\n") : content;
}

/**
 * 写入根目录限定：校验目标路径必须落在指定根目录内（含路径穿越防护）。
 * 用于 filesRootDir 场景 —— 素材文件等写入只允许发生在文件管理根目录之下。
 */
export function assertPathWithinRoot(targetAbs: string, rootAbs: string): void {
	const realDisplay = realpathForCheck(resolve(targetAbs));
	const rootDisplay = realpathForCheck(resolve(rootAbs));
	// Windows 盘符/路径大小写不敏感（D:\ vs d:\），统一小写后再比较
	const normalizeCase = (p: string) =>
		process.platform === "win32" ? p.toLowerCase() : p;
	const root = normalizeCase(rootDisplay);
	const real = normalizeCase(realDisplay);
	// 用 path.relative 判断包含关系：Windows 上 realpath 返回反斜杠路径，
	// 直接 startsWith(`${root}/`) 会把根目录内的合法路径误判为越界
	const rel = relative(root, real);
	if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
		throw new Error(
			`路径越界：${realDisplay} 不在允许的根目录 ${rootDisplay} 之内`,
		);
	}
}

/**
 * 对尚不存在的路径取「最近存在祖先的 realpath + 剩余段」，
 * 保证与根目录在同一真实路径空间内比较（如 macOS /var → /private/var）。
 */
function realpathForCheck(p: string): string {
	try {
		return realpathSync(p);
	} catch {
		const parent = resolve(p, "..");
		if (parent === p) return p;
		return join(realpathForCheck(parent), p.slice(parent.length + 1));
	}
}

/**
 * 在根目录内解析相对路径：拒绝绝对路径与 .. 穿越，返回安全的绝对路径。
 */
export function resolveWithinRoot(rootAbs: string, relPath: string): string {
	const rel = (relPath || "").trim();
	if (!rel) {
		throw new Error("相对路径不能为空");
	}
	if (resolve(rel) === rel || rel.startsWith("~")) {
		throw new Error(`只允许根目录内的相对路径：${relPath}`);
	}
	const target = resolve(resolve(rootAbs), rel);
	assertPathWithinRoot(target, rootAbs);
	return target;
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
