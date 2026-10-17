import { readVaultNote } from "../../../services/obsidian/note.ts";

/** Safe character limit for prompt text injection to avoid context overflow */
export const MAX_PROMPT_DOC_CHARS = 50_000;

/**
 * Build an active-note context block for injection into the system prompt.
 * Reads the actual local Markdown file from the Vault and preserves wikilinks and markdown structure.
 */
export async function resolveActiveNotePrompt(
	activeNotePath: string | undefined | null,
): Promise<string> {
	if (!activeNotePath) return "";

	try {
		const note = await readVaultNote(activeNotePath);
		if (!note || !note.content) {
			return `\n- 【当前活跃笔记】路径 ${activeNotePath} 内容为空或不可读。请明确告知用户：笔记正文为空或读取失败，建议先在左侧重新打开该笔记后再提问。`;
		}

		const isCanvas = /\.canvas$/i.test(activeNotePath);
		const isExcalidraw = /\.excalidraw(\.md)?$/i.test(activeNotePath);

		if (isCanvas) {
			return formatCanvasContext(note.relPath, note.name, note.content);
		}

		if (isExcalidraw) {
			return formatExcalidrawContext(note.relPath, note.name, note.content);
		}

		const wordCount = note.content.length;
		let preview = note.content.trim() || "(空笔记/暂无内容)";
		let notice = "";
		if (preview.length > MAX_PROMPT_DOC_CHARS) {
			preview = preview.slice(0, MAX_PROMPT_DOC_CHARS);
			notice = `\n\n…（笔记正文共 ${wordCount} 字，已截取前 ${MAX_PROMPT_DOC_CHARS} 字放入上下文，以保障大模型问答性能）`;
		}

		return `\n- 【当前正在查看/编辑的活跃 Obsidian 笔记（用户当前屏幕聚焦，最高优先级）】:
  - 文件相对路径: ${note.relPath}
  - 笔记标题: 《${note.name}》
  - 当前字数: ${wordCount} 字
  - 完整正文（包含 Wiki 双链 [[...]]、Markdown 结构、代码块、图片等）:
"""
${preview}${notice}
"""
  💡 提示：用户的提问默认针对此篇笔记展开，请充分结合上述笔记正文进行回答、总结、润色或提取要点；若用户希望将本笔记内容提炼并绘制为思维导图或架构图白板，请单步调用 draft_canvas 工具一次性完成节点连线组织并交付草稿卡片。
  ⚠️ 核心协同底线：当用户的意图是针对当前这篇笔记进行【全文二创洗稿、改写重构、全文润色、结构重排或语言风格调整】时：
  1. 绝对严禁在聊天消息中直接倾倒输出修改后的正文全文！
  2. 你必须调用 trigger_paragraph_rewrite 工具启动双栏比对改写流水线，将提炼后的改写要求传入 instruction，驱动左侧笔记自动开启双栏比对并在右栏流式生成；
  3. 聊天消息中只允许输出简要的篇章诊断、改写策略与亮点说明。`;
	} catch (err) {
		console.warn("[resolveActiveNotePrompt] failed to read vault note:", err);
		return `\n- 【当前活跃笔记读取异常】路径 ${activeNotePath} 读取失败（${err instanceof Error ? err.message : String(err)}）。请明确告知用户笔记读取失败及原因，建议重新打开笔记后重试，不要凭空编造笔记内容。`;
	}
}

/**
 * Format an Obsidian Canvas file into semantic JSON for LLM context.
 */
export function formatCanvasContext(
	relPath: string,
	name: string,
	content: string,
): string {
	try {
		const raw = JSON.parse(content || "{}");
		const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
		const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];

		// Extract semantic fields for nodes, eliminating unnecessary rendering coordinate noise
		const nodes = rawNodes.map((n: any) => {
			const item: Record<string, any> = { id: n.id, type: n.type };
			if (n.text) item.text = n.text;
			if (n.label) item.label = n.label;
			if (n.file) item.file = n.file;
			if (n.url) item.url = n.url;
			if (n.color) item.color = n.color;
			return item;
		});

		// Extract semantic fields for edges
		const edges = rawEdges.map((e: any) => {
			const item: Record<string, any> = {
				id: e.id,
				from: e.fromNode,
				to: e.toNode,
			};
			if (e.label) item.label = e.label;
			if (e.fromSide) item.fromSide = e.fromSide;
			if (e.toSide) item.toSide = e.toSide;
			return item;
		});

		let jsonStr = JSON.stringify({ nodes, edges }, null, 2);
		let notice = "";
		if (jsonStr.length > MAX_PROMPT_DOC_CHARS) {
			jsonStr = jsonStr.slice(0, MAX_PROMPT_DOC_CHARS);
			notice = `\n…（画板数据量较大，已截取前 ${MAX_PROMPT_DOC_CHARS} 字符展示）`;
		}

		return `\n- 【当前正在查看/编辑的活跃 Obsidian Canvas 白板（用户当前屏幕聚焦，最高优先级）】:
  - 文件相对路径: ${relPath}
  - 白板名称: 《${name}》
  - 统计: 共 ${nodes.length} 个节点卡片，${edges.length} 条连线
  - 原生结构化 JSON 数据:
\`\`\`json
${jsonStr}${notice}
\`\`\`
  💡 提示：用户的提问默认针对此白板展开。上述为画板的完整结构化 JSON 数据（节点卡片内容、关联文件与连线关系），请充分基于此数据进行架构分析、逻辑总结或流程推导！工具路由：新增节点/连线调用 canvas_create_elements；修改卡片调用 canvas_update_node；分组调用 canvas_create_group；规整消除重叠或切换布局调用 canvas_tidy_layout。`;
	} catch {
		return `\n- 【当前活跃文件为 Obsidian Canvas 白板】: ${relPath} (白板结构读取异常)`;
	}
}

