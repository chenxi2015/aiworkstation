import { chat } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { createServerFn } from "@tanstack/react-start";
import type {
	SearchResultItem,
	WorkbenchSettings,
} from "../../components/workbench/types";
import {
	type EmbeddingConfig,
	EmbeddingService,
} from "../../services/embeddingService";
import { createBookmarkServerTools } from "../ai/bookmarkTools";
import { workbenchDb } from "../db/sqlite.ts";

export interface ChatMessage {
	role: "user" | "assistant" | "system" | "tool";
	content: string;
	tool_call_id?: string;
	tool_calls?: unknown[];
}

export interface RAGChatResult {
	answer: string;
	references: SearchResultItem[];
	timestamp: string;
	dbMutated?: boolean;
}

export interface FolderDossierResult {
	folderId: number;
	folderName: string;
	itemCount: number;
	dossierMarkdown: string;
	generatedAt: string;
}

export interface LlmConfigOverrides {
	apiKey?: string;
	baseUrl?: string;
	model?: string;
}

/**
 * Resolve effective LLM config on the server.
 * Priority: caller overrides > settings stored in SQLite > defaults.
 */
function resolveLlmConfig(overrides: LlmConfigOverrides = {}): {
	apiKey: string;
	baseUrl: string;
	model: string;
} {
	let dbSettings: Partial<WorkbenchSettings> | null = null;
	try {
		const raw = workbenchDb.getSetting("workbench_settings");
		if (raw) dbSettings = JSON.parse(raw) as Partial<WorkbenchSettings>;
	} catch (err) {
		console.warn("[rag] Failed to parse settings from SQLite:", err);
	}

	const apiKey = overrides.apiKey?.trim() || dbSettings?.apiKey?.trim() || "";
	const baseUrl = (
		overrides.baseUrl?.trim() ||
		dbSettings?.baseUrl?.trim() ||
		"https://api.deepseek.com"
	).replace(/\/+$/, "");
	const model =
		overrides.model?.trim() || dbSettings?.model?.trim() || "deepseek-chat";

	return { apiKey, baseUrl, model };
}

/**
 * Resolve effective embedding config on the server.
 * Priority: caller overrides > settings stored in SQLite (embedding key falls back to LLM key).
 */
function resolveEmbeddingConfig(
	overrides: EmbeddingConfig = {},
): EmbeddingConfig {
	if (overrides.apiKey?.trim()) return overrides;

	let dbSettings: Partial<WorkbenchSettings> | null = null;
	try {
		const raw = workbenchDb.getSetting("workbench_settings");
		if (raw) dbSettings = JSON.parse(raw) as Partial<WorkbenchSettings>;
	} catch (err) {
		console.warn("[rag] Failed to parse settings from SQLite:", err);
	}
	if (!dbSettings) return overrides;

	return {
		apiKey:
			dbSettings.embeddingApiKey?.trim() || dbSettings.apiKey?.trim() || "",
		baseUrl: overrides.baseUrl || dbSettings.embeddingBaseUrl,
		model: overrides.model || dbSettings.embeddingModel,
	};
}

/**
 * Server Function: Chat with bookmarks using TanStack AI Native chat() + toolDefinition Pipeline
 */
