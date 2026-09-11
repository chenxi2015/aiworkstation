import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import type {
	DocumentVersion,
	DocumentVersionOrigin,
	EditorDocument,
} from "../../components/editor/types.ts";
import {
	assertPathWithinRoot,
	assertWritablePath,
	formatBytes,
} from "../ai/fs/fsSafety.ts";
import { workbenchDb } from "../db/sqlite.ts";
import {
	getDocumentAssetsDir,
	getFilesRootDir,
} from "../services/filesRoot.ts";

/** 上传媒体大小上限（图片/视频混排场景，本地优先故放宽到 200MB） */
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

/**
 * Server Function: 文档列表（默认不含 archived）
 */
export const listDocuments = createServerFn({ method: "GET" }).handler(
	async (): Promise<EditorDocument[]> => {
		return workbenchDb.listDocuments(false);
	},
);

/**
 * Server Function: 读取单个文档
 */
export const getDocument = createServerFn({ method: "GET" })
	.validator((data: { id: number }) => data)
	.handler(async ({ data }): Promise<EditorDocument | null> => {
		return workbenchDb.getDocument(data.id);
	});

/**
 * Server Function: 新建文档
 */
export const createDocument = createServerFn({ method: "POST" })
	.validator((data: { title?: string; stylePreset?: string }) => data)
	.handler(async ({ data }): Promise<EditorDocument> => {
		const id = workbenchDb.createDocument({
			title: data.title?.trim() || "未命名文档",
			stylePreset: data.stylePreset ?? "",
		});
		const doc = workbenchDb.getDocument(id);
		if (!doc) throw new Error("文档创建失败");
		return doc;
	});

/**
 * Server Function: 自动保存（标题/内容/风格/状态，防抖调用）
 */
export const updateDocument = createServerFn({ method: "POST" })
	.validator(
		(data: {
			id: number;
			title?: string;
			content?: string;
			contentText?: string;
			stylePreset?: string;
			status?: EditorDocument["status"];
		}) => data,
	)
	.handler(async ({ data }): Promise<void> => {
		if (!workbenchDb.getDocument(data.id)) throw new Error("文档不存在");
		workbenchDb.updateDocument(data.id, {
			title: data.title,
			content: data.content,
			contentText: data.contentText,
			stylePreset: data.stylePreset,
			status: data.status,
		});
	});

/**
 * Server Function: 删除文档（连同版本快照；可选用 deleteLocalAssets 清理本地媒体资源）
 */
export const deleteDocument = createServerFn({ method: "POST" })
	.validator((data: { id: number; deleteLocalAssets?: boolean }) => data)
	.handler(async ({ data }): Promise<void> => {
		workbenchDb.deleteDocument(data.id);
		if (data.deleteLocalAssets) {
			try {
				const filesRoot = getFilesRootDir();
				const assetsDir = getDocumentAssetsDir(data.id);
				assertPathWithinRoot(assetsDir, filesRoot);
				assertWritablePath(assetsDir);
				if (existsSync(assetsDir)) {
					rmSync(assetsDir, { recursive: true, force: true });
				}
			} catch (err) {
				console.warn(
					`[deleteDocument] Failed to delete local assets for document ${data.id}:`,
					err,
				);
			}
		}
	});

/**
 * Server Function: 打开文档的本地存储目录（由系统文件管理器打开）
 */
export const openDocumentDirectory = createServerFn({ method: "POST" })
	.validator((data: { id: number }) => data)
	.handler(async ({ data }): Promise<{ success: boolean; path: string }> => {
		const doc = workbenchDb.getDocument(data.id);
		if (!doc) throw new Error("文档不存在");

		const { openInOs } = await import("../services/systemOpener.ts");
		const assetsDir = getDocumentAssetsDir(data.id);
		return await openInOs(assetsDir, { ensureDir: true });
	});

/**
 * Server Function: 版本快照列表
 */
