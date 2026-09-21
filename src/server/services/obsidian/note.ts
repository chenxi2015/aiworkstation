import { execFile } from "node:child_process";
import { existsSync, promises as fs, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type {
	ObsidianMutationResult,
	ObsidianNoteContent,
	ObsidianSaveResult,
} from "../../../components/obsidian/types.ts";
import { tryThreeWayMerge } from "../../../components/obsidian/utils/merge.ts";
import { getFileManagerName } from "../../../lib/platform.ts";
import {
	assertWritablePath,
	MAX_READ_BYTES,
	resolveWithinRoot,
	writeTextAtomicSync,
} from "../../ai/fs/fsSafety.ts";
import { readFileCapped } from "../skills/scanCore.ts";
import { openInOs } from "../systemOpener.ts";
import { invalidateVaultTreeCache } from "./tree.ts";
import { resolveObsidianVaultDir, toPosixRelPath } from "./vault.ts";

function vaultRoot(): string {
	const { path: root, configured } = resolveObsidianVaultDir();
	if (!existsSync(root)) {
		throw new Error(
			`Obsidian Vault 目录不存在：${configured}，请先在页面上配置正确的路径`,
		);
	}
	return root;
}

/** 相对路径 → 根目录内安全绝对路径（拒绝越界与隐藏文件） */
function entryAbsPath(relPath: string): string {
	const abs = resolveWithinRoot(vaultRoot(), relPath);
	if (path.basename(abs).startsWith(".")) {
		throw new Error("不允许操作隐藏文件/目录");
	}
	return abs;
}

/** 目标目录相对路径（允许空串 = Vault 根）→ 安全绝对路径 */
function dirAbsPath(dirRelPath: string): string {
	const rel = (dirRelPath || "").trim();
	return rel ? resolveWithinRoot(vaultRoot(), rel) : vaultRoot();
}

function ensureMdSuffix(name: string): string {
	return name.toLowerCase().endsWith(".md") ? name : `${name}.md`;
}

function errMessage(err: unknown, fallback: string): string {
	return err instanceof Error ? err.message : fallback;
}

/** 读取单篇笔记全文（512KB 上限截断） */
export async function readVaultNote(
	relPath: string,
): Promise<ObsidianNoteContent> {
	const abs = entryAbsPath(relPath);
	const stat = await fs.stat(abs);
	if (!stat.isFile()) throw new Error("目标不是笔记文件");
	const { rawBuffer, truncated } = await readFileCapped(abs, MAX_READ_BYTES);
	return {
		relPath,
		name: path.basename(abs).replace(/\.md$/i, ""),
		content: rawBuffer.toString("utf8"),
		size: stat.size,
		mtime: stat.mtimeMs,
		truncated,
	};
}

/**
 * 保存笔记（乐观并发 + git 式自动合并）：
 * - force 直接覆盖；
 * - baseMtime 与磁盘一致 → 直接写；
 * - 不一致且提供 baseContent → 拉取磁盘最新内容做三方合并，干净合并则写合并结果
 *   并回传 merged；合并失败才返回 conflict 由调用方决定重新加载还是强制覆盖。
 */
export async function saveVaultNote(
	relPath: string,
	content: string,
	baseMtime?: number,
	baseContent?: string,
	force?: boolean,
): Promise<ObsidianSaveResult> {
	try {
		const abs = entryAbsPath(relPath);
		assertWritablePath(abs);
		const stat = statSync(abs);
		if (!stat.isFile()) {
			return { success: false, error: "目标不是笔记文件" };
		}
		if (!force && typeof baseMtime === "number" && stat.mtimeMs !== baseMtime) {
			if (typeof baseContent === "string") {
				const { rawBuffer } = await readFileCapped(abs, MAX_READ_BYTES);
				const theirs = rawBuffer.toString("utf8");
				const merged = tryThreeWayMerge(baseContent, content, theirs);
				if (merged !== null) {
					if (merged !== theirs) {
						writeTextAtomicSync(abs, merged);
						invalidateVaultTreeCache();
					}
					return {
						success: true,
						mtime: statSync(abs).mtimeMs,
						merged,
					};
				}
			}
			return {
				success: false,
				conflict: true,
				mtime: stat.mtimeMs,
				error: "笔记已在 Obsidian 侧被修改",
			};
		}
		writeTextAtomicSync(abs, content);
		invalidateVaultTreeCache();
		return { success: true, mtime: statSync(abs).mtimeMs };
	} catch (err) {
		return { success: false, error: errMessage(err, "保存笔记失败") };
	}
}

/** 新建笔记（dirRelPath 为空串时建在 Vault 根目录） */
export async function createVaultNote(
	dirRelPath: string,
	name: string,
	content = "",
): Promise<ObsidianMutationResult> {
	try {
		const fileName = ensureMdSuffix(name.trim());
		if (!fileName.replace(/\.md$/i, "")) throw new Error("笔记名不能为空");
		const abs = path.join(dirAbsPath(dirRelPath), fileName);
		assertWritablePath(abs);
		if (existsSync(abs)) throw new Error(`同名笔记已存在：${fileName}`);
		writeTextAtomicSync(abs, content);
		invalidateVaultTreeCache();
		return { success: true, relPath: toPosixRelPath(vaultRoot(), abs) };
	} catch (err) {
		return { success: false, error: errMessage(err, "新建笔记失败") };
	}
}

/** 新建文件夹（支持多级，如 "a/b"） */
export async function createVaultFolder(
	dirRelPath: string,
	name: string,
): Promise<ObsidianMutationResult> {
	try {
		const folderName = name.trim();
		if (!folderName) throw new Error("文件夹名不能为空");
		const abs = path.join(dirAbsPath(dirRelPath), folderName);
		assertWritablePath(abs);
		if (existsSync(abs)) throw new Error(`同名条目已存在：${folderName}`);
		await fs.mkdir(abs, { recursive: true });
		invalidateVaultTreeCache();
		return { success: true, relPath: toPosixRelPath(vaultRoot(), abs) };
	} catch (err) {
		return { success: false, error: errMessage(err, "新建文件夹失败") };
	}
}

/** 同目录重命名；笔记自动保留 .md 后缀 */
export async function renameVaultEntry(
	relPath: string,
	newName: string,
	isNote: boolean,
): Promise<ObsidianMutationResult> {
	try {
		const trimmed = newName.trim();
		if (!trimmed) throw new Error("新名称不能为空");
		if (trimmed.includes("/") || trimmed.includes("\\")) {
			throw new Error("名称不能包含路径分隔符");
		}
		const abs = entryAbsPath(relPath);
		assertWritablePath(abs);
		const finalName = isNote ? ensureMdSuffix(trimmed) : trimmed;
		const target = path.join(path.dirname(abs), finalName);
		if (target === abs) return { success: true, relPath };
		if (existsSync(target)) throw new Error(`同名条目已存在：${finalName}`);
		await fs.rename(abs, target);
		invalidateVaultTreeCache();
		return { success: true, relPath: toPosixRelPath(vaultRoot(), target) };
	} catch (err) {
		return { success: false, error: errMessage(err, "重命名失败") };
	}
}

/** 移动条目到目标文件夹（targetDir 为空串 = Vault 根目录） */
export async function moveVaultEntry(
	relPath: string,
	targetDir: string,
): Promise<ObsidianMutationResult> {
	try {
		const abs = entryAbsPath(relPath);
		assertWritablePath(abs);
		const destDir = dirAbsPath(targetDir);
		if (statSync(abs).isDirectory()) {
			// 禁止把文件夹移进自己内部
			const rel = path.relative(abs, destDir);
			if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
				throw new Error("不能把文件夹移动到它自身内部");
			}
		}
		const target = path.join(destDir, path.basename(abs));
		if (target === abs) return { success: true, relPath };
		if (existsSync(target)) throw new Error("目标位置已存在同名条目");
		await fs.rename(abs, target);
		invalidateVaultTreeCache();
		return { success: true, relPath: toPosixRelPath(vaultRoot(), target) };
	} catch (err) {
		return { success: false, error: errMessage(err, "移动失败") };
	}
}

