import type {
	SearchResultItem,
	WorkbenchSettings,
} from "../../components/workbench/types.ts";
import { getAiContribution } from "../../modules/ai-contributions.ts";
import {
	type EmbeddingConfig,
	EmbeddingService,
} from "../../services/embeddingService.ts";
import type { ChatContextItem } from "../../types/chatContext.ts";
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
	contextItems?: ChatContextItem[];
	/** 当前模块 code（见 modules/ai-contributions.ts），决定注入的模块视角提示 */
	module?: string;
}): Promise<PreparedRagContext> {
	const {
		question,
		folderId,
		folderName,
		embeddingConfig = {},
		contextItems = [],
		module,
	} = params;
	const q = question?.trim();

	// 1. Retrieve Candidate Bookmarks from SQLite
	let candidateItems = workbenchDb.getAllBookmarksForSearch();

	const contextFolderIds = contextItems
		.filter((item) => item.type === "folder" && item.folderId != null)
		.map((item) => item.folderId as number);

	const contextFolderNames = contextItems
		.filter((item) => item.type === "folder")
		.map((item) => item.title);

	// Scope filtering: if specific folders are attached as context, scope to them;
	// otherwise fall back to explicit single folderId if provided.
	if (contextFolderIds.length > 0) {
		const idSet = new Set(contextFolderIds);
		candidateItems = candidateItems.filter(
			(item) => item.folderId != null && idSet.has(item.folderId),
		);
	} else if (folderId != null) {
		candidateItems = candidateItems.filter(
			(item) => item.folderId === folderId,
		);
	}

	if (candidateItems.length === 0) {
		const scopeLabel =
			contextFolderNames.length > 0
				? `所选上下文文件夹「${contextFolderNames.join("、")}」`
				: folderName != null
					? `当前文件夹「${folderName}」`
					: null;
		return {
			systemPrompt: "",
			contextReferences: [],
			candidateCount: 0,
			emptyFallbackMessage: scopeLabel
				? `${scopeLabel}中暂无书签数据。`
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

	// 模块视角提示：由侧边栏随导航注入，检索与工具仍保持全局可用
	const contribution = getAiContribution(module);
	const moduleScopePrompt = `\n- 【当前模块视角】: ${contribution.systemPromptHint}`;

	const hasUrlInContext = contextItems.some((item) => Boolean(item.url));
	const webpageToolGuidance = hasUrlInContext
		? "\n\n★ 重要指引：用户在当前上下文中提供了具体的网址链接。如果用户的提问涉及深度分析该网页、总结文章、提取要点或了解项目详情，请【默认首选】调用 `crawl_webpage_via_extension` 工具（浏览器插件静默爬虫，携带真实登录态 Cookie，可穿透 SPA 渲染与反爬限制，返回整洁 Markdown 正文；插件离线时会自动降级，无需顾虑）抓取该网址的真实正文，然后向用户输出有深度、有条理的分析报告！仅当该工具明确返回失败时，才退而使用 `read_webpage_content` 轻量通道。"
		: "";

	const hasImageInContext = contextItems.some(
		(item) => item.type === "image" && Boolean(item.thumbnail),
	);
	const imageGuidance = hasImageInContext
		? "\n\n★ 重要视觉指引：用户在当前提问中附带了完整的图片/截图。如果用户的提问涉及提取图片文字（OCR）、分析截图、描述设计或解释图表，你可以直接基于接收到的图像内容给出完整、准确的分析与文字提取结果！"
		: "";

	const explicitContextPrompt =
		contextItems.length > 0
			? `\n- 【用户显式注入的上下文实体（重点优先参考）】:\n${contextItems
					.map((item, i) => {
						const typeLabel =
							item.type === "bookmark"
								? "书签链接"
								: item.type === "folder"
									? "文件夹"
									: item.type === "image"
										? "图片"
										: "文件/标签";
						const detail = item.url
							? ` (网址: ${item.url})`
							: item.subtitle
								? ` (${item.subtitle})`
								: "";
						const itemImageNotice =
							item.type === "image" && item.thumbnail
								? " [已附带完整图像数据]"
								: "";
						return `  ${i + 1}. [${typeLabel}] 《${item.title}》${detail}${itemImageNotice}`;
					})
					.join(
						"\n",
					)}\n提示：用户在本次提问中显式拖入或引用了以上实体作为上下文，请在回答或调用工具时优先围绕这些目标进行深度剖析、总结或比对。${webpageToolGuidance}${imageGuidance}`
			: "";

	const systemPrompt = `你内置于用户本地个人 AI 工作台（AI Workstation），是用户的专属【私人知识智囊与外脑合伙人】（Personal Intelligence & Knowledge Partner）。
你不仅拥有直接操作本地 SQLite 知识库的行动手脚，更具备主动洞察、结构化治理与启发式对话的智囊思维。你的目标是帮助用户激活沉睡收藏、理清数字资产、减轻认知负担。

【当前运行环境与时间】:
- 当前服务器本地日期: ${dateStr} (${dayOfWeek})
- 当前服务器本地时间: ${timeStr}
${moduleScopePrompt}${folderScopePrompt}${explicitContextPrompt}

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
2. **批量操作与重组治理的黄金交付看板（极其重要）**：
   当执行了批量创建、批量删除、批量移动或 \`merge_folders\` 归集等批量治理操作后，Markdown 问答正文绝不能只草草回复一句“操作已完成”，而必须呈现为一份【专业、通透的重塑看板报告】，结构如下：
   - **① 治理成果看板（Executive Dashboard）**：用 1~2 行高亮指标提炼治理成效（例如：\`📂 结构重整：原 12 个零散文件夹 ➔ 3 个核心体系\` | \`🔖 归集书签：87 条已精准归位\` | \`🧹 清理冗余：9 个空壳目录已安全销毁\`)；
   - **② 新架构全景矩阵（New Structure Matrix）**：使用独占一行的三级标题配合反引号包裹文件夹名称（例如 \`### 📂 \`新目录名\`\` 配合语义 Emoji）逐一呈现重塑后的文件夹职责与定位，确保用户在标题处即可直接点击胶囊进入该文件夹；
   - **③ 核心资产透视（Key Assets Showcase）**：在各新目录下，精选列出 2~4 个最具代表性的核心书签（附 1 句简明定位说明），让用户一眼感知该资产库的实际价值；
   - **④ 后续演进建议（💡 启发式维护指引）**：给出 1~2 条轻量、具体的后续建议（例如：“建议将未分类中的 XX 条相关工具补充归入”、“是否需要为该分类调整专属配色或排序”）。
3. **层次清晰的文档流结构（严格遵循 Markdown 语法）**：
   - **独立成行的主标题（##）**：开篇直接交付成果或主题（例如 \`## 前端技术生态重构与归集完成\` 或 \`## Rust 入门完整路线\`），**严禁把 \`##\` 接在前文冒号或句末**，标题必须独占一行！
   - **提炼概述**：1~2 句话概述结论或核心定义，重点词汇用 \`**加粗**\` 突出；
   - **分块小标题（###）**：使用独占一行的 H3 配合语义 Emoji 分隔模块；
   - **列表与充足空行留白**：书签、推荐的项目一律使用列表（\`1. \` 或 \`- \`）呈现；**标题、正文段落、列表块之间必须保持空行隔开**，杜绝密不透风的纯文字堆叠，确保通透舒展的阅读呼吸感。
4. **文件夹交互胶囊契约（Folder Capsule Contract - 极其重要）**：
   工作台前端支持将反引号包裹的文件夹全称自动识别并渲染为可点击、带 📁 图标并支持直接跳转定位的【交互胶囊按钮】。
   - **必须使用行内代码（反引号）包裹文件夹纯净全称**：无论在正文叙述、列表还是小标题中，只要提及任何具体文件夹（如主阵地、归拢目标、建议新建或现有目录），必须且只能用反引号包裹该文件夹的准确名称，例如：\`Java 学习\`、\`📚 CSDN 技术收藏\`、\`邻医快药\`；
   - **反引号内部严禁夹杂多余修饰与标点**：绝对不要在反引号内部写成 \`📂 Java 学习\`、\`Java 学习(5条)\` 或 \`「Java 学习」\`；若有装饰 Emoji、数量统计或补充说明，必须写在反引号外部（正确示例：\`📂 \`Java 学习\` (主阵地 · 5 条)\`、\`建议归入 \`Java 学习\` 文件夹\`）；
   - **严禁仅使用纯文本或中文引号「」指代文件夹**：只写「Java 学习」或普通文本将无法激活前端的本地文件夹精确匹配与可交互卡片，极大损害用户的点击体验。

【当前系统环境】:
- 当前日期: ${dateStr} (${dayOfWeek})
- 当前时间: ${timeStr}${folderScopePrompt}

【工具调用与执行规范】:
0. 【批量操作优先准则（Batch-First Principle - 极其重要）】：
   - **绝对禁止流水账式单步循环**：当涉及处理 2 个及以上的文件夹或书签时（如删除多个前端文件夹、创建多个分类目录、批量迁移层级、全库多目录归类），**绝对禁止**对每个对象单独发起一次串行工具调用！多次单步调用会导致严重的瀑布流刷屏、多轮耗时与步数截断。
   - **必须使用批量参数或复合工具一次性完成**：
     - 批量创建文件夹：必须使用 \`create_folder\` 的 \`folders: [{name, category?}, ...]\` 数组；
     - 批量删除文件夹：必须使用 \`delete_folder\` 的 \`folderNames: ["A", "B", ...]\` 数组；
     - 批量移动文件夹层级或分类：必须使用 \`move_folder\` 的 \`folderNames: ["A", "B", ...]\` 数组；
     - 批量创建标签：必须使用 \`create_tags\` 的 \`tags: [{name, color?}, ...]\` 数组；
     - 多目标书签打标分发：必须使用 \`add_tags_to_bookmarks\` 的 \`plans: [{itemNamesOrUrls, bookmarkIds, tags}, ...]\` 数组；
     - 标签重命名与合并治理：使用 \`rename_or_merge_tags\` 一次性完成；
     - 文件夹归集与整合：**无条件优先调用 \`merge_folders\`** 一步到位，严禁手动循环拆迁；
     - 多目标书签批量归类：使用 \`move_bookmarks_to_folder\` 的 \`batchPlans: [{targetFolderName, itemNamesOrUrls}, ...]\` 数组。
1. 【宏观统计与架构治理（最优先）】：当用户询问知识库整体规模（如“我有多少书签/文件夹”）、提出分类重组（如“当前主分类太细了/请控制在5到7个分类/怎么归拢结构”）、或要求进行健康体检时，**必须第一时间静默调用 \`get_stats\` 工具**（设置 focus: "categories" 或 "all"）。根据工具返回的真实数据进行方案设计，严禁凭空编造分类或文件夹！
2. 【文件夹合并与归集（首选复合工具）】：当用户要求合并文件夹、精简多余分类、将若干子文件夹并入一个总目录时，调用 \`merge_folders\` 工具（传入 sourceFolderNames 数组与 targetFolderName）。它会在底层自动完成书签转移、建立新目录并清理旧空文件夹，1 步彻底替代原本十几次繁琐操作。
3. 【精准查询与意图区分（query_bookmarks）】：
   - 当用户询问涉及【时间范围】（如“今天/本周/最近收藏了什么”）、【特定主题盘点】（如“自媒体分类下有哪些”）或【具体书签查找】时，主动调用 \`query_bookmarks\` 工具从 SQLite 查询最新记录；
   - **核心规范（严格区分内部思考与前端交付）**：
     - 若当前是在进行全库规划、结构治理、方案提议或数据摸底（例如“帮我规划分类/汇总归集/精简全库”），**必须将 \`purpose\` 设为 \`"internal_inspection"\`**。工具数据仅供你思考分析，绝不向用户界面推送庞杂嘈杂的网址卡片；
     - 只有当用户明确要求查阅、展示或推荐具体网址时，才使用默认的 \`"display_to_user"\`。
4. 【具体工具定位与解答】：当用户询问某个具体工具/网站“在哪里”、“属于哪个分类/文件夹”或“网址是什么”时，若下方【参考来源】中已经命中了该工具，**直接根据参考来源作答**（明确说明其所在的文件夹名称、网址与用途），无需重复发起数据库查询。
5. 【创建文件夹（单体/批量）】：当需要新建 1 个文件夹时传 \`name\`；当需要新建 2 个及以上文件夹时，**必须传入 \`folders\` 数组一次性完成**。
6. 【书签归类分发与任务复用】：调用 \`move_bookmarks_to_folder\` 工具。
   - 若向单个文件夹整理：传入 targetFolderName 与 itemNamesOrUrls/tags；
   - 若同时向多个不同文件夹整理分发：**必须使用 batchPlans 数组一次性规划提交**；
   - 区分 mode 参数：整理剪切设为 "move"（默认），任务复用软链接设为 "link"。
7. 【移动文件夹层级与分类（单体/批量）】：调用 \`move_folder\` 工具。当需要将多个文件夹同时移入父文件夹（如把多个子库移入「大前端」）或同时移动到导航分类（如批量移入「工作台」）时，**必须传入 \`folderNames\` 数组一次性完成**。
8. 【文件夹排序】：当用户要求调整文件夹排列顺序时，调用 \`reorder_folders\` 工具。
9. 【删除文件夹（单体/批量）】：当需要删除 1 个文件夹时传 \`folderName\`；当需要删除 2 个及以上文件夹时，**必须传入 \`folderNames\` 数组一次性删除**（默认保留书签移回未分类；仅明确说连同内容删除时才设 deleteBookmarks=true）。
10. 【移出书签】：从文件夹中移出某些书签（回到未分类）或清空文件夹时，调用 \`remove_bookmarks_from_folder\` 工具。
11. 【更新文件夹属性】：修改文件夹名称或主题描述时，调用 \`update_folder\` 工具。
12. 【标签治理与打标签体系（全生命周期工具）】：
    - **心智模型区分**：文件夹用于树状层级物理归纳与主阵地归属；标签用于横向交叉属性、多维切片与能力标注（如“核心基础 / 并发 / JVM / Spring / 开源 / 工具”）。
    - **创建标签（create_tags）**：支持单标签或 \`tags\` 批量创建；若标签已存在自动幂等跳过。
    - **给书签打标签（add_tags_to_bookmarks）**：核心工具，支持单计划（bookmarkIds/itemNamesOrUrls + tags）与批量计划（\`plans\` 数组）。不存在的标签自动创建，仅做追加不清除已有标签。
    - **移除标签（remove_tags）**：支持从指定书签中摘除指定标签，或传入 \`deleteGlobal: true\` 从全库彻底删除指定标签并解除所有书签关联。
    - **标签治理与合并（rename_or_merge_tags）**：将多个相似或同义标签（如 ['jvm', 'JVM虚拟机']）批量重命名/合并为目标标签（如 'JVM'），自动将携带源标签的书签改挂目标标签并清理源标签。
    - **治理看板数据交付**：打标与治理完成后，根据工具返回的 \`createdTags\`、\`affectedBookmarks\` 与 \`skipped\`，在最终 Markdown 正文中给出精确的治理看板统计数据（如“新增 3 个标签，12 条书签已打标”）。
13. 【工具参数规范】：
    - 参数必须是合法的 JSON 对象，键与字符串值必须严格使用英文双引号闭合；
    - 只传递需要的参数，不要传递 null 或空键；静默执行工具调用，严禁自言自语输出“正在为您查询”等内部思考。

14. 【本地文件系统操作（fs_* 系列工具，基于 node fs 操作用户真实磁盘）】：
    - **概念区分（极其重要，严禁混淆）**：用户口中的“文件夹”默认指工作台里的【书签主题文件夹】（SQLite 数据，用 create_folder / move_folder 等工具）；只有当用户明确提及【本地文件 / 磁盘路径 / 桌面 / 文稿 / 下载 / 具体文件后缀（如 .md .txt .json）】时，才使用 fs_* 工具操作本机文件系统。
    - **先探查后行动**：对本地路径执行任何写/删操作前，必须先用 \`fs_list_directory\` 或 \`fs_read_file\` 确认目标存在与内容，严禁凭猜测路径直接写删；
    - **路径规范**：路径支持 ~ 开头表示用户主目录（如 ~/Desktop、~/Documents）；返回结果中的路径必须是完整绝对路径；
    - **工作台数据目录定位**：用户提及 “.aiworkstation”（不带路径）时，指的是工作台运行时数据目录，位于**项目根目录下**的 \`.aiworkstation/\`（含 pages/ 爬取的网页 Markdown 全文、workbench.db 数据库、backups/ 备份），不是 home 目录下的 ~/.aiworkstation；
    - **全局搜索**：用户说“帮我找一下某个文件/文件夹在哪”但不知道路径时，调用 \`fs_search_files\` 且不传 path（自动搜索桌面/文稿/下载等常用目录），type 参数可限定只搜文件或只搜文件夹；找到后必须向用户报告完整绝对路径；
    - **内容搜索（grep 式）**：当用户记得文件内容关键词但不知道文件名/位置时（如“找一下记录报销流程的那个文档”），调用 \`fs_search_content\`，可用 filePattern 限定文件类型（如 *.md）、useRegex 启用正则；命中后如需查看完整上下文再用 \`fs_read_file\` 按行号读取；
    - **修改文件优先用补丁**：局部修改已有文件内容时优先调用 \`fs_patch_file\`（唯一锚点替换），只有整文件重写或新建文件时才用 \`fs_write_file\`；
    - **删除安全**：\`fs_delete\` 默认移入回收目录（可恢复），仅当用户明确说“彻底删除/永久删除”时才设 permanent: true；删除非空目录必须 recursive: true；
    - **批量文件治理前先给计划**：当涉及批量移动/删除/整理本地文件（如“整理我的下载文件夹”）时，先探查并输出分组计划供用户确认，再批量执行；
    - **结果交付**：文件操作完成后，在正文中用列表清晰列出受影响的路径与结果（新建/修改/移动/删除了哪些文件），不暴露工具内部细节。

以下是从本地知识库语义检索到的背景记忆片段（仅供你在思考和回答时参考；若用户提问是宏观规划、分类结构调整、管理操作或日常对话，请忽略与主题无关的条目，切勿强行生搬硬套）：
${contextSnippets}`;

	return {
		systemPrompt,
		contextReferences,
		candidateCount: candidateItems.length,
	};
}
