import {
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, extname, join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import type {
	AssetKind,
	Material,
	MaterialFolder,
} from "../../components/creator/types.ts";
import type { WorkbenchItem } from "../../components/workbench/types.ts";
import {
	assertPathWithinRoot,
	assertWritablePath,
	formatBytes,
	resolveUserPath,
} from "../ai/fs/fsSafety.ts";
import { getDb } from "../db/connection.ts";
import { workbenchDb } from "../db/sqlite.ts";
import {
	getFilesRootDir,
	getMaterialAssetsDir,
} from "../services/filesRoot.ts";
import { openInOs } from "../services/systemOpener.ts";
import { pickSystemPaths } from "../services/systemPicker.ts";

const KIND_BY_EXT: Record<string, AssetKind> = {
	mp4: "video",
	mov: "video",
	webm: "video",
	mkv: "video",
	m4v: "video",
	md: "markdown",
	markdown: "markdown",
	png: "image",
	jpg: "image",
	jpeg: "image",
	gif: "image",
	webp: "image",
	svg: "image",
	mp3: "audio",
	wav: "audio",
	m4a: "audio",
	ogg: "audio",
	flac: "audio",
};

function detectAssetKind(filename: string): AssetKind {
	const ext = extname(filename).replace(/^\./, "").toLowerCase();
	return KIND_BY_EXT[ext] ?? "other";
}

/**
 * Server Function: 素材列表（默认只返回 active，含文件资产关联）
 */
export const listCreatorMaterials = createServerFn({ method: "GET" }).handler(
	async (): Promise<Material[]> => {
		return workbenchDb.listMaterials(false);
	},
);

/**
 * Server Function: 已归档素材列表（归档 Tab 展示，含文件资产关联）
 */
export const listArchivedCreatorMaterials = createServerFn({
	method: "GET",
}).handler(async (): Promise<Material[]> => {
	return workbenchDb.listMaterials("archived");
});

/**
 * Server Function: 素材文件夹列表（附素材计数）
 */
export const listMaterialFolders = createServerFn({ method: "GET" }).handler(
	async (): Promise<MaterialFolder[]> => {
		return workbenchDb.listMaterialFolders();
	},
);

/**
 * Server Function: 新建素材文件夹
 */
export const createMaterialFolder = createServerFn({ method: "POST" })
	.validator((data: { name: string; description?: string }) => data)
	.handler(async ({ data }): Promise<MaterialFolder> => {
		const name = data.name?.trim();
		if (!name) throw new Error("文件夹名称不能为空");
		const id = workbenchDb.createMaterialFolder({
			name,
			description: data.description?.trim() || null,
		});
		const folder = workbenchDb.getMaterialFolder(id);
		if (!folder) throw new Error("文件夹创建失败");
		return folder;
	});

/**
 * Server Function: 重命名素材文件夹
 */
export const updateMaterialFolder = createServerFn({ method: "POST" })
	.validator((data: { id: number; name: string; description?: string }) => data)
	.handler(async ({ data }): Promise<MaterialFolder> => {
		const name = data.name?.trim();
		if (!name) throw new Error("文件夹名称不能为空");
		workbenchDb.updateMaterialFolder(data.id, {
			name,
			description: data.description?.trim() || null,
		});
		const folder = workbenchDb.getMaterialFolder(data.id);
		if (!folder) throw new Error("文件夹更新失败");
		return folder;
	});

/**
 * Server Function: 删除素材文件夹（其下素材自动移入「未归档」）
 */
export const deleteMaterialFolder = createServerFn({ method: "POST" })
	.validator((data: { id: number }) => data)
	.handler(async ({ data }): Promise<{ deleted: boolean }> => {
		workbenchDb.deleteMaterialFolder(data.id);
		return { deleted: true };
	});

/**
 * Server Function: 书签选择器数据源（默认最近收藏，支持关键词过滤）
 */
export const searchBookmarksForPicker = createServerFn({ method: "POST" })
	.validator((data?: { query?: string; limit?: number }) => data ?? {})
	.handler(async ({ data }): Promise<WorkbenchItem[]> => {
		return workbenchDb.queryBookmarks({
			keyword: data?.query?.trim() || undefined,
			limit: data?.limit ?? 30,
		});
	});

/**
 * Server Function: 从书签导入素材（快照复制 content，此后书签更新不影响素材）
 */
export const importBookmarkAsMaterial = createServerFn({ method: "POST" })
	.validator(
		(data: { bookmarkId: string; note?: string; folderId?: number | null }) =>
			data,
	)
	.handler(async ({ data }): Promise<Material> => {
		const row = getDb()
			.prepare("SELECT * FROM bookmarks WHERE id = ?")
			.get(data.bookmarkId) as
			| {
					id: string;
					title: string;
					url: string;
					description: string | null;
					summary: string | null;
			  }
			| undefined;
		if (!row) throw new Error("书签不存在或已被删除");

		const body = (row.summary || row.description || "").trim();
		const snapshot = [
			body || "（该书签暂无摘要内容）",
			"",
			`原文链接：${row.url}`,
		].join("\n");

		const id = workbenchDb.createMaterial({
			sourceType: "bookmark",
			bookmarkId: row.id,
			folderId: data.folderId ?? null,
			title: row.title,
			content: snapshot,
			note: data.note?.trim() || null,
		});
		const material = workbenchDb.getMaterial(id);
		if (!material) throw new Error("素材导入失败");
		return material;
	});

/**
 * Server Function: 手动新建文本素材（灵感速记/摘录）
 */
export const createManualMaterial = createServerFn({ method: "POST" })
	.validator(
		(data: {
			title: string;
			content: string;
			note?: string;
			folderId?: number | null;
		}) => data,
	)
	.handler(async ({ data }): Promise<Material> => {
		const title = data.title?.trim();
		if (!title) throw new Error("素材标题不能为空");
		const id = workbenchDb.createMaterial({
			sourceType: "manual",
			folderId: data.folderId ?? null,
			title,
			content: data.content ?? "",
			note: data.note?.trim() || null,
		});
		const material = workbenchDb.getMaterial(id);
		if (!material) throw new Error("素材创建失败");
		return material;
	});

/**
 * Server Function: 本地文件导入素材（原位引用，零拷贝）
 * 仅记录文件绝对路径与元信息，绝不复制文件本体。
 */
export const importFileAsMaterial = createServerFn({ method: "POST" })
	.validator(
		(data: {
			sourcePath: string;
			title?: string;
			note?: string;
			folderId?: number | null;
		}) => data,
	)
	.handler(async ({ data }): Promise<Material> => {
		const sourceAbs = resolveUserPath(data.sourcePath);
		if (!existsSync(sourceAbs)) {
			throw new Error(`文件不存在：${sourceAbs}`);
		}
		const stat = statSync(sourceAbs);
		if (!stat.isFile()) {
			throw new Error(`目标不是文件：${sourceAbs}`);
		}
		const filename = basename(sourceAbs);
		const title = data.title?.trim() || filename;

		// 1. 创建素材记录
		const materialId = workbenchDb.createMaterial({
			sourceType: "manual",
			folderId: data.folderId ?? null,
			title,
			content: `文件素材：${filename}（${formatBytes(stat.size)}），原位引用自：${sourceAbs}`,
			note: data.note?.trim() || null,
		});

		// 2. 登记 assets（external 原位引用模式，记录绝对路径，完全不复制文件）
		workbenchDb.addAsset({
			materialId,
			relPath: filename,
			kind: detectAssetKind(filename),
			filename,
			sizeBytes: stat.size,
			storageMode: "external",
			sourcePath: sourceAbs,
		});

		const material = workbenchDb.getMaterial(materialId);
		if (!material) throw new Error("素材导入失败");
		return material;
	});

/** 素材上传大小上限（兼容老接口备用，500MB） */
const MAX_MATERIAL_UPLOAD_BYTES = 500 * 1024 * 1024;

/**
 * Server Function: 本地文件上传导入素材（老托管模式兼容接口）
 */
export const uploadMaterialFiles = createServerFn({ method: "POST" })
	.validator((data: FormData) => {
		const files = data
			.getAll("files")
			.filter((f): f is File => f instanceof File);
		const folderIdRaw = data.get("folderId");
		const folderIdNum = folderIdRaw ? Number(folderIdRaw) : null;
		if (files.length === 0) throw new Error("缺少文件");
		return {
			files,
			folderId:
				folderIdNum && Number.isInteger(folderIdNum) && folderIdNum > 0
					? folderIdNum
					: null,
		};
	})
	.handler(async ({ data }): Promise<{ imported: number }> => {
		const filesRoot = getFilesRootDir();
		let imported = 0;
		for (const file of data.files) {
			if (file.size === 0) continue;
			if (file.size > MAX_MATERIAL_UPLOAD_BYTES) {
				throw new Error(
					`文件「${file.name}」过大（${formatBytes(file.size)}），上限 ${formatBytes(MAX_MATERIAL_UPLOAD_BYTES)}`,
				);
			}
			const filename = basename(file.name) || "未命名文件";

			const materialId = workbenchDb.createMaterial({
				sourceType: "manual",
				folderId: data.folderId,
				title: filename,
				content: `文件素材：${filename}（${formatBytes(file.size)}），正文见关联资产文件。`,
				note: null,
			});

			const destDir = getMaterialAssetsDir(materialId);
			assertPathWithinRoot(destDir, filesRoot);
			assertWritablePath(destDir);
			mkdirSync(destDir, { recursive: true });

			const ext = extname(filename);
			const stem = filename.slice(0, filename.length - ext.length);
			let finalName = filename;
			for (let i = 2; existsSync(join(destDir, finalName)); i++) {
				finalName = `${stem}-${i}${ext}`;
			}
			writeFileSync(
				join(destDir, finalName),
				Buffer.from(await file.arrayBuffer()),
			);

			workbenchDb.addAsset({
				materialId,
				relPath: join("creator", "materials", String(materialId), finalName),
				kind: detectAssetKind(finalName),
				filename: finalName,
				sizeBytes: file.size,
			});
			imported++;
		}
		if (imported === 0) throw new Error("没有可导入的有效文件");
		return { imported };
	});

/**
 * 递归扫描路径下的媒体文件（排除隐藏文件和开发目录，上限 1000 个以防根目录卡死）
 */
function scanMediaFilesFromPath(targetPath: string): string[] {
	const resolved = resolveUserPath(targetPath);
	if (!existsSync(resolved)) return [];
	const stat = statSync(resolved);
	if (stat.isFile()) {
		const ext = extname(resolved).replace(/^\./, "").toLowerCase();
		return KIND_BY_EXT[ext] ? [resolved] : [];
	}
	if (stat.isDirectory()) {
		const results: string[] = [];
		const queue = [resolved];
		let visited = 0;
		while (queue.length > 0 && visited < 1000 && results.length < 1000) {
			const current = queue.shift();
			if (!current) break;
			visited++;
			try {
				const entries = readdirSync(current, { withFileTypes: true });
				for (const entry of entries) {
					if (entry.name.startsWith(".")) continue;
					if (entry.name === "node_modules" || entry.name === ".git") continue;
					const fullPath = join(current, entry.name);
					if (entry.isFile()) {
						const ext = extname(entry.name).replace(/^\./, "").toLowerCase();
						if (KIND_BY_EXT[ext]) {
							results.push(fullPath);
						}
					} else if (entry.isDirectory() && visited < 200) {
						queue.push(fullPath);
					}
				}
			} catch {
				// Ignore access permission errors
			}
		}
		return results;
	}
	return [];
}

/**
 * Server Function: 唤起操作系统原生访达/文件管理器选择器（返回选中的绝对路径列表，零拷贝）
 */
export const pickLocalPaths = createServerFn({ method: "POST" })
	.validator((data: { mode: "files" | "directory" }) => data)
	.handler(async ({ data }): Promise<string[]> => {
		return pickSystemPaths(data.mode);
	});

/**
 * Server Function: 零拷贝外部路径导入素材（原位引用）
 * 将外部文件或目录路径写入数据库，完全不移动或复制原始文件，毫秒级完成。
 */
export const importLocalPathsAsMaterials = createServerFn({ method: "POST" })
	.validator((data: { paths: string[]; folderId?: number | null }) => data)
	.handler(async ({ data }): Promise<{ imported: number }> => {
		const rawPaths = data.paths ?? [];
		if (rawPaths.length === 0) throw new Error("缺少路径");

		const allFiles: string[] = [];
		for (const p of rawPaths) {
			const scanned = scanMediaFilesFromPath(p);
			for (const file of scanned) {
				if (!allFiles.includes(file)) {
					allFiles.push(file);
				}
			}
		}

		if (allFiles.length === 0) {
			throw new Error(
				"所选路径下未找到有效媒体素材（音视频、图片、Markdown、文档等）",
			);
		}

		let imported = 0;
		for (const absPath of allFiles) {
			try {
				const stat = statSync(absPath);
				if (stat.size === 0) continue;
				const filename = basename(absPath);

				// 1. 创建素材记录
				const materialId = workbenchDb.createMaterial({
					sourceType: "manual",
					folderId: data.folderId ?? null,
					title: filename,
					content: `文件素材：${filename}（${formatBytes(stat.size)}），原位引用自：${absPath}`,
					note: null,
				});

				// 2. 登记 assets（external 模式，记录原始绝对路径，不复制文件）
				workbenchDb.addAsset({
					materialId,
					relPath: filename,
					kind: detectAssetKind(filename),
					filename,
					sizeBytes: stat.size,
					storageMode: "external",
					sourcePath: absPath,
				});

				imported++;
			} catch (err) {
				console.warn(`[importLocalPaths] Skip file ${absPath}:`, err);
			}
		}

		if (imported === 0) {
			throw new Error("没有成功导入的文件");
		}

		return { imported };
	});

/**
 * Server Function: 更新素材（标题/正文/批注/状态/收藏/文件夹）
 */
export const updateMaterial = createServerFn({ method: "POST" })
	.validator(
		(data: {
			id: number;
			title?: string;
			content?: string;
			note?: string | null;
			status?: "active" | "archived";
			starred?: boolean;
			folderId?: number | null;
		}) => data,
	)
	.handler(async ({ data }): Promise<Material> => {
		const material = workbenchDb.getMaterial(data.id);
		if (!material) throw new Error("素材不存在");

		const nextTitle = data.title?.trim() ?? material.title;
		const nextContent = data.content ?? material.content;
		const nextNote = data.note !== undefined ? data.note : material.note;
		const nextStatus = data.status ?? material.status;
		const nextStarred =
			data.starred !== undefined ? data.starred : (material.starred ?? false);

		workbenchDb.updateMaterial(data.id, {
			title: nextTitle,
			content: nextContent,
			note: nextNote,
			status: nextStatus,
			starred: nextStarred,
			folderId: data.folderId !== undefined ? data.folderId : material.folderId,
		});

		const updated = workbenchDb.getMaterial(data.id);
		if (!updated) throw new Error("素材更新失败");
		return updated;
	});

/**
 * Server Function: 删除素材（幂等操作，外键已解绑，原位引用保护）
 */
export const deleteMaterial = createServerFn({ method: "POST" })
	.validator((data: { id: number }) => data)
	.handler(async ({ data }): Promise<{ deleted: boolean }> => {
		const materialId = Number(data.id);
		if (!materialId || Number.isNaN(materialId)) return { deleted: true };
		const material = workbenchDb.getMaterial(materialId);
		if (!material) {
			// 幂等容错：若素材已不存在，视为已删除，不抛出异常打断用户批量流程
			return { deleted: true };
		}
		const hasManagedAssets = (material.assets ?? []).some(
			(a) => a.storageMode !== "external",
		);
		workbenchDb.deleteMaterial(materialId);
		// 仅当存在工作台托管文件时清理内部资产目录；原位引用模式绝对不删除用户的本地源文件
		if (hasManagedAssets) {
			const assetsDir = getMaterialAssetsDir(materialId);
			assertPathWithinRoot(assetsDir, getFilesRootDir());
			rmSync(assetsDir, { recursive: true, force: true });
		}
		return { deleted: true };
	});

/**
 * Server Function: 批量删除素材（原子事务，幂等且兼顾资产清理与外键解绑）
 */
export const batchDeleteMaterials = createServerFn({ method: "POST" })
	.validator((data: { ids: number[] }) => data)
	.handler(async ({ data }): Promise<{ deletedCount: number }> => {
		const rawIds = (data.ids ?? [])
			.map((id) => Number(id))
			.filter((id) => !Number.isNaN(id) && id > 0);
		if (rawIds.length === 0) return { deletedCount: 0 };

		// 检查哪些素材有托管文件，以便清理资产目录
		for (const id of rawIds) {
			try {
				const material = workbenchDb.getMaterial(id);
				if (material) {
					const hasManaged = (material.assets ?? []).some(
						(a) => a.storageMode !== "external",
					);
					if (hasManaged) {
						const assetsDir = getMaterialAssetsDir(id);
						assertPathWithinRoot(assetsDir, getFilesRootDir());
						rmSync(assetsDir, { recursive: true, force: true });
					}
				}
			} catch {
				// Ignore directory cleaning errors
			}
		}

		workbenchDb.batchDeleteMaterials(rawIds);
		return { deletedCount: rawIds.length };
	});

/**
 * Server Function: 在系统文件管理器中打开素材或其资产目录。
 * - 原位引用模式（external）：直接在访达/资源管理器中选中定位到该源文件；
 * - 托管模式（managed）：打开 <filesRootDir>/creator/materials/<id>/ 目录。
 */
export const openMaterialAssetsDir = createServerFn({ method: "POST" })
	.validator((data: { id: number }) => data)
	.handler(async ({ data }): Promise<{ opened: boolean; path: string }> => {
		const material = workbenchDb.getMaterial(data.id);
		if (!material) throw new Error("素材不存在");
		const externalAsset = (material.assets ?? []).find(
			(a) => a.storageMode === "external" && a.sourcePath,
		);
		if (externalAsset?.sourcePath && existsSync(externalAsset.sourcePath)) {
			// 原位引用模式：直接在访达中高亮选中文件
			await openInOs(externalAsset.sourcePath, {
				reveal: true,
				skipRootCheck: true,
			});
			return { opened: true, path: externalAsset.sourcePath };
		}
		// 托管模式回退
		const assetsDir = getMaterialAssetsDir(data.id);
		assertPathWithinRoot(assetsDir, getFilesRootDir());
		const result = await openInOs(assetsDir, {
			ensureDir: true,
			skipRootCheck: true,
		});
		return { opened: result.success, path: result.path };
	});