export const listDocumentVersions = createServerFn({ method: "GET" })
	.validator((data: { documentId: number }) => data)
	.handler(async ({ data }): Promise<DocumentVersion[]> => {
		return workbenchDb.listDocumentVersions(data.documentId);
	});

/**
 * Server Function: 手动打版本快照（AI 回写前的自动快照也走这里，origin='ai'）
 */
export const snapshotDocumentVersion = createServerFn({ method: "POST" })
	.validator(
		(data: {
			documentId: number;
			origin?: DocumentVersionOrigin;
			note?: string;
		}) => data,
	)
	.handler(async ({ data }): Promise<DocumentVersion> => {
		const doc = workbenchDb.getDocument(data.documentId);
		if (!doc) throw new Error("文档不存在");
		const id = workbenchDb.createDocumentVersion({
			documentId: data.documentId,
			content: doc.content,
			origin: data.origin ?? "human",
			note: data.note ?? null,
		});
		const version = workbenchDb
			.listDocumentVersions(data.documentId)
			.find((v) => v.id === id);
		if (!version) throw new Error("快照创建失败");
		return version;
	});

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

interface PlatformRefererRule {
	matches: (hostname: string) => boolean;
	referer: string;
}

/**
 * Platform specific anti-hotlinking referer rules
 */
const PLATFORM_REFERER_RULES: PlatformRefererRule[] = [
	// WeChat public platform & Tencent media
	{
		matches: (host) =>
			host.endsWith("qpic.cn") ||
			host.endsWith("qq.com") ||
			host.endsWith("gtimg.com"),
		referer: "https://mp.weixin.qq.com/",
	},
	// YouTube & Google Video / Thumbnail CDN
	{
		matches: (host) =>
			host.endsWith("youtube.com") ||
			host.endsWith("youtu.be") ||
			host.endsWith("googlevideo.com") ||
			host.endsWith("ytimg.com") ||
			host.endsWith("ggpht.com"),
		referer: "https://www.youtube.com/",
	},
	// Douyin & ByteDance CDN
	{
		matches: (host) =>
			host.endsWith("douyin.com") ||
			host.endsWith("iesdouyin.com") ||
			host.endsWith("douyincdn.com") ||
			host.endsWith("byteimg.com") ||
			host.endsWith("volces.com"),
		referer: "https://www.douyin.com/",
	},
	// TikTok
	{
		matches: (host) =>
			host.endsWith("tiktok.com") ||
			host.endsWith("tiktokcdn.com") ||
			host.endsWith("ibytedtos.com"),
		referer: "https://www.tiktok.com/",
	},
	// Kuaishou
	{
		matches: (host) =>
			host.endsWith("kuaishou.com") ||
			host.endsWith("yximgs.com") ||
			host.endsWith("ksapisrv.com") ||
			host.endsWith("gifshow.com"),
		referer: "https://www.kuaishou.com/",
	},
	// Bilibili
	{
		matches: (host) =>
			host.endsWith("hdslb.com") ||
			host.endsWith("bilibili.com") ||
			host.endsWith("biliapi.net"),
		referer: "https://www.bilibili.com/",
	},
	// Xiaohongshu
	{
		matches: (host) =>
			host.endsWith("xhscdn.com") || host.endsWith("xiaohongshu.com"),
		referer: "https://www.xiaohongshu.com/",
	},
	// Weibo & Sina
	{
		matches: (host) =>
			host.endsWith("sinaimg.cn") ||
			host.endsWith("weibo.com") ||
			host.endsWith("weibo.cn") ||
			host.endsWith("sina.com.cn"),
		referer: "https://weibo.com/",
	},
	// Zhihu
	{
		matches: (host) => host.endsWith("zhimg.com") || host.endsWith("zhihu.com"),
		referer: "https://www.zhihu.com/",
	},
	// X / Twitter
	{
		matches: (host) =>
			host.endsWith("twimg.com") ||
			host.endsWith("twitter.com") ||
			host.endsWith("x.com"),
		referer: "https://x.com/",
	},
	// Xigua Video
	{
		matches: (host) =>
			host.endsWith("ixigua.com") || host.endsWith("xigua.com"),
		referer: "https://www.ixigua.com/",
	},
	// Toutiao
	{
		matches: (host) =>
			host.endsWith("toutiao.com") || host.endsWith("toutiaoimg.com"),
		referer: "https://www.toutiao.com/",
	},
];

