import type {
	SearchResultItem,
	WorkbenchSettings,
} from "../../components/workbench/types.ts";
import {
	type EmbeddingConfig,
	EmbeddingService,
} from "../../services/embeddingService.ts";
import { workbenchDb } from "../db/sqlite.ts";

export interface LlmConfigOverrides {
	apiKey?: string;
	baseUrl?: string;
	model?: string;
}

export interface PreparedRagContext {
	systemPrompt: string;
	contextReferences: SearchResultItem[];
	candidateCount: number;
	emptyFallbackMessage?: string;
}

/**
 * Resolve effective LLM config on the server.
 * Priority: caller overrides > settings stored in SQLite > defaults.
 */
export function resolveLlmConfig(overrides: LlmConfigOverrides = {}): {
	apiKey: string;
	baseUrl: string;
	model: string;
} {
	let dbSettings: Partial<WorkbenchSettings> | null = null;
	try {
		const raw = workbenchDb.getSetting("workbench_settings");
		if (raw) dbSettings = JSON.parse(raw) as Partial<WorkbenchSettings>;
	} catch (err) {
		console.warn("[ragContext] Failed to parse settings from SQLite:", err);
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
export function resolveEmbeddingConfig(
	overrides: EmbeddingConfig = {},
): EmbeddingConfig {
	if (overrides.apiKey?.trim()) return overrides;

	let dbSettings: Partial<WorkbenchSettings> | null = null;
	try {
		const raw = workbenchDb.getSetting("workbench_settings");
		if (raw) dbSettings = JSON.parse(raw) as Partial<WorkbenchSettings>;
	} catch (err) {
		console.warn("[ragContext] Failed to parse settings from SQLite:", err);
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
 * Prepare background semantic context and unified system prompt for the Agent
 */
export async function prepareRagAgentContext(params: {
	question: string;
	folderId?: number | null;
	folderName?: string;
	embeddingConfig?: EmbeddingConfig;
}): Promise<PreparedRagContext> {
	const { question, folderId, folderName, embeddingConfig = {} } = params;
	const q = question?.trim();

	// 1. Retrieve Candidate Bookmarks from SQLite
	let candidateItems = workbenchDb.getAllBookmarksForSearch();
	if (folderId != null) {
		candidateItems = candidateItems.filter(
			(item) => item.folderId === folderId,
		);
	}
	if (candidateItems.length === 0) {
		return {
			systemPrompt: "",
			contextReferences: [],
			candidateCount: 0,
			emptyFallbackMessage:
				folderName != null
					? `当前文件夹「${folderName}」中暂无书签数据。`
					: "你的收藏库中目前还没有书签数据，请先通过 Chrome 扩展同步或导入一些书签。",
		};
	}

	// 2. Compute query vector if API Key is configured
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
	const contextReferences = ranked.slice(0, 6);

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

【正文排版与交付结构契约（Markdown Output Contract - 极其重要）】:
页面上方已有专属时间轴展示所有思考与工具调用步骤，因此最终回答正文是呈现给用户的【精炼成果报告 / 知识交付物】，必须遵循以下排版法则：
1. **开门见山，严禁开场白与过程碎碎念**：
   - **正文第一行必须直接就是二级主标题（\`## ...\`）**，严禁以“收到！”、“好的！”、“马上开工！”、“先清点一遍...”等任何寒暄或过程日志开篇；
   - 严禁在正文中像流水账日志一样复述工具调用细节（例如：“清点完成✅”、“已新建文件夹(ID:479)✅”、“物理归拢移入10条✅”、“拆除空壳文件夹✅”等过程报备）；
   - 严禁在正文中出现内部技术噪音（如数据库 ID、内部工具名、匹配参数等）。
2. **层次清晰的文档流结构（严格遵循 Markdown 语法）**：
   - **独立成行的主标题（##）**：开篇直接交付成果或主题（例如 \`## PHP 知识库归集完成\` 或 \`## Rust 入门完整路线\`），**严禁把 \`##\` 接在前文冒号或句末**，标题必须独占一行！
   - **提炼概述**：1~2 句话概述结论或核心定义，重点词汇用 \`**加粗**\` 突出；
   - **分块小标题（###）**：使用独占一行的 H3 配合语义 Emoji 分隔模块（如 \`### 📂 结构治理成果\`、\`### 📦 当前生态资产\`、\`### 💡 后续整理建议\`)；
   - **列表与充足空行留白**：整理的书签、推荐的项目一律使用列表（\`1. \` 或 \`- \`）呈现；**标题、正文段落、列表块之间必须保持空行隔开**，杜绝密不透风的纯文字堆叠，确保通透舒展的阅读呼吸感。

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

	return {
		systemPrompt,
		contextReferences,
		candidateCount: candidateItems.length,
	};
}
