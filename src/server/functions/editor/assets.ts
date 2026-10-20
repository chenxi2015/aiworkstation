import {
	copyFileSync,
	existsSync,
	mkdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import {
	assertPathWithinRoot,
	assertWritablePath,
	formatBytes,
} from "../../ai/fs/fsSafety.ts";
import { workbenchDb } from "../../db/sqlite.ts";
import {
	getDocumentAssetsDir,
	getFilesRootDir,
} from "../../services/filesRoot.ts";
import { fetchAssetWithAdaptiveHeaders } from "./antiLeech.ts";

/** 上传媒体大小上限（图片/视频混排场景，本地优先故放宽到 200MB） */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

/**
 * Server Function: 上传文档媒体（图片/视频），落 <filesRootDir>/editor/documents/<id>/，
 * 返回可通过 /api/files/ 访问的 URL（docs/editor-plan.md 第五节：媒体文件不入库）。
 */
export const uploadDocumentAsset = createServerFn({ method: "POST" })
	.validator((data: FormData) => {
		const file = data.get("file");
		const documentId = Number(data.get("documentId"));
		if (!(file instanceof File)) throw new Error("缺少文件");
		if (!Number.isInteger(documentId) || documentId <= 0) {
			throw new Error("documentId 非法");
		}
		return { file, documentId };
	})
	.handler(async ({ data }): Promise<{ url: string; filename: string }> => {
		const { file, documentId } = data;
		if (!workbenchDb.getDocument(documentId)) throw new Error("文档不存在");
		if (file.size > MAX_UPLOAD_BYTES) {
			throw new Error(
				`文件过大（${formatBytes(file.size)}），上限 ${formatBytes(MAX_UPLOAD_BYTES)}`,
			);
		}

		const filesRoot = getFilesRootDir();
		const destDir = getDocumentAssetsDir(documentId);
		assertPathWithinRoot(destDir, filesRoot);
		assertWritablePath(destDir);
		mkdirSync(destDir, { recursive: true });

		// 重名去重：name.png → name-1.png / name-2.png
		const rawName = file.name || "asset";
		const ext = extname(rawName);
		const stem = rawName.slice(0, rawName.length - ext.length);
		let finalName = rawName;
		let counter = 1;
		while (existsSync(join(destDir, finalName))) {
			finalName = `${stem}-${counter}${ext}`;
			counter += 1;
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		writeFileSync(join(destDir, finalName), buffer);

		// rel 路径相对 filesRootDir，由 /api/files/ 静态服务回读
		const relPath = `editor/documents/${documentId}/${finalName}`;
		return { url: `/api/files/${relPath}`, filename: finalName };
	});

/**
 * Server Function: 从素材库复制资产到当前文档媒体目录（docs/studio-materials-link-plan.md：
 * 插入 = 复制不是引用，文档自包含，素材日后删除/移动不影响文档）。
 * managed 资产相对 filesRootDir 解析，external 原位资产从 sourcePath 复制。
 */
export const importMaterialAssetToDocument = createServerFn({
	method: "POST",
})
	.validator((data: { documentId: number; assetId: number }) => data)
	.handler(
		async ({
			data,
		}): Promise<{ url: string; filename: string; kind: string }> => {
			const { documentId, assetId } = data;
			if (!Number.isInteger(documentId) || documentId <= 0) {
				throw new Error("documentId 非法");
			}
			if (!Number.isInteger(assetId) || assetId <= 0) {
				throw new Error("assetId 非法");
			}
			if (!workbenchDb.getDocument(documentId)) throw new Error("文档不存在");
			const asset = workbenchDb.getAsset(assetId);
			if (!asset) throw new Error("素材资产不存在");

			const filesRoot = getFilesRootDir();
			let sourceAbs: string;

			if (asset.storageMode === "external") {
				// 外部原位引用：路径由用户导入时登记，信任级别对齐 /api/assets/stream
				if (!asset.sourcePath) throw new Error("外部素材未记录原始路径");
				sourceAbs = resolve(asset.sourcePath);
			} else {
				sourceAbs = resolve(filesRoot, asset.relPath);
				// 兼容历史工具落盘的素材：rel_path 可能只是文件名，实际位于素材目录下
				if (
					(!existsSync(sourceAbs) || !statSync(sourceAbs).isFile()) &&
					asset.materialId
				) {
					const fallback = resolve(
						filesRoot,
						"creator",
						"materials",
						String(asset.materialId),
						asset.relPath,
					);
					if (existsSync(fallback) && statSync(fallback).isFile()) {
						sourceAbs = fallback;
					}
				}
				assertPathWithinRoot(sourceAbs, filesRoot);
			}

			if (!existsSync(sourceAbs) || !statSync(sourceAbs).isFile()) {
				throw new Error("素材原始文件不存在或已被移动/删除");
			}

			const destDir = getDocumentAssetsDir(documentId);
			assertPathWithinRoot(destDir, filesRoot);
			assertWritablePath(destDir);
			mkdirSync(destDir, { recursive: true });

			// 重名去重：name.png → name-1.png / name-2.png（与 uploadDocumentAsset 同规则）
			const rawName = asset.filename || basename(sourceAbs) || "asset";
			const ext = extname(rawName);
			const stem = rawName.slice(0, rawName.length - ext.length);
			let finalName = rawName;
			let counter = 1;
			while (existsSync(join(destDir, finalName))) {
				finalName = `${stem}-${counter}${ext}`;
				counter += 1;
			}

			copyFileSync(sourceAbs, join(destDir, finalName));

			// rel 路径相对 filesRootDir，由 /api/files/ 静态服务回读
			const relPath = `editor/documents/${documentId}/${finalName}`;
			return {
				url: `/api/files/${relPath}`,
				filename: finalName,
				kind: asset.kind,
			};
		},
	);

/**
 * Server Function: 下载外链图片/视频并转存到当前稿件本地目录
 * 服务端请求无 CORS 限制，并携带防盗链与自适应候选标头
 */
export const downloadExternalAssetToDocument = createServerFn({
	method: "POST",
})
	.validator((data: { documentId: number; url: string; referer?: string }) => {
		const { documentId, url, referer } = data;
		if (!documentId || !url) throw new Error("缺少 documentId 或 url");
		return {
			documentId: Number(documentId),
			url: String(url).trim(),
			referer: referer ? String(referer).trim() : undefined,
		};
	})
	.handler(async ({ data }): Promise<{ url: string; filename: string }> => {
		const { documentId, url, referer: customReferer } = data;
		if (!workbenchDb.getDocument(documentId)) throw new Error("文档不存在");

		const urlObj = new URL(url);
		let response: Response;
		try {
			response = await fetchAssetWithAdaptiveHeaders(url, customReferer);
		} catch (fetchErr) {
			throw new Error(
				fetchErr instanceof Error ? fetchErr.message : "请求外部图片地址失败",
			);
		}

		const arrayBuffer = await response.arrayBuffer();
		if (arrayBuffer.byteLength > MAX_UPLOAD_BYTES) {
			throw new Error(
				`媒体文件过大（${formatBytes(arrayBuffer.byteLength)}），上限 ${formatBytes(MAX_UPLOAD_BYTES)}`,
			);
		}

		const filesRoot = getFilesRootDir();
		const destDir = getDocumentAssetsDir(documentId);
		assertPathWithinRoot(destDir, filesRoot);
		assertWritablePath(destDir);
		mkdirSync(destDir, { recursive: true });

		// 智能解析扩展名：优先从 url query (wx_fmt)、pathname，再到 content-type
		let ext = "";
		const wxFmt = urlObj.searchParams.get("wx_fmt");
		if (wxFmt) {
			ext = wxFmt === "jpeg" ? ".jpg" : `.${wxFmt}`;
		} else {
			const pathExt = extname(urlObj.pathname);
			if (
				pathExt &&
				/\.(jpg|jpeg|png|webp|gif|svg|avif|mp4|webm|mov|ogg)$/i.test(pathExt)
			) {
				ext = pathExt.toLowerCase();
			} else {
				const contentType = response.headers.get("content-type") || "";
				if (contentType.includes("image/jpeg")) ext = ".jpg";
				else if (contentType.includes("image/png")) ext = ".png";
				else if (contentType.includes("image/webp")) ext = ".webp";
				else if (contentType.includes("image/gif")) ext = ".gif";
				else if (contentType.includes("image/svg")) ext = ".svg";
				else if (contentType.includes("video/mp4")) ext = ".mp4";
				else if (contentType.includes("video/webm")) ext = ".webm";
				else if (contentType.includes("video/")) ext = ".mp4";
				else ext = ".png";
			}
		}

		const isVideo = ext.startsWith(".mp4") || ext.startsWith(".webm");
		const basePrefix = isVideo ? "video" : "image";
		const baseName = `${basePrefix}_${Date.now()}`;
		let finalName = `${baseName}${ext}`;
		let counter = 1;
		while (existsSync(join(destDir, finalName))) {
			finalName = `${baseName}-${counter}${ext}`;
			counter += 1;
		}

		writeFileSync(join(destDir, finalName), Buffer.from(arrayBuffer));

		const relPath = `editor/documents/${documentId}/${finalName}`;
		return { url: `/api/files/${relPath}`, filename: finalName };
	});