/**
 * Robust JSON extraction from raw content or Markdown code block
 */
function parseExcalidrawRaw(content: string): Record<string, unknown> | null {
	const trimmed = content.trim();
	if (!trimmed) return null;
	try {
		return JSON.parse(trimmed);
	} catch {
		// Try matching ```json ... ``` in obsidian excalidraw markdown
		const jsonMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/i);
		if (jsonMatch) {
			try {
				return JSON.parse(jsonMatch[1]);
			} catch {}
		}
		return null;
	}
}

/**
 * Format an Excalidraw scene into semantic JSON for LLM context.
 */
export function formatExcalidrawContext(
	relPath: string,
	name: string,
	content: string,
): string {
	try {
		const raw = parseExcalidrawRaw(content || "{}");
		if (!raw) {
			return `\n- 【当前活跃文件为 Excalidraw 画板】: ${relPath} (画板结构解析失败)`;
		}

		// biome-ignore lint/suspicious/noExplicitAny: excalidraw loose elements
		const rawElements: any[] = Array.isArray(raw.elements)
			? raw.elements.filter((el: any) => !el.isDeleted)
			: [];

		// Index text elements by their containerId
		const textByContainerId = new Map<string, string>();
		for (const el of rawElements) {
			if (el.type === "text" && el.text) {
				if (el.containerId) {
					textByContainerId.set(el.containerId, el.text);
				}
			}
		}

		// Filter and clean semantic elements (strip bezier points, seed, versionNonce noise)
		const elements = rawElements.map((el) => {
			const boundText = textByContainerId.get(el.id);
			const label = el.text || el.label?.text || boundText || "";
			const item: Record<string, any> = {
				id: el.id,
				type: el.type,
			};
			if (label) item.text = label;
			if (el.type === "arrow" || el.type === "line") {
				const startId = el.startBinding?.elementId || el.start?.id;
				const endId = el.endBinding?.elementId || el.end?.id;
				if (startId) item.from = startId;
				if (endId) item.to = endId;
			}
			if (el.backgroundColor && el.backgroundColor !== "transparent") {
				item.backgroundColor = el.backgroundColor;
			}
			if (el.strokeColor && el.strokeColor !== "#000000" && el.strokeColor !== "#1e1e1e") {
				item.strokeColor = el.strokeColor;
			}
			return item;
		});

		let jsonStr = JSON.stringify({ elements }, null, 2);
		let notice = "";
		if (jsonStr.length > MAX_PROMPT_DOC_CHARS) {
			jsonStr = jsonStr.slice(0, MAX_PROMPT_DOC_CHARS);
			notice = `\n…（白板元素较多，已截取前 ${MAX_PROMPT_DOC_CHARS} 字符展示）`;
		}

		return `\n- 【当前正在查看/编辑的活跃 Excalidraw 手绘画板（用户当前屏幕聚焦，最高优先级）】:
  - 文件相对路径: ${relPath}
  - 画板名称: 《${name}》
  - 统计: 共 ${elements.length} 个元素（含卡片图形、文本与关系箭头）
  - 原生结构化 JSON 数据:
\`\`\`json
${jsonStr}${notice}
\`\`\`
  💡 提示：上述为手绘画板的语义 JSON 数据。你可以直接基于其中的图形类型、文本含义与连线流向进行架构解读、流程总结或系统分析！工具路由：绘制图形/架构图调用 excalidraw_draw_elements；修改元素调用 excalidraw_update_element；清空画板调用 excalidraw_clear_canvas。`;
	} catch {
		return `\n- 【当前活跃文件为 Excalidraw 画板】: ${relPath} (画板结构读取异常)`;
	}
}