export const chatWithBookmarks = createServerFn({ method: "POST" })
	.validator(
		(data: {
			question: string;
			history?: ChatMessage[];
			embeddingConfig?: EmbeddingConfig;
			llmConfig?: LlmConfigOverrides;
			folderId?: number | null;
			folderName?: string;
		}) => data,
	)
	.handler(async ({ data }): Promise<RAGChatResult> => {
		const {
			question,
			history = [],
			embeddingConfig = {},
			llmConfig = {},
			folderId,
			folderName,
		} = data;

		const q = question?.trim();
		if (!q) {
			throw new Error("Question cannot be empty");
		}

		// 1. Retrieve Candidate Bookmarks from SQLite for standard RAG fallback (filter by folderId if specified)
		let candidateItems = workbenchDb.getAllBookmarksForSearch();
		if (folderId != null) {
			candidateItems = candidateItems.filter(
				(item) => item.folderId === folderId,
			);
		}
		if (candidateItems.length === 0) {
			return {
				answer:
					folderName != null
						? `当前文件夹「${folderName}」中暂无书签数据。`
						: "你的收藏库中目前还没有书签数据，请先通过 Chrome 扩展同步或导入一些书签。",
				references: [],
				timestamp: new Date().toLocaleTimeString(),
			};
		}

		// 2. Compute query vector if API Key is configured (falls back to SQLite settings)
		const effectiveEmbeddingConfig = resolveEmbeddingConfig(embeddingConfig);
		let queryVector: number[] | null = null;
		if (effectiveEmbeddingConfig.apiKey) {
			queryVector = await EmbeddingService.generateQueryEmbedding(
				q,
				effectiveEmbeddingConfig,
			);
		}

		// 3. Top-K Hybrid Ranking for semantic background context
		const ranked = EmbeddingService.rankItems(
			candidateItems,
			q,
			queryVector,
			"hybrid",
		);
		// Keep Top-6 as internal context for LLM background knowledge
		const contextReferences = ranked.slice(0, 6);

		// High-confidence threshold (>= 0.35) to preserve RAG bookmark activation
		// Only display interactive cards when bookmarks are truly relevant to user query, eliminating noise during planning/governance
		const HIGH_RELEVANCE_THRESHOLD = 0.35;
		const highConfidenceRefs = ranked
			.filter((item) => (item.score || 0) >= HIGH_RELEVANCE_THRESHOLD)
			.slice(0, 6);

		// User-facing references: populated if high-confidence matches exist or when tools explicitly return items
		let references: SearchResultItem[] = highConfidenceRefs;

		// 4. Time and Environment metadata for LLM
		const now = new Date();
		const dateStr = now.toISOString().split("T")[0];
		const dayNames = [
			"星期日",
			"星期一",
			"星期二",
			"星期三",
			"星期四",
			"星期五",
			"星期六",
		];
		const dayOfWeek = dayNames[now.getDay()];
		const timeStr = now.toTimeString().split(" ")[0];

		// 5. Construct RAG Context Prompt
		const contextSnippets =
			contextReferences.length > 0
				? contextReferences
						.map((item, i) => {
							const tags =
								item.tags && item.tags.length > 0
									? ` [标签: ${item.tags.join(", ")}]`
									: "";
							const folder = item.folderName
								? ` [所属文件夹: ${item.folderName}]`
								: "";
							const desc = item.summary || item.description || "无详细描述";
							return `【参考来源 ${i + 1}】《${item.name}》\n- 网址: ${item.url || "无"}\n- 描述/摘要: ${desc}${tags}${folder}`;
						})
						.join("\n\n")
				: "（未在本地库中检索到高相关性的书签）";

		const folderScopePrompt =
			folderId != null && folderName
				? `\n- 【当前问答限定范围】: 用户已启用【限定文件夹范围】模式，指定聚焦在文件夹「${folderName}」(ID: ${folderId})。除非用户在提问中明确要求跨文件夹或搜索全局，否则所有回答、盘点与分析请严格限制在该文件夹下的书签和资产；若调用 query_bookmarks 工具，请务必传入 folderName: "${folderName}" 或 folderId: ${folderId}。`
				: "\n- 【当前问答范围】: 全局知识库（涵盖所有文件夹及未分类书签）。";

		const systemPrompt = `你内置于用户本地个人 AI 工作台（AI Workstation），是用户的专属【私人知识智囊与外脑合伙人】（Personal Intelligence & Knowledge Partner）。
你不仅拥有直接操作本地 SQLite 知识库的行动手脚，更具备主动洞察、结构化治理与启发式对话的智囊思维。你的目标是帮助用户激活沉睡收藏、理清数字资产、减轻认知负担。

【交互风格与智囊人格（Pi-Style Persona）】:
1. **主动而有深度**：面对用户的宽泛想法或架构诉求（如“分类太细了/怎么整理/帮我规划”），绝不生硬地抛回问题，也不机械地一次性把数据全部篡改；而是先探查现状，给出深思熟虑的方案，并主动引导推进。
2. **结构化提案规范（三段式闭环）**：
   - **① 现状洞察（Diagnosis）**：简练客观地总结当前状态（如“目前你共有 X 个主分类，其中 A 和 B 存在职责交叉……”）；
   - **② 专家提案（Proposal）**：给出 1~2 套清晰优雅的重塑方案（例如精简为 5~7 个黄金主分类），讲清分类背后的心智模型与归并理由；
   - **③ 确认与行动指引（Actionable Confirmation）**：主动询问用户偏好，并告知后续行动（如：“如果你认可此方案，回复‘确认调整’，我将直接调用工具为你批量重组到位；或者你也可以告诉我你更倾向保留哪个分类”）。
3. **克制交付，拒绝噪音**：背景记忆片段仅作为你思考和知识面的支撑，若非用户明确要求找具体书签，正文只输出有价值的见解，绝不强塞无关网址。
4. **语气与排版**：温和、专业、富有见解，善用 Emoji 和 Markdown 层次让长文易读清晰。

【当前系统环境】:
- 当前日期: ${dateStr} (${dayOfWeek})
- 当前时间: ${timeStr}${folderScopePrompt}

【工具调用与执行规范】:
1. 【宏观统计与架构治理（最优先）】：当用户询问知识库整体规模（如“我有多少书签/文件夹”）、提出分类重组（如“当前主分类太细了/请控制在5到7个分类/怎么归拢结构”）、或要求进行健康体检时，**必须第一时间静默调用 \`get_stats\` 工具**（设置 focus: "categories" 或 "all"）。根据工具返回的真实数据进行方案设计，严禁凭空编造分类或文件夹！
2. 【精准查询】：当用户询问涉及【时间范围】（如“今天/本周/最近收藏了什么”）、【特定主题盘点】（如“自媒体分类下有哪些”）或【具体书签查找】时，主动调用 \`query_bookmarks\` 工具从 SQLite 查询最新记录。
3. 【具体工具定位与解答】：当用户询问某个具体工具/网站“在哪里”、“属于哪个分类/文件夹”或“网址是什么”时，若下方【参考来源】中已经命中了该工具，**直接根据参考来源作答**（明确说明其所在的文件夹名称、网址与用途），无需重复发起数据库查询。
4. 【创建文件夹】：当用户明确要求新建文件夹或用户已确认了新建方案时，调用 \`create_folder\` 工具。
5. 【批量归类 vs 任务复用书签】：调用 \`move_bookmarks_to_folder\` 工具。注意区分 mode 参数：
   - 规整/清理/分类（剪切移入）：mode 设为 "move"（默认值）；
   - 任务复用/挑选组装工具（保留原归属，建立多对多链接）：mode 设为 "link"，支持配合 tags（如 tags: ["自媒体"]）批量按标签挑选工具。
6. 【更新文件夹】：修改文件夹名称、分类或描述时，调用 \`update_folder\` 工具（分类合并时可批量调用此工具将文件夹移动到新的主分类）。
7. 【移动文件夹与开启工作】：当用户要求把文件夹移入另一个文件夹（建立子分组）、移回顶层，或者要求将文件夹拿到「工作台」开启专注工作时，调用 \`move_folder\` 工具。
8. 【文件夹排序】：当用户要求调整文件夹排列顺序时，调用 \`reorder_folders\` 工具。
9. 【移出书签】：从文件夹中移出某些书签（回到未分类）或清空文件夹时，调用 \`remove_bookmarks_from_folder\` 工具。
10. 【删除文件夹】：当用户明确要求删除文件夹时，调用 \`delete_folder\` 工具（默认保留书签并移回未分类；仅明确说连同内容删除时才设 deleteBookmarks=true）。
11. 【工具参数规范】：
    - 参数必须是合法的 JSON 对象，键与字符串值必须严格使用英文双引号闭合（如 {"keyword": "视频"}）；
    - 只传递需要的参数，不要传递 null 或空键；静默执行工具调用，严禁自言自语输出“正在为您查询”等内部思考。

以下是从本地知识库语义检索到的背景记忆片段（仅供你在思考和回答时参考；若用户提问是宏观规划、分类结构调整、管理操作或日常对话，请忽略与主题无关的条目，切勿强行生搬硬套）：
${contextSnippets}`;

		// 6. Setup Provider Config (caller overrides > SQLite settings > env vars)
		const { apiKey, baseUrl, model } = resolveLlmConfig(llmConfig);

		if (!apiKey) {
			return {
				answer: `已为你检索到 ${contextReferences.length} 个相关收藏（见下方引用卡片）。\n\n提示：如需启用 AI 智能总结与深度问答，请在右上角「设置」中填入 LLM API Key。`,
				references: contextReferences,
				timestamp: new Date().toLocaleTimeString(),
				dbMutated: false,
			};
		}

		let hasDbMutated = false;

		// 7. Instantiate server tools with execution callbacks
		const tools = createBookmarkServerTools({
			onMutated: () => {
				hasDbMutated = true;
			},
			onReferencesFound: (refs) => {
				references = refs;
			},
		});

		// 8. Create TanStack AI OpenAI-compatible adapter
		const adapter = openaiCompatibleText(model, {
			baseURL: baseUrl,
			apiKey,
		});

		// 9. Prepare message history (excluding system prompt from messages array)
		const messages: Array<{
			role: "user" | "assistant" | "tool";
			content: string;
		}> = [
			...history
				.filter(
					(h) =>
						h.role === "user" || h.role === "assistant" || h.role === "tool",
				)
				.slice(-4)
				.map((h) => ({
					role: h.role as "user" | "assistant" | "tool",
					content: h.content,
				})),
			{ role: "user", content: q },
		];

		// 10. Execute TanStack AI agent loop
		let answer = "";
		try {
			answer = await chat({
				adapter,
				systemPrompts: [systemPrompt],
				messages,
				tools,
				stream: false,
			});
		} catch (error: unknown) {
			console.error("[chatWithBookmarks] TanStack AI chat error:", error);
			const errMsg =
				error instanceof Error
					? error.message
					: "未知错误，请检查 API Key 或网络";
			return {
				answer: `⚠️ **AI 问答服务异常**: ${errMsg}\n\n请检查「设置」中的 API Key、Base URL 或网络连接。`,
				references,
				timestamp: new Date().toLocaleTimeString(),
				dbMutated: false,
			};
		}

		return {
			answer: answer || "未能成功生成回答，请稍后再试。",
			references,
			timestamp: new Date().toLocaleTimeString(),
			dbMutated: hasDbMutated,
		};
	});

