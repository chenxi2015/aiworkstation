import type {
	ObsidianMutationResult,
	ObsidianNoteContent,
	ObsidianSaveResult,
	ObsidianTree,
} from "../../components/obsidian/types";
import {
	createVaultFolderFn,
	createVaultNoteFn,
	deleteVaultEntryFn,
	getObsidianTree,
	listLocalDirectories,
	moveVaultEntryFn,
	readVaultNoteFn,
	renameVaultEntryFn,
	saveVaultNoteFn,
} from "../../server/functions/obsidian";

const EMPTY_TREE: ObsidianTree = {
	vault: { path: "", configured: "", exists: false, noteCount: 0 },
	tree: [],
	scannedAt: 0,
};

function errMessage(err: unknown, fallback: string): string {
	return err instanceof Error ? err.message : fallback;
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

/** 获取 Vault 目录树（force=true 绕过服务端 60s 缓存重新扫描） */
export async function fetchObsidianTree(force = false): Promise<ObsidianTree> {
	try {
		return (await getObsidianTree({ data: { force } })) ?? EMPTY_TREE;
	} catch (err) {
		console.warn("[obsidianClient] getObsidianTree error:", err);
		return EMPTY_TREE;
	}
}

/** 读取单篇笔记全文（含 mtime 冲突检测基线） */
export async function fetchVaultNote(
	relPath: string,
): Promise<{ note: ObsidianNoteContent | null; error?: string }> {
	try {
		const res = await readVaultNoteFn({ data: { relPath } });
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
		return await saveVaultNoteFn({
			data: {
				relPath,
				content,
				baseMtime: options?.baseMtime,
				baseContent: options?.baseContent,
				force: options?.force,
			},
		});
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

export async function renameVaultEntryRpc(
	relPath: string,
	newName: string,
	isNote: boolean,
): Promise<ObsidianMutationResult> {
	try {
		return await renameVaultEntryFn({ data: { relPath, newName, isNote } });
	} catch (err) {
		return { success: false, error: errMessage(err, "重命名失败") };
	}
}

export async function moveVaultEntryRpc(
	relPath: string,
	targetDir: string,
): Promise<ObsidianMutationResult> {
	try {
		return await moveVaultEntryFn({ data: { relPath, targetDir } });
	} catch (err) {
		return { success: false, error: errMessage(err, "移动失败") };
	}
}

export async function deleteVaultEntryRpc(
	relPath: string,
): Promise<ObsidianMutationResult> {
	try {
		return await deleteVaultEntryFn({ data: { relPath } });
	} catch (err) {
		return { success: false, error: errMessage(err, "删除失败") };
	}
}