/** 在系统文件管理器中显示（跨平台逻辑复用 systemOpener；Vault 路径已经 entryAbsPath 校验，跳过根目录白名单） */
export async function revealVaultEntry(
	relPath: string,
): Promise<ObsidianMutationResult> {
	try {
		const abs = entryAbsPath(relPath);
		if (!existsSync(abs)) throw new Error("文件不存在");
		await openInOs(abs, { reveal: true, skipRootCheck: true });
		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: errMessage(err, `打开${getFileManagerName()}失败`),
		};
	}
}

/** 移动到系统回收站（macOS ~/.Trash，重名追加时间戳；跨设备/失败时回退为永久删除） */
async function moveToSystemTrash(abs: string): Promise<void> {
	const trashDir = path.join(homedir(), ".Trash");
	let target = path.join(trashDir, path.basename(abs));
	if (existsSync(target)) {
		target = path.join(trashDir, `${path.basename(abs)}.${Date.now()}`);
	}
	try {
		await fs.rename(abs, target);
	} catch {
		// 跨设备 rename 失败等场景：回退 shell mv，仍失败则永久删除
		try {
			await new Promise<void>((resolvePromise, rejectPromise) => {
				execFile("mv", [abs, target], (err) =>
					err ? rejectPromise(err) : resolvePromise(),
				);
			});
		} catch {
			await fs.rm(abs, { recursive: true });
		}
	}
}

/** 删除笔记或文件夹：移动到系统回收站（可恢复），敏感操作走确认弹窗由 UI 保证 */
export async function deleteVaultEntry(
	relPath: string,
): Promise<ObsidianMutationResult> {
	try {
		const abs = entryAbsPath(relPath);
		assertWritablePath(abs);
		if (process.platform === "darwin") {
			await moveToSystemTrash(abs);
		} else {
			await fs.rm(abs, { recursive: true });
		}
		invalidateVaultTreeCache();
		return { success: true };
	} catch (err) {
		return { success: false, error: errMessage(err, "删除失败") };
	}
}
