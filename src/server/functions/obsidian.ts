import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import type {
	ObsidianMutationResult,
	ObsidianNoteContent,
	ObsidianSaveResult,
	ObsidianTree,
} from "../../components/obsidian/types.ts";
import { resolveUserPath } from "../ai/fs/fsSafety.ts";
import {
	createVaultFolder,
	createVaultNote,
	deleteVaultEntry,
	moveVaultEntry,
	readVaultNote,
	renameVaultEntry,
	saveVaultNote,
	scanVaultTree,
} from "../services/obsidian/index.ts";

/**
 * Server Function: 列出本机目录的子文件夹（目录选择器数据源）。
 * dirPath 为空时从用户主目录开始；跳过隐藏目录与 node_modules；
 * 附带 isVault 标记（含 .obsidian 元数据目录的即为 Obsidian Vault）。
 */
export const listLocalDirectories = createServerFn({ method: "POST" })
	.validator((data?: { dirPath?: string }) => data ?? {})
	.handler(
		async ({
			data,
		}): Promise<{
			success: boolean;
			path: string;
			parent: string | null;
			currentIsVault: boolean;
			dirs: Array<{ name: string; path: string; isVault: boolean }>;
			error?: string;
		}> => {
			const empty = {
				path: "",
				parent: null,
				currentIsVault: false,
				dirs: [] as Array<{ name: string; path: string; isVault: boolean }>,
			};
			try {
				const target = data.dirPath?.trim()
					? resolveUserPath(data.dirPath)
					: homedir();
				if (!statSync(target).isDirectory()) {
					throw new Error("目标不是文件夹");
				}
				const entries = readdirSync(target, { withFileTypes: true });
				const dirs: Array<{ name: string; path: string; isVault: boolean }> =
					[];
				for (const entry of entries) {
					if (dirs.length >= 500) break;
					if (entry.name.startsWith(".") || entry.name === "node_modules") {
						continue;
					}
					if (!entry.isDirectory()) continue;
					const full = join(target, entry.name);
					dirs.push({
						name: entry.name,
						path: full,
						isVault: existsSync(join(full, ".obsidian")),
					});
				}
				dirs.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
				const parent = dirname(target);
				return {
					success: true,
					path: target,
					parent: parent === target ? null : parent,
					currentIsVault: existsSync(join(target, ".obsidian")),
					dirs,
				};
			} catch (err) {
				return {
					success: false,
					...empty,
					error: err instanceof Error ? err.message : "读取目录失败",
				};
			}
		},
	);

/**
 * Server Function: 扫描 Obsidian Vault 目录树（60s 缓存，force 绕过）
 */
export const getObsidianTree = createServerFn({ method: "GET" })
	.validator((data?: { force?: boolean }) => data ?? {})
	.handler(async ({ data }): Promise<ObsidianTree> => {
		return await scanVaultTree(Boolean(data.force));
	});

/**
 * Server Function: 读取单篇笔记全文（含 mtime 冲突检测基线）
 */
export const readVaultNoteFn = createServerFn({ method: "POST" })
	.validator((data: { relPath: string }) => data)
	.handler(
		async ({
			data,
		}): Promise<{
			success: boolean;
			note: ObsidianNoteContent | null;
			error?: string;
		}> => {
			try {
				const note = await readVaultNote(data.relPath);
				return { success: true, note };
			} catch (err) {
				return {
					success: false,
					note: null,
					error: err instanceof Error ? err.message : "读取笔记失败",
				};
			}
		},
	);

/**
 * Server Function: 保存笔记（mtime 乐观并发；提供 baseContent 时冲突先尝试三方合并，
 * 合并失败才返回 conflict=true）
 */
export const saveVaultNoteFn = createServerFn({ method: "POST" })
	.validator(
		(data: {
			relPath: string;
			content: string;
			baseMtime?: number;
			baseContent?: string;
			force?: boolean;
		}) => data,
	)
	.handler(async ({ data }): Promise<ObsidianSaveResult> => {
		return await saveVaultNote(
			data.relPath,
			data.content,
			data.baseMtime,
			data.baseContent,
			data.force,
		);
	});

/**
 * Server Function: 新建笔记（dirPath 为空串时建在 Vault 根目录）
 */
export const createVaultNoteFn = createServerFn({ method: "POST" })
	.validator(
		(data: { dirPath: string; name: string; content?: string }) => data,
	)
	.handler(async ({ data }): Promise<ObsidianMutationResult> => {
		return await createVaultNote(data.dirPath, data.name, data.content);
	});

/**
 * Server Function: 新建文件夹
 */
export const createVaultFolderFn = createServerFn({ method: "POST" })
	.validator((data: { dirPath: string; name: string }) => data)
	.handler(async ({ data }): Promise<ObsidianMutationResult> => {
		return await createVaultFolder(data.dirPath, data.name);
	});

/**
 * Server Function: 同目录重命名笔记/文件夹
 */
export const renameVaultEntryFn = createServerFn({ method: "POST" })
	.validator(
		(data: { relPath: string; newName: string; isNote: boolean }) => data,
	)
	.handler(async ({ data }): Promise<ObsidianMutationResult> => {
		return await renameVaultEntry(data.relPath, data.newName, data.isNote);
	});

/**
 * Server Function: 移动笔记/文件夹到目标目录（空串 = Vault 根目录）
 */
export const moveVaultEntryFn = createServerFn({ method: "POST" })
	.validator((data: { relPath: string; targetDir: string }) => data)
	.handler(async ({ data }): Promise<ObsidianMutationResult> => {
		return await moveVaultEntry(data.relPath, data.targetDir);
	});

/**
 * Server Function: 删除笔记/文件夹（文件夹递归删除）
 */
export const deleteVaultEntryFn = createServerFn({ method: "POST" })
	.validator((data: { relPath: string }) => data)
	.handler(async ({ data }): Promise<ObsidianMutationResult> => {
		return await deleteVaultEntry(data.relPath);
	});
