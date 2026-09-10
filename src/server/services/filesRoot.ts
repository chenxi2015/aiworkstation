import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { workbenchDb } from "../db/sqlite.ts";

/**
 * 文件管理根目录（filesRootDir）解析约定（docs/creator-plan.md 第三节）：
 *
 * - 设置项 `downloadsDir` 已升级为 `filesRootDir`（文件管理根目录）；
 *   读取时旧 key 作 alias 免迁移兼容，写入只写新 key（由客户端 saveSettings 保证）。
 * - 未配置时根目录回退为系统下载目录 ~/Downloads。
 * - 目录结构约定：
 *     <filesRootDir>/downloads/                 视频下载
 *     <filesRootDir>/creator/materials/<id>/    每个素材一个目录
 *     <filesRootDir>/editor/documents/<id>/     每个创作文档的媒体目录
 * - DB 只存相对根目录的 rel_path，根目录整体可搬家。
 */

/** Expand ~ prefix to user home directory */
function expandHome(pathStr: string): string {
	if (pathStr === "~") return homedir();
	if (pathStr.startsWith("~/") || pathStr.startsWith("~\\")) {
		return join(homedir(), pathStr.slice(2));
	}
	return pathStr;
}

/** 读取用户配置的根目录；未配置返回 null（调用方决定回退策略） */
export function getConfiguredFilesRoot(): string | null {
	try {
		const raw = workbenchDb.getSetting("workbench_settings");
		const parsed = raw ? JSON.parse(raw) : null;
		const configured = String(
			parsed?.filesRootDir ?? parsed?.downloadsDir ?? "",
		).trim();
		return configured ? resolve(expandHome(configured)) : null;
	} catch {
		return null;
	}
}

/** 文件管理根目录（未配置时回退 ~/Downloads） */
export function getFilesRootDir(): string {
	return getConfiguredFilesRoot() ?? join(homedir(), "Downloads");
}

/**
 * 视频下载目的地：配置了根目录 → <filesRootDir>/downloads；
 * 未配置 → 系统下载目录（保持历史行为）。
 */
export function getVideoDownloadsDir(): string {
	const root = getConfiguredFilesRoot();
	return root ? join(root, "downloads") : join(homedir(), "Downloads");
}

/** 素材资产目录：<filesRootDir>/creator/materials/<materialId> */
export function getMaterialAssetsDir(materialId: number): string {
	return join(getFilesRootDir(), "creator", "materials", String(materialId));
}

/** 文档媒体目录：<filesRootDir>/editor/documents/<documentId> */
export function getDocumentAssetsDir(documentId: number): string {
	return join(getFilesRootDir(), "editor", "documents", String(documentId));
}
