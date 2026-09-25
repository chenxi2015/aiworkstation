import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import type { JSONContent } from "@tiptap/core";
import type { MaterialAsset } from "../../components/creator/types.ts";
import { markdownToTiptapDoc } from "../../components/editor/markdown.ts";
import { assertPathWithinRoot } from "../ai/fs/fsSafety.ts";
import { workbenchDb } from "../db/sqlite.ts";
import { getFilesRootDir } from "../services/filesRoot.ts";

/**
 * Server Function: 素材一键导入创作台（docs/selfmedia-merge-plan.md 第三节）。
 * 基于素材真实内容新建富文本文档：
 * - 文本类文件素材（md/markdown/txt）读取文件真实正文作为文档内容；
 * - 图片/视频资产以富文本媒体节点直接嵌入（image 内联展示 / video 可播放）；
 * - 音频与其他二进制文件追加为附件链接（/api/assets/stream 或 /api/files/ 可回读）；
 * - 文件型素材 content 里的占位说明（"文件素材：…"）不会写进文档。
 */
export const createDocumentFromMaterial = createServerFn({ method: "POST" })
	.validator((data: { materialId: number }) => data)
	.handler(
		async ({
			data,
		}): Promise<{ documentId: number; mode: "doc" | "audio" | "video" }> => {
		const materialId = Number(data.materialId);
		if (!materialId || Number.isNaN(materialId)) {
			throw new Error("无效的素材 ID");
		}
		const material = workbenchDb.getMaterial(materialId);
		if (!material) {
			throw new Error("素材不存在或已被删除，请刷新素材列表后重试");
		}

		const filesRoot = getFilesRootDir();
		const assets = material.assets ?? [];

		/** 资产的可访问 URL（优先使用流式端点，支持 Range Seek 与外部文件） */
		const getAssetUrl = (asset: MaterialAsset) => {
			if (asset.id) return `/api/assets/stream?id=${asset.id}`;
			return `/api/files/${asset.relPath.split("/").map(encodeURIComponent).join("/")}`;
		};

		/** 获取资产真实绝对路径（支持 external 与 managed） */
		const getAssetAbs = (asset: MaterialAsset): string | null => {
			if (asset.storageMode === "external") {
				return asset.sourcePath && existsSync(asset.sourcePath)
					? asset.sourcePath
					: null;
			}
			try {
				const abs = join(filesRoot, asset.relPath);
				assertPathWithinRoot(abs, filesRoot);
				return existsSync(abs) ? abs : null;
			} catch {
				return null;
			}
		};

		/** 读取文本类资产的真实正文 */
		const readTextAsset = (asset: MaterialAsset): string | null => {
			try {
				const abs = getAssetAbs(asset);
				if (!abs) return null;
				return readFileSync(abs, "utf-8");
			} catch {
				return null;
			}
		};

		/** 嗅探未知类型文件是否文本（前 8KB 无 NUL 字节即视为可读文本） */
		const isTextFile = (asset: MaterialAsset): boolean => {
			try {
				const abs = getAssetAbs(asset);
				if (!abs) return false;
				const buf = readFileSync(abs);
				return !buf.subarray(0, 8192).includes(0);
			} catch {
				return false;
			}
		};

		// 文本类资产：读取真实文件内容作为正文；媒体/二进制资产走节点或附件链接。
		const TEXT_EXTS = new Set([
			"txt",
			"json",
			"csv",
			"tsv",
			"xml",
			"yaml",
			"yml",
			"toml",
			"ini",
			"log",
			"html",
			"htm",
			"css",
			"js",
			"ts",
			"jsx",
			"tsx",
			"mjs",
			"cjs",
			"py",
			"java",
			"go",
			"rs",
			"sh",
			"sql",
			"vue",
			"svelte",
			"tex",
			"conf",
			"env",
		]);

		const CODE_FENCE_LANG: Record<string, string> = {
			json: "json",
			js: "javascript",
			mjs: "javascript",
			cjs: "javascript",
			ts: "typescript",
			jsx: "jsx",
			tsx: "tsx",
			py: "python",
			java: "java",
			go: "go",
			rs: "rust",
			sh: "bash",
			sql: "sql",
			css: "css",
			html: "html",
			htm: "html",
			xml: "xml",
			yaml: "yaml",
			yml: "yaml",
			toml: "toml",
			vue: "vue",
			svelte: "svelte",
		};

		const textAssets = assets.filter((a) => {
			const ext = extname(a.filename).replace(/^\./, "").toLowerCase();
			if (a.kind === "markdown" || TEXT_EXTS.has(ext)) return true;
			return a.kind === "other" && isTextFile(a);
		});
		const binaryAssets = assets.filter((a) => !textAssets.includes(a));

		const matchedAsset = assets.find((a) => a.filename === material.title);
		const docTitle = matchedAsset
			? material.title.slice(
					0,
					material.title.length - extname(matchedAsset.filename).length,
				)
			: material.title;

		const isPlaceholderContent = material.content
			.trim()
			.startsWith("文件素材：");
		const parts: string[] = [`# ${docTitle}`, ""];
		if (material.content.trim() && !isPlaceholderContent) {
			parts.push(material.content.trim(), "");
		}
		for (const asset of textAssets) {
			const text = readTextAsset(asset);
			if (!text?.trim()) continue;
			if (textAssets.length > 1) {
				parts.push(`## ${asset.filename}`, "");
			}
			const ext = extname(asset.filename).replace(/^\./, "").toLowerCase();
			const fenceLang = CODE_FENCE_LANG[ext];
			parts.push(
				fenceLang ? `\`\`\`${fenceLang}\n${text.trim()}\n\`\`\`` : text.trim(),
				"",
			);
		}
		if (material.note?.trim()) {
			parts.push(`> 批注：${material.note.trim()}`, "");
		}
		parts.push(`> 来源：素材库 #${material.id}`, "");

		const { nodes, contentText } = markdownToTiptapDoc(parts.join("\n"));

		const mediaNodes: JSONContent[] = [];
		if (binaryAssets.length > 0) {
			mediaNodes.push({
				type: "heading",
				attrs: { level: 2 },
				content: [{ type: "text", text: "关联素材文件" }],
			});
			for (const asset of binaryAssets) {
				const url = getAssetUrl(asset);
				if (asset.kind === "image") {
					mediaNodes.push({
						type: "image",
						attrs: { src: url, originalSrc: url, alt: asset.filename },
					});
				} else if (asset.kind === "video") {
					mediaNodes.push({
						type: "video",
						attrs: { src: url, originalSrc: url },
					});
				} else {
					mediaNodes.push({
						type: "paragraph",
						content: [
							{
								type: "text",
								text: asset.filename,
								marks: [{ type: "link", attrs: { href: url } }],
							},
						],
					});
				}
			}
		}

		let mediaMeta: Record<string, unknown> | undefined;
		const primaryAudio = binaryAssets.find((a) => a.kind === "audio");
		const primaryVideo = binaryAssets.find((a) => a.kind === "video");

		if (primaryAudio && textAssets.length === 0) {
			mediaMeta = {
				kind: "audio",
				url: getAssetUrl(primaryAudio),
				filename: primaryAudio.filename,
				size: primaryAudio.sizeBytes ?? undefined,
				materialId: material.id,
			};
		} else if (primaryVideo && textAssets.length === 0) {
			mediaMeta = {
				kind: "video",
				url: getAssetUrl(primaryVideo),
				filename: primaryVideo.filename,
				size: primaryVideo.sizeBytes ?? undefined,
				materialId: material.id,
			};
		}

		const jsonString = JSON.stringify({
			type: "doc",
			mediaMeta,
			content: [...nodes, ...mediaNodes],
		});
		const documentId = workbenchDb.createDocument({
			title: docTitle,
			content: jsonString,
			contentText,
		});

		return {
			documentId,
			mode: ((mediaMeta?.kind as "doc" | "audio" | "video") || "doc") as
				| "doc"
				| "audio"
				| "video",
		};
	});