/**
 * Server Function: Generate structured research dossier for a folder using TanStack AI chat()
 */
export const generateFolderDossier = createServerFn({ method: "POST" })
	.validator(
		(data: { folderId: number; llmConfig?: LlmConfigOverrides }) => data,
	)
	.handler(async ({ data }): Promise<FolderDossierResult> => {
		const { folderId, llmConfig = {} } = data;

		const folders = workbenchDb.getAllFolders();
		const targetFolder = folders.find((f) => f.id === folderId);
		if (!targetFolder) {
			throw new Error("Folder not found");
		}

		if (targetFolder.items.length === 0) {
			throw new Error("该文件夹内暂无书签条目，无法生成专题综述");
		}

		const itemsListText = targetFolder.items
			.map((item, idx) => {
				const tags =
					item.tags && item.tags.length > 0 ? ` [${item.tags.join(", ")}]` : "";
				const desc = item.summary || item.description || "无详细描述";
				return `${idx + 1}. 《${item.name}》${tags}\n   - URL: ${item.url || "无"}\n   - 描述/特性: ${desc}`;
			})
			.join("\n\n");

		const systemPrompt = `你是一个资深技术分析师与知识管理专家。
你的任务是将用户在「${targetFolder.name}」（分类：${targetFolder.category}）文件夹中收藏的 ${targetFolder.items.length} 个书签条目，提炼成一份专业、结构化且高价值的《主题研究全景综述与 Cheatsheet 备忘单》。

报告结构要求（使用优美的 Markdown 格式）：
# 📁 ${targetFolder.name} · 专题全景研究与工具链指南

## 🌟 一、专题定位与核心价值
（用 2~3 段话总结这个主题的核心痛点、解决的问题与行业现状）

## 🛠️ 二、核心工具与资源全景对比
（按功能子类将这些书签分门别类，列出表格或条目对比，分析每款工具的亮点与适用人群）

## 🚀 三、推荐最佳实践与组合工作流
（如何将这些收藏串联起来发挥 1+1>2 的效率）

## 💡 四、备忘速查 Cheatsheet
（提炼出最核心的 3~5 条要点法则或避坑指南）

请确保语言严谨专业，重点突出，充分利用给定的书签信息。`;

		const { apiKey, baseUrl, model } = resolveLlmConfig(llmConfig);

		if (!apiKey) {
			throw new Error("请先在「设置」中配置 LLM API Key 以生成专题综述");
		}

		const adapter = openaiCompatibleText(model, {
			baseURL: baseUrl,
			apiKey,
		});

		let markdown = "";
		try {
			markdown = await chat({
				adapter,
				systemPrompts: [systemPrompt],
				messages: [
					{
						role: "user",
						content: `请为以下包含 ${targetFolder.items.length} 个条目的书签列表生成专题综述：\n\n${itemsListText}`,
					},
				],
				stream: false,
			});
		} catch (error: unknown) {
			console.error("[generateFolderDossier] TanStack AI chat error:", error);
			const errMsg =
				error instanceof Error
					? error.message
					: "未知错误，请检查 API Key 或网络";
			return {
				folderId: targetFolder.id,
				folderName: targetFolder.name,
				itemCount: targetFolder.items.length,
				dossierMarkdown: `⚠️ **专题综述生成失败**: ${errMsg}\n\n请检查「设置」中的 LLM API Key 与网络连接。`,
				generatedAt: new Date().toLocaleDateString(),
			};
		}

		return {
			folderId: targetFolder.id,
			folderName: targetFolder.name,
			itemCount: targetFolder.items.length,
			dossierMarkdown: markdown || "生成综述失败",
			generatedAt: new Date().toLocaleDateString(),
		};
	});
