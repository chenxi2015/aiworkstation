import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { chat } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
	AssetKind,
	Draft,
	DraftPlatform,
	DraftStatus,
	DraftVariant,
	DraftWithMaterial,
	Material,
	MaterialFolder,
} from "../../components/creator/types.ts";
import type {
	WorkbenchItem,
	WorkbenchSettings,
} from "../../components/workbench/types.ts";
import { extractAndParseJSON } from "../../services/classifier/responseParser.ts";
import { DEFAULT_LLM_BASE_URL } from "../../services/classifier/taxonomy.ts";
import { getEffectiveLLMConfig } from "../../services/storage/settingsStorage.ts";
import {
	buildDraftsSystemPrompt,
	buildDraftsUserPrompt,
} from "../ai/creatorPresets.ts";
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

const VALID_PLATFORMS: DraftPlatform[] = ["xhs", "twitter", "wechat", "script"];

const VALID_DRAFT_STATUSES: DraftStatus[] = [
	"draft_ready",
	"reviewing",
	"approved",
	"exported",
	"discarded",
];

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

function getDbSettings(): Partial<WorkbenchSettings> {
	try {
		const raw = workbenchDb.getSetting("workbench_settings");
		return raw ? (JSON.parse(raw) as WorkbenchSettings) : {};
	} catch {
		return {};
	}
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
			description: data.description?.trim(),
		});
		const folder = workbenchDb.getMaterialFolder(data.id);
		if (!folder) throw new Error("文件夹不存在");
		return folder;
	});

/**
 * Server Function: 删除素材文件夹（素材移回未归档，不删素材本身）
 */
export const deleteMaterialFolder = createServerFn({ method: "POST" })
	.validator((data: { id: number }) => data)
	.handler(async ({ data }): Promise<{ success: boolean }> => {
		workbenchDb.deleteMaterialFolder(data.id);
		return { success: true };
	});

/**
 * Server Function: 手动新建素材
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
		const content = data.content?.trim();
		if (!title) throw new Error("素材标题不能为空");
		if (!content) throw new Error("素材正文不能为空");
		const id = workbenchDb.createMaterial({
			sourceType: "manual",
			folderId: data.folderId ?? null,
			title,
			content,
			note: data.note?.trim() || null,
		});
		const material = workbenchDb.getMaterial(id);
		if (!material) throw new Error("素材创建失败");
		return material;
	});

/**
 * Server Function: 书签选择器数据源（默认最近收藏，支持关键词过滤）
 */
