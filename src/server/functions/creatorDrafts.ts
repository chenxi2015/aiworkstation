import { chat } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
	Draft,
	DraftPlatform,
	DraftStatus,
	DraftVariant,
	DraftWithMaterial,
} from "../../components/creator/types.ts";
import type { WorkbenchSettings } from "../../components/workbench/types.ts";
import { extractAndParseJSON } from "../../services/classifier/responseParser.ts";
import { DEFAULT_LLM_BASE_URL } from "../../services/classifier/taxonomy.ts";
import { getEffectiveLLMConfig } from "../../services/storage/settingsStorage.ts";
import {
	buildDraftsSystemPrompt,
	buildDraftsUserPrompt,
} from "../ai/creatorPresets.ts";
import { workbenchDb } from "../db/sqlite.ts";

export const VALID_PLATFORMS: DraftPlatform[] = [
	"xhs",
	"twitter",
	"wechat",
	"script",
];

export const VALID_DRAFT_STATUSES: DraftStatus[] = [
	"draft_ready",
	"reviewing",
	"approved",
	"exported",
	"discarded",
];

function getDbSettings(): Partial<WorkbenchSettings> {
	try {
		const raw = workbenchDb.getSetting("workbench_settings");
		return raw ? (JSON.parse(raw) as WorkbenchSettings) : {};
	} catch {
		return {};
	}
}

export const draftVariantsSchema = z.object({
	variants: z.array(
		z.object({
			platform: z.enum(["xhs", "twitter", "wechat", "script"]),
			content: z.string(),
		}),
	),
});

/**
 * Server Function: AI generation - generate multiple platform variants in one call (chat() structured output).
 * Uses json_object response format + extractAndParseJSON + Zod schema validation
 * for compatibility with deepseek and other generic OpenAI-compatible gateways.
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
 * Server Function: Adopt AI variant into draft box (origin='ai', status='draft_ready')
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
 * Server Function: List non-discarded latest draft versions with material title
 */
export const listDrafts = createServerFn({ method: "GET" }).handler(
	async (): Promise<DraftWithMaterial[]> => {
		return workbenchDb.listDrafts();
	},
);

/**
 * Server Function: Edit draft content manually - create new version in chain (origin='human')
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
 * Server Function: Transition draft status through finite state machine
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
 * Server Function: Export gate - non-approved drafts are blocked from exporting.
 * First export transitions approved -> exported; repeat exports are idempotent.
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