/**
 * Smartly resolves the Referer header for external media downloading.
 * Priority:
 * 1. Explicitly provided custom referer
 * 2. Well-known platform anti-leech rules (e.g. YouTube, Douyin, WeChat, Bilibili, etc.)
 * 3. Default to the resource's own URL to satisfy origin/page-level anti-hotlinking
 */
export function resolveAssetReferer(
	url: string,
	customReferer?: string,
): string {
	if (customReferer && customReferer.trim()) {
		return customReferer.trim();
	}

	try {
		const urlObj = new URL(url);
		const hostname = urlObj.hostname.toLowerCase();

		const matchedRule = PLATFORM_REFERER_RULES.find((rule) =>
			rule.matches(hostname),
		);
		if (matchedRule) {
			return matchedRule.referer;
		}

		// Default to using the resource's own URL
		return url;
	} catch {
		return url;
	}
}

/**
 * Server Function: 下载外链图片/视频并转存到当前稿件本地目录
 * 服务端请求无 CORS 限制，并携带防盗链 Referer 头
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
		const headers: Record<string, string> = {
			"User-Agent":
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
			Referer: resolveAssetReferer(url, customReferer),
		};

		let response = await fetch(url, { headers });
		// Fallback retry without Referer if 403 Forbidden is returned
		if (response.status === 403 && headers.Referer) {
			const fallbackHeaders = { ...headers };
			delete fallbackHeaders.Referer;
			const fallbackRes = await fetch(url, { headers: fallbackHeaders });
			if (fallbackRes.ok) {
				response = fallbackRes;
			}
		}

		if (!response.ok) {
			throw new Error(
				`下载失败 (HTTP ${response.status} ${response.statusText})`,
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

/**
 * Server Function: AI bar 文本生成（非流式，快速返回改写结果）。
 * BubbleMenu 动作条专用；复用 ragContext LLM 配置，不走 agent loop，省 latency。
 */
export const generateAiBarText = createServerFn({ method: "POST" })
	.validator(
		(data: { prompt: string; systemHint?: string; stylePreset?: string }) =>
			data,
	)
	.handler(async ({ data }): Promise<{ text: string }> => {
		const { chat } = await import("@tanstack/ai");
		const { openaiCompatibleText } = await import(
			"@tanstack/ai-openai/compatible"
		);
		const { resolveLlmConfig } = await import("../ai/ragContext.ts");
		const { resolveEditorPresetPrompt } = await import(
			"../ai/editorPresets.ts"
		);

		const { apiKey, baseUrl, model } = resolveLlmConfig();
		if (!apiKey) {
			return {
				text: "（请先在设置中填入 LLM API Key 才能使用 AI bar 功能）",
			};
		}

		const adapter = openaiCompatibleText(model, { baseURL: baseUrl, apiKey });
		const presetPrompt = resolveEditorPresetPrompt(data.stylePreset);
		const systemPrompt =
			(data.systemHint ||
				"你是一名专业中文写作助手。直接输出改写后的内容，不要加前缀说明。") +
			presetPrompt;

		const stream = await chat({
			adapter,
			systemPrompts: [systemPrompt],
			messages: [{ role: "user", content: data.prompt }],
			stream: true,
		});

		let result = "";
		for await (const chunk of stream as AsyncIterable<
			Record<string, unknown>
		>) {
			const delta = (chunk.delta ?? chunk.content ?? "") as string;
			if (delta) result += delta;
		}

		return { text: result.trim() };
	});