export const searchBookmarksForPicker = createServerFn({ method: "POST" })
	.validator((data?: { query?: string; limit?: number }) => data ?? {})
	.handler(async ({ data }): Promise<WorkbenchItem[]> => {
		return workbenchDb.queryBookmarks({
			keyword: data.query?.trim() || undefined,
			limit: data.limit ?? 30,
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
 * Server Function: 本地文件导入素材
 * 文件复制入 <filesRootDir>/creator/materials/<materialId>/ 并登记 assets（DB 只存 rel_path）。
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

		// 1. 先落素材记录拿到 id（文件型素材 content 存摘要说明，正文在 assets 文件里）
		const materialId = workbenchDb.createMaterial({
			sourceType: "manual",
			folderId: data.folderId ?? null,
			title,
			content: `文件素材：${filename}（${formatBytes(stat.size)}），正文见关联资产文件。`,
			note: data.note?.trim() || null,
		});

		// 2. 目标路径限定在 filesRootDir 内（写入根目录限定 + 路径穿越防护）
		const filesRoot = getFilesRootDir();
		const destDir = getMaterialAssetsDir(materialId);
		assertPathWithinRoot(destDir, filesRoot);
		assertWritablePath(destDir);
		mkdirSync(destDir, { recursive: true });

		// 3. 重名去重后复制
		const ext = extname(filename);
		const stem = filename.slice(0, filename.length - ext.length);
		let finalName = filename;
		for (let i = 2; existsSync(join(destDir, finalName)); i++) {
			finalName = `${stem}-${i}${ext}`;
		}
		const destAbs = join(destDir, finalName);
		copyFileSync(sourceAbs, destAbs);

		// 4. 登记 assets（只存相对 filesRootDir 的 rel_path）
		workbenchDb.addAsset({
			materialId,
			relPath: join("creator", "materials", String(materialId), finalName),
			kind: detectAssetKind(finalName),
			filename: finalName,
			sizeBytes: stat.size,
		});

		const material = workbenchDb.getMaterial(materialId);
		if (!material) throw new Error("素材导入失败");
		return material;
	});

/**
 * Server Function: 更新素材（标题/正文/批注/状态）
 */
export const updateMaterial = createServerFn({ method: "POST" })
	.validator(
		(data: {
			id: number;
			title?: string;
			content?: string;
			note?: string | null;
			status?: "active" | "archived";
			folderId?: number | null;
		}) => data,
	)
	.handler(async ({ data }): Promise<Material> => {
		workbenchDb.updateMaterial(data.id, {
			title: data.title?.trim() || undefined,
			content: data.content,
			note: data.note,
			status: data.status,
			folderId: data.folderId,
		});
		const material = workbenchDb.getMaterial(data.id);
		if (!material) throw new Error("素材不存在");
		return material;
	});

const draftVariantsSchema = z.object({
	variants: z.array(
		z.object({
			platform: z.enum(["xhs", "twitter", "wechat", "script"]),
			content: z.string(),
		}),
	),
});

/**
 * Server Function: AI 二创 —— 一次调用产出多平台变体（chat() 结构化输出）。
 *
 * 注意：未使用 outputSchema API —— TanStack AI 的 openaiCompatible 适配器会把
 * outputSchema 强制转成 `response_format: json_schema`（见 openai-base #605），
 * 而 DeepSeek 等兼容端点只支持 `json_object`，会直接 400。
 * 因此沿用仓库 classify.ts 的既定模式：`response_format: json_object`
 * + extractAndParseJSON + zod 校验，语义等价于结构化输出。
 * 结果不落库，由用户在工作台逐条「采纳进草稿」。
 */
export const generateDrafts = createServerFn({ method: "POST" })
	.validator((data: { materialId: number; platforms: DraftPlatform[] }) => {
		if (!Array.isArray(data.platforms) || data.platforms.length === 0) {
			throw new Error("请至少选择一个目标平台");
		}
		return data;
	})
	.handler(async ({ data }): Promise<{ variants: DraftVariant[] }> => {
		const material = workbenchDb.getMaterial(data.materialId);
		if (!material) throw new Error("素材不存在或已被删除");
		if (material.status !== "active")
			throw new Error("素材已归档，不能用于二创");

		const platforms = Array.from(
			new Set(data.platforms.filter((p) => VALID_PLATFORMS.includes(p))),
		);
		if (platforms.length === 0) throw new Error("目标平台不合法");

		const { apiKey, baseUrl, model } = getEffectiveLLMConfig(getDbSettings());
		if (!apiKey) {
			throw new Error("请先在「设置」中配置大模型 API Key 后再进行 AI 二创");
		}

		const adapter = openaiCompatibleText(model, {
			baseURL: baseUrl || DEFAULT_LLM_BASE_URL,
			apiKey,
			defaultHeaders: { "User-Agent": "aiworkstation-server/1.0" },
		});

		const abortController = new AbortController();
		const timeoutTimer = setTimeout(() => {
			abortController.abort(new Error("AI 二创请求服务端超时 (90s)"));
		}, 90000);

		try {
			const rawText = await chat({
				adapter,
				systemPrompts: [buildDraftsSystemPrompt(platforms)],
				messages: [
					{ role: "user", content: buildDraftsUserPrompt(material, platforms) },
				],
				stream: false,
				modelOptions: {
					response_format: { type: "json_object" },
				},
				abortController,
			});

			const result = draftVariantsSchema.parse(extractAndParseJSON(rawText));

			const requested = new Set(platforms);
			const variants = result.variants
				.filter((v) => requested.has(v.platform as DraftPlatform))
				.map((v) => ({
					platform: v.platform as DraftPlatform,
					content: v.content.trim(),
				}))
				.filter((v) => v.content.length > 0);

			if (variants.length === 0) {
				throw new Error("AI 未返回有效变体，请重试");
			}
			return { variants };
		} finally {
			clearTimeout(timeoutTimer);
		}
	});

/**
 * Server Function: 采纳 AI 变体进草稿箱（origin='ai', status='draft_ready'）
 */
export const adoptDraft = createServerFn({ method: "POST" })
	.validator(
		(data: { materialId: number; platform: DraftPlatform; content: string }) =>
			data,
	)
	.handler(async ({ data }): Promise<Draft> => {
		const material = workbenchDb.getMaterial(data.materialId);
		if (!material) throw new Error("素材不存在或已被删除");
		const content = data.content?.trim();
		if (!content) throw new Error("草稿内容不能为空");
		const id = workbenchDb.createDraft({
			materialId: data.materialId,
			platform: data.platform,
			content,
			origin: "ai",
		});
		const draft = workbenchDb.getDraft(id);
		if (!draft) throw new Error("草稿保存失败");
		return draft;
	});

/**
 * Server Function: 草稿箱列表（每条版本链只返回未废弃的最新版本，附素材标题）
 */
export const listDrafts = createServerFn({ method: "GET" }).handler(
	async (): Promise<DraftWithMaterial[]> => {
		return workbenchDb.listDrafts();
	},
);

/**
 * Server Function: 人工编辑草稿内容 —— 沿版本链产生新版本（origin='human'）
 */
export const updateDraftContent = createServerFn({ method: "POST" })
	.validator((data: { draftId: number; content: string }) => data)
	.handler(async ({ data }): Promise<Draft> => {
		const content = data.content?.trim();
		if (!content) throw new Error("草稿内容不能为空");
		const id = workbenchDb.createDraftVersion(data.draftId, content);
		const draft = workbenchDb.getDraft(id);
		if (!draft) throw new Error("草稿保存失败");
		return draft;
	});

/**
 * Server Function: 草稿状态流转（状态机层面拦截非法跃迁）
 */
export const updateDraftStatus = createServerFn({ method: "POST" })
	.validator((data: { draftId: number; status: DraftStatus }) => {
		if (!VALID_DRAFT_STATUSES.includes(data.status)) {
			throw new Error(`非法草稿状态：${data.status}`);
		}
		return data;
	})
	.handler(async ({ data }): Promise<{ success: boolean }> => {
		workbenchDb.updateDraftStatus(data.draftId, data.status);
		return { success: true };
	});

/**
 * Server Function: 导出闸门 —— 未 approved 的草稿在状态机层面拦截，禁止导出。
 * 首次导出 approved → exported；重复导出幂等。
 */
export const exportDraft = createServerFn({ method: "POST" })
	.validator((data: { draftId: number }) => data)
	.handler(
		async ({
			data,
		}): Promise<{
			content: string;
			platform: DraftPlatform;
			draftId: number;
		}> => {
			const draft = workbenchDb.exportDraft(data.draftId);
			return {
				content: draft.content,
				platform: draft.platform,
				draftId: draft.id,
			};
		},
	);
