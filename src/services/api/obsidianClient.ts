import type {
	ObsidianMutationResult,
	ObsidianNoteContent,
	ObsidianSaveResult,
	ObsidianTree,
} from "../../components/obsidian/types";
import { getFileManagerName } from "../../lib/platform";
import {
	createLocalVaultFn,
	createVaultFolderFn,
	createVaultNoteFn,
	deleteVaultEntryFn,
	getObsidianTree,
	listLocalDirectories,
	moveVaultEntryFn,
	openVaultEntryFn,
	queryVaultDataview,
	readVaultNoteFn,
	renameVaultEntryFn,
	resolveVaultWikilinkFn,
	revealVaultEntryFn,
	saveVaultNoteFn,
} from "../../server/functions/obsidian";
import type { DataviewResult } from "../../server/services/obsidian/dataview";

/** 解析双链目标 → Vault 相对路径（未找到返回 null） */
export async function resolveWikilinkRpc(
	target: string,
): Promise<string | null> {
	try {
		const res = await resolveVaultWikilinkFn({ data: { target } });
		return res.relPath;
	} catch {
		return null;
	}
}

/** 执行 Dataview 查询（服务端扫描 Vault；失败时返回带 error 的空结果） */
export async function queryDataviewRpc(
	source: string,
): Promise<DataviewResult> {
	try {
		return await queryVaultDataview({ data: { source } });
	} catch (err) {
		return {
			type: "table",
			columns: [],
			rows: [],
			tasks: [],
			error: errMessage(err, "Dataview 查询失败"),
		};
	}
}

const EMPTY_TREE: ObsidianTree = {
	vault: { path: "", configured: "", exists: false, noteCount: 0 },
	tree: [],
	scannedAt: 0,
};

function errMessage(err: unknown, fallback: string): string {
	return err instanceof Error ? err.message : fallback;
}

/** 上传本地媒体文件到 Vault（保存在笔记同目录），返回 Vault 相对路径与最终文件名 */
export async function uploadVaultAsset(
	file: File,
	noteRelPath?: string,
): Promise<{ path: string; name: string }> {
	const noteDir = noteRelPath?.includes("/")
		? noteRelPath.split("/").slice(0, -1).join("/")
		: "";
	const params = new URLSearchParams({ name: file.name });
	if (noteDir) params.set("dir", noteDir);
	const res = await fetch(`/api/obsidian/asset?${params.toString()}`, {
		method: "POST",
		body: file,
	});
	if (!res.ok) {
		throw new Error((await res.text()) || "上传失败");
	}
	return (await res.json()) as { path: string; name: string };
}

export interface LocalDirEntry {
	name: string;
	path: string;
	isVault: boolean;
}

export interface LocalDirListing {
	success: boolean;
	path: string;
	parent: string | null;
	currentIsVault: boolean;
	dirs: LocalDirEntry[];
	drives?: string[];
	error?: string;
}

/** 列出本机目录的子文件夹（目录选择器数据源；空路径从主目录开始） */
export async function listLocalDirectoriesRpc(
	dirPath?: string,
): Promise<LocalDirListing> {
	try {
		return await listLocalDirectories({ data: { dirPath } });
	} catch (err) {
		return {
			success: false,
			path: "",
			parent: null,
			currentIsVault: false,
			dirs: [],
			error: errMessage(err, "读取目录失败"),
		};
	}
}

/** 获取 Vault 目录树（force=true 绕过服务端 60s 缓存重新扫描，支持显式传目标 vaultDir） */
export async function fetchObsidianTree(
	force = false,
	vaultDir?: string,
): Promise<ObsidianTree> {
	try {
		if (vaultDir) {
			vaultNoteCache.clear();
		}
		return (
			(await getObsidianTree({ data: { force, vaultDir } })) ?? EMPTY_TREE
		);
	} catch (err) {
		console.warn("[obsidianClient] getObsidianTree error:", err);
		return EMPTY_TREE;
	}
}

/** 客户端笔记内存缓存（LRU/Map），支持切换笔记时 0ms 秒开 */
const vaultNoteCache = new Map<string, ObsidianNoteContent>();

/** 同步读取已缓存笔记（如无缓存返回 null） */
export function getCachedVaultNote(
	relPath: string,
): ObsidianNoteContent | null {
	return vaultNoteCache.get(relPath) ?? null;
}

/** 手动更新笔记缓存 */
export function setCachedVaultNote(note: ObsidianNoteContent): void {
	vaultNoteCache.set(note.relPath, note);
}

/** 清除特定笔记或全部笔记缓存 */
export function invalidateVaultNoteCache(relPath?: string): void {
	if (relPath) {
		vaultNoteCache.delete(relPath);
	} else {
		vaultNoteCache.clear();
	}
}

