import { chat } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { createServerFn } from "@tanstack/react-start";
import type { SearchResultItem } from "../../components/workbench/types";
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

/**
 * Server Function: Chat with bookmarks using TanStack AI Native chat() + toolDefinition Pipeline
 */
export const chatWithBookmarks = createServerFn({ method: "POST" })
	.validator(
		(data: {
			question: string;
			history?: ChatMessage[];
			embeddingConfig?: EmbeddingConfig;
			llmConfig?: {
				apiKey?: string;
				baseUrl?: string;
				model?: string;
			};
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

		// 2. Compute query vector if API Key is configured
		let queryVector: number[] | null = null;
		if (embeddingConfig.apiKey) {
			queryVector = await EmbeddingService.generateQueryEmbedding(
				q,
				embeddingConfig,
			);
		}

		// 3. Top-K Hybrid Ranking for semantic context
		// 3. Top-K Hybrid Ranking for semantic background context
		const ranked = EmbeddingService.rankItems(
			candidateItems,
			q,
			queryVector,
			"hybrid",
		);
		// Keep as internal context for LLM background knowledge
		const contextReferences = ranked.slice(0, 6);
		// User-facing references: default empty, only populated when tools (e.g. query_bookmarks) explicitly find items
		let references: SearchResultItem[] = [];

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

		const systemPrompt = `你是一个内置于用户个人 AI 工作台（AI Workstation）的高级智能管家与私人知识外脑。
你的任务是基于用户本地 SQLite 收藏库中的书签、工具、文章与素材，回答用户问题、提供深度洞察，并根据用户指令主动执行本地数据库的管理操作（如创建文件夹、整理移动书签）。

【当前系统环境】:
- 当前日期: ${dateStr} (${dayOfWeek})
- 当前时间: ${timeStr}${folderScopePrompt}

【重要能力与执行规范】:
1. 【精准查询】：当用户询问涉及【时间范围】（例如：“我今天/本周/上周/本月/最近7天收藏了哪些网站”、“昨天添加了什么”）、【特定分类/文件夹汇总】（例如：“自媒体分类下有哪些”、“看下设计工具文件夹”）或【全量统计盘点】时，主动调用 \`query_bookmarks\` 工具从 SQLite 获取最新数据。
2. 【具体工具定位与解答】：当用户询问某个具体工具/网站“在哪里”、“属于哪个分类/文件夹”或“网址是什么”时，若下方【参考来源】中已经命中了该工具，**直接根据参考来源作答**（明确说明其所在的文件夹名称、网址与用途），无需重复发起数据库查询。
3. 【创建文件夹】：当用户明确要求新建文件夹时，调用 \`create_folder\` 工具。
4. 【归类整理 vs 任务复用书签】：调用 \`move_bookmarks_to_folder\` 工具。注意区分 mode 参数：
   - 当用户意图是【规整/归类/整理/清理】（例如“把未分类整理到自媒体”、“把这批书签移过去”）时，mode 设为 "move"（默认值，从原位置剪切移入）；
   - 当用户意图是【组装任务/挑选工具/复用到项目/复制到文件夹】（例如“推荐一些自媒体工具放到陈王百口文件夹”、“把常用剪辑工具也放到这个新文件夹里”）时，mode 设为 "link"（保留原归属，仅向新文件夹建立多对多关联引用）；支持配合 tags 参数（例如 tags: ["自媒体"]）批量按标签挑选工具。
5. 【更新文件夹】：当用户要求修改文件夹名称、分类或描述时，调用 \`update_folder\` 工具。
6. 【移动文件夹与开启工作】：当用户要求把文件夹移入另一个文件夹（建立子分组）、移回顶层，或者要求将文件夹拿到/移入「工作台」开启专注工作（例如：“把chrome插件移到工作台开始工作”、“把项目放到工作台”、“开启自媒体工作”）时，调用 \`move_folder\` 工具（传入 folderName 以及 targetCategory: "工作台" 或目标分类名）。
7. 【文件夹排序】：当用户要求调整文件夹排列顺序（如"把最常用的放前面"、"按内容数量排"、"按名称排序"）时，调用 \`reorder_folders\` 工具。
8. 【移出书签】：当用户要求把某些书签从文件夹中移出（回到未分类）、或清空某个文件夹时，调用 \`remove_bookmarks_from_folder\` 工具。
9. 【删除文件夹】：当用户明确要求删除文件夹时，调用 \`delete_folder\` 工具。默认书签会移回未分类、子文件夹提升到顶层；仅当用户明确说"连同内容一起删除"时才设置 deleteBookmarks=true。
10. 【工具调用参数规范（非常关键）】：
   - 工具参数必须是严格符合 RFC 8259 规范的标准合法 JSON 对象。
   - 所有键与字符串值必须严格使用英文双引号闭合（例如：{"keyword": "视频"}，绝对禁止写成未加引号的裸字如 {"keyword": 视频}）。
   - **只传递需要生效的参数**。对于不需要过滤的条件，请直接在 JSON 中彻底省略该字段，不要传递 null 或空键。
   - 一次用户意图只需精准调用一次工具，避免同时并发多个相似查询。
11. 【严禁自言自语/思考过程外泄】：
   - 严禁向用户输出内部反思或工具调用意图（如“我需要用 folderName 参数查询”、“正在为您检索”等）。
   - 请静默发起工具调用，获取结果后直接呈现专业、结构清晰的 Markdown 回答。

以下是从本地知识库语义检索到的背景记忆片段（仅供你在思考和回答时参考；若用户提问是宏观规划、分类结构调整、管理操作或日常对话，请忽略与主题无关的条目，切勿强行生搬硬套）：
${contextSnippets}`;

		// 6. Setup Provider Config
		const apiKey =
			llmConfig.apiKey ||
			process.env.DEEPSEEK_API_KEY ||
			process.env.VITE_DEEPSEEK_API_KEY ||
			"";
		const baseUrl = (
			llmConfig.baseUrl ||
			process.env.DEEPSEEK_BASE_URL ||
			process.env.VITE_DEEPSEEK_BASE_URL ||
			"https://api.deepseek.com"
		).replace(/\/+$/, "");
		const model =
			llmConfig.model ||
			process.env.DEEPSEEK_MODEL ||
			process.env.VITE_DEEPSEEK_MODEL ||
			"deepseek-chat";

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
		(data: {
			folderId: number;
			llmConfig?: {
				apiKey?: string;
				baseUrl?: string;
				model?: string;
			};
		}) => data,
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

		const apiKey =
			llmConfig.apiKey ||
			process.env.DEEPSEEK_API_KEY ||
			process.env.VITE_DEEPSEEK_API_KEY ||
			"";
		const baseUrl = (
			llmConfig.baseUrl ||
			process.env.DEEPSEEK_BASE_URL ||
			process.env.VITE_DEEPSEEK_BASE_URL ||
			"https://api.deepseek.com"
		).replace(/\/+$/, "");
		const model =
			llmConfig.model ||
			process.env.DEEPSEEK_MODEL ||
			process.env.VITE_DEEPSEEK_MODEL ||
			"deepseek-chat";

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