/** 读取单篇笔记全文（含 mtime 冲突检测基线，自动回填内存缓存） */
export async function fetchVaultNote(
	relPath: string,
): Promise<{ note: ObsidianNoteContent | null; error?: string }> {
	try {
		const res = await readVaultNoteFn({ data: { relPath } });
		if (res.note) {
			vaultNoteCache.set(relPath, res.note);
		}
		return { note: res.note, error: res.error };
	} catch (err) {
		return { note: null, error: errMessage(err, "读取笔记失败") };
	}
}

export interface SaveVaultNoteOptions {
	baseMtime?: number;
	/** 提供时 mtime 冲突会先尝试 git 式三方合并，干净合并结果经 merged 回传 */
	baseContent?: string;
	/** 跳过一切检查直接覆盖（冲突条上的"强制覆盖"） */
	force?: boolean;
}

/** 保存笔记（mtime 乐观并发 + 自动合并，合并失败时 conflict=true） */
export async function saveVaultNoteRpc(
	relPath: string,
	content: string,
	options?: SaveVaultNoteOptions,
): Promise<ObsidianSaveResult> {
	try {
		const res = await saveVaultNoteFn({
			data: {
				relPath,
				content,
				baseMtime: options?.baseMtime,
				baseContent: options?.baseContent,
				force: options?.force,
			},
		});
		if (res.success) {
			const existing = vaultNoteCache.get(relPath);
			if (existing) {
				vaultNoteCache.set(relPath, {
					...existing,
					content: res.merged ?? content,
					mtime: res.mtime ?? existing.mtime,
				});
			}
		}
		return res;
	} catch (err) {
		return { success: false, error: errMessage(err, "保存笔记失败") };
	}
}

export async function createVaultNoteRpc(
	dirPath: string,
	name: string,
	content?: string,
): Promise<ObsidianMutationResult> {
	try {
		return await createVaultNoteFn({ data: { dirPath, name, content } });
	} catch (err) {
		return { success: false, error: errMessage(err, "新建笔记失败") };
	}
}

export async function createVaultFolderRpc(
	dirPath: string,
	name: string,
): Promise<ObsidianMutationResult> {
	try {
		return await createVaultFolderFn({ data: { dirPath, name } });
	} catch (err) {
		return { success: false, error: errMessage(err, "新建文件夹失败") };
	}
}

/** 新建本地 Vault（创建文件夹 + .obsidian 标记目录），返回绝对路径 */
export async function createLocalVaultRpc(
	parentDir: string,
	name: string,
): Promise<{ success: boolean; path?: string; error?: string }> {
	try {
		return await createLocalVaultFn({ data: { parentDir, name } });
	} catch (err) {
		return { success: false, error: errMessage(err, "新建仓库失败") };
	}
}

export async function renameVaultEntryRpc(
	relPath: string,
	newName: string,
	isNote: boolean,
): Promise<ObsidianMutationResult> {
	try {
		const res = await renameVaultEntryFn({
			data: { relPath, newName, isNote },
		});
		if (res.success) {
			const cached = vaultNoteCache.get(relPath);
			vaultNoteCache.delete(relPath);
			if (cached && res.relPath) {
				vaultNoteCache.set(res.relPath, {
					...cached,
					relPath: res.relPath,
					name: newName.replace(/\.md$/i, ""),
				});
			}
		}
		return res;
	} catch (err) {
		return { success: false, error: errMessage(err, "重命名失败") };
	}
}

export async function moveVaultEntryRpc(
	relPath: string,
	targetDir: string,
): Promise<ObsidianMutationResult> {
	try {
		const res = await moveVaultEntryFn({ data: { relPath, targetDir } });
		if (res.success && res.relPath) {
			const cached = vaultNoteCache.get(relPath);
			vaultNoteCache.delete(relPath);
			if (cached) {
				vaultNoteCache.set(res.relPath, {
					...cached,
					relPath: res.relPath,
				});
			}
		}
		return res;
	} catch (err) {
		return { success: false, error: errMessage(err, "移动失败") };
	}
}

export async function deleteVaultEntryRpc(
	relPath: string,
): Promise<ObsidianMutationResult> {
	try {
		const res = await deleteVaultEntryFn({ data: { relPath } });
		if (res.success) {
			vaultNoteCache.delete(relPath);
		}
		return res;
	} catch (err) {
		return { success: false, error: errMessage(err, "删除失败") };
	}
}

/** 在系统文件管理器中显示笔记/文件夹（macOS 访达 / Windows 文件资源管理器） */
export async function revealVaultEntryRpc(
	relPath: string,
): Promise<ObsidianMutationResult> {
	try {
		return await revealVaultEntryFn({ data: { relPath } });
	} catch (err) {
		return {
			success: false,
			error: errMessage(err, `打开${getFileManagerName()}失败`),
		};
	}
}

/** 用系统默认程序打开 Vault 内指定文件（如 epub、pdf、音视频等） */
export async function openVaultEntryRpc(
	relPath: string,
): Promise<ObsidianMutationResult> {
	try {
		return await openVaultEntryFn({ data: { relPath } });
	} catch (err) {
		return {
			success: false,
			error: errMessage(err, "打开文件失败"),
		};
	}
}
