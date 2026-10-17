import {
	type ChatContextItem,
	MAX_CHAT_ATTACHMENTS,
} from "../../../../types/chatContext.ts";
import { workbenchDb } from "../../../db/sqlite.ts";
import { readVaultNote } from "../../../services/obsidian/note.ts";
import { loadSkillContextBundle } from "../../../services/skills/index.ts";
import {
	formatCanvasContext,
	formatExcalidrawContext,
	MAX_PROMPT_DOC_CHARS,
} from "./activeNote.ts";

// ---------- Type labels ----------

const TYPE_LABELS: Record<string, string> = {
	bookmark: "书签链接",
	folder: "文件夹",
	note: "Obsidian 笔记",
	document: "创作文档",
	file: "上传附件/文档",
	material: "素材",
	image: "图片",
	skill: "技能规范(Skill)",
};

function getTypeLabel(type: string): string {
	return TYPE_LABELS[type] ?? "文件/标签";
}

// ---------- Guidance fragments ----------

function buildWebpageGuidance(contextItems: ChatContextItem[]): string {
	const hasUrl = contextItems.some((item) => Boolean(item.url));
	if (!hasUrl) return "";
	return "\n\n★ 重要指引：用户在当前上下文中提供了具体的网址链接。如果用户的提问涉及深度分析该网页、总结文章、提取要点或了解项目详情，请【默认首选】调用 `crawl_webpage_via_extension` 工具（浏览器插件静默爬虫，携带真实登录态 Cookie，可穿透 SPA 渲染与反爬限制，返回整洁 Markdown 正文；插件离线时会自动降级，无需顾虑）抓取该网址的真实正文，然后向用户输出有深度、有条理的分析报告！仅当该工具明确返回失败时，才退而使用 `read_webpage_content` 轻量通道。";
}

/** 上传文档附件与附加上下文笔记的正文注入（保留 MD 原生格式或画板结构化 JSON） */
async function buildUploadedDocsPrompt(
	contextItems: ChatContextItem[],
	activeNotePath?: string | null,
): Promise<string> {
	const blocks: string[] = [];
	for (const item of contextItems) {
		if (item.type === "file" || item.type === "document") {
			let preview = item.data?.contentPreview;
			if (
				(!preview || typeof preview !== "string") &&
				item.type === "document" &&
				item.documentId != null
			) {
				const doc = workbenchDb.getDocument(item.documentId);
				if (doc) {
					preview = doc.contentText || "";
				}
			}
			if (typeof preview === "string" && preview.length > 0) {
				const label = item.type === "document" ? "创作文档" : "附件/文档";
				blocks.push(`### ${label}：《${item.title}》\n"""\n${preview}\n"""`);
			}
		} else if (item.type === "note" && item.notePath) {
			// Avoid duplicating the primary active note if already injected via resolveActiveNotePrompt
			if (activeNotePath && item.notePath === activeNotePath) continue;

			try {
				const note = await readVaultNote(item.notePath);
				if (note && note.content) {
					if (/\.canvas$/i.test(item.notePath)) {
						blocks.push(
							formatCanvasContext(note.relPath, note.name, note.content),
						);
					} else if (/\.excalidraw(\.md)?$/i.test(item.notePath)) {
						blocks.push(
							formatExcalidrawContext(note.relPath, note.name, note.content),
						);
					} else {
						let preview = note.content.trim() || "(空笔记)";
						let notice = "";
						if (preview.length > MAX_PROMPT_DOC_CHARS) {
							preview = preview.slice(0, MAX_PROMPT_DOC_CHARS);
							notice = `\n…（笔记字数较多，已截取前 ${MAX_PROMPT_DOC_CHARS} 字展示）`;
						}
						blocks.push(
							`### 附加上下文笔记：《${note.name}》(${note.relPath})\n完整正文：\n"""\n${preview}${notice}\n"""`,
						);
					}
				}
			} catch (err) {
				console.warn(
					"[buildUploadedDocsPrompt] Failed to read attached note:",
					err,
				);
			}
		}
	}
	if (blocks.length === 0) return "";
	return `\n- 【用户上传/注入的文件、文档与画板正文（已提取完整正文/语义结构，直接基于其分析回答即可，无需调用读取工具）】:\n${blocks.join("\n\n")}`;
}

function buildVisualMediaGuidance(contextItems: ChatContextItem[]): string {
	const hasImage = contextItems.some(
		(item) => item.type === "image" && Boolean(item.thumbnail),
	);
	const hasVideo = contextItems.some(
		(item) =>
			(item.type === "material" && item.data?.materialKind === "video") ||
			(item.type === "file" &&
				item.title &&
				/\.(mp4|mov|webm|mkv|m4v|flv|avi)$/i.test(item.title)),
	);
	const hasBoard = contextItems.some(
		(item) =>
			(item.notePath && /\.(canvas|excalidraw(\.md)?)$/i.test(item.notePath)) ||
			(item.title && /\.(canvas|excalidraw(\.md)?)$/i.test(item.title)),
	);

	const parts: string[] = [];
	if (hasImage) {
		parts.push(
			"★ 重要图像视觉指引：用户在当前提问中附带了完整的图片/截图。如果提问涉及提取图片文字（OCR）、分析截图、描述设计或解释图表，你可以直接基于接收到的图像内容给出完整、准确的分析与文字提取结果！",
		);
	}
	if (hasVideo) {
		parts.push(
			"★ 视频视觉与多模态指引：用户在当前提问中附带了视频素材。系统已自动提取该视频的关键帧/首帧画面传给多模态大模型。你可以直接结合该画面的视觉场景、主体内容、色调与文字，配合视频元数据（文件名、大小、路径）进行分析与解答！",
		);
	}
	if (hasBoard) {
		parts.push(
			"★ 画板与白板架构指引：用户在当前上下文中附带了白板/画板（Canvas / Excalidraw）。你可以基于其节点卡片、文本内容与连线流向进行结构总结、方案解读或图表重组！",
		);
	}

	return parts.length > 0 ? `\n\n${parts.join("\n\n")}` : "";
}

/** 素材库导入的素材正文注入（服务端按 materialId 从 SQLite 直接取全文摘要，模型免调工具） */
function buildLibraryMaterialsPrompt(contextItems: ChatContextItem[]): string {
	const blocks: string[] = [];
	for (const item of contextItems) {
		if (item.type !== "material" || item.materialId == null) continue;
		const material = workbenchDb.getMaterial(item.materialId);
		if (!material) continue;
		const content = material.content ?? "";
		const preview = content.slice(0, 3000) || "(空素材/暂无正文)";
		const suffix =
			content.length > 3000 ? `\n…（共 ${content.length} 字，已截取）` : "";
		const noteLine = material.note ? `\n批注/要点：${material.note}` : "";
		blocks.push(
			`### 素材：《${material.title}》(id=${material.id}，来源: ${material.sourceType})${noteLine}\n正文：\n"""\n${preview}${suffix}\n"""`,
		);
	}
	if (blocks.length === 0) return "";
	return `\n- 【用户从素材库导入的素材正文（已按 id 从本地素材库取出，直接基于其回答/二创即可，无需再调用读取工具）】:\n${blocks.join("\n\n")}`;
}

/** 笔记/文档/素材引用引导：指明对应的读取工具与定位字段 */
function buildEntityGuidance(contextItems: ChatContextItem[]): string {
	const notes = contextItems.filter((i) => i.type === "note" && i.notePath);
	const docs = contextItems.filter(
		(i) => i.type === "document" && i.documentId != null,
	);
	const materials = contextItems.filter(
		(i) => i.type === "material" && i.materialId != null,
	);
	if (notes.length === 0 && docs.length === 0 && materials.length === 0)
		return "";

	const parts: string[] = [];
	if (notes.length > 0) {
		parts.push(
			`笔记（Vault 相对路径）：${notes.map((n) => `《${n.title}》(${n.notePath})`).join("、")} —— 用 obsidian 相关工具按 relPath 读取全文`,
		);
	}
	if (docs.length > 0) {
		parts.push(
			`创作文档（id）：${docs.map((d) => `《${d.title}》(id=${d.documentId})`).join("、")} —— 用 read_document 工具读取正文`,
		);
	}
	if (materials.length > 0) {
		parts.push(
			`素材（id）：${materials.map((m) => `《${m.title}》(id=${m.materialId})`).join("、")} —— 用素材查询工具按 id 读取`,
		);
	}
	return `\n\n★ 引用实体读取指引：用户通过 @ 显式引用了以下本地实体，需要全文时请用对应工具按标识读取，不要凭空臆测内容：\n${parts.map((p) => `  - ${p}`).join("\n")}`;
}

async function buildSkillsPrompt(
	contextItems: ChatContextItem[],
	userQuery = "",
): Promise<string> {
	const skills = contextItems.filter(
		(item) =>
			(item.type as string) === "skill" ||
			item.id.startsWith("skill_") ||
			item.data?.content ||
			item.data?.dirPath ||
			item.data?.skillName,
	);
	if (skills.length === 0) return "";

	const blocks: string[] = [];

	for (const item of skills) {
		const targetIdentifier =
			(item.data?.dirPath as string) ||
			(item.data?.skillName as string) ||
			item.title ||
			item.id.replace(/^skill_/, "");

		const bundle = await loadSkillContextBundle(targetIdentifier, userQuery);

		if (bundle) {
			let block = `### 【已激活本地 Agent 技能: ${bundle.skillName}】\n本地目录: ${bundle.dirPath}\n\n#### 核心规范 (SKILL.md):\n${bundle.skillMd}`;

			if (bundle.inlinedFiles.length > 0) {
				const inlinedSections = bundle.inlinedFiles
					.map((f) => `\n\n--- 引用配套文档: [${f.path}] ---\n${f.content}`)
					.join("\n");
				block += `\n\n#### 本地预装载核心参考与组件库文档:${inlinedSections}`;
			}

			if (bundle.allFiles.length > 0) {
				block += `\n\n#### 本技能本地所有可用文件清单 (如需查阅其它文件，请直接调用 read_skill_resource 本地工具，严禁联网):\n${bundle.allFiles.map((p) => `- ${p}`).join("\n")}`;
			}

			blocks.push(block);
		} else {
			// Fallback to existing content if bundle loading is not available
			const content =
				typeof item.data?.content === "string" ? item.data.content : "";
			blocks.push(
				`### 【已激活 Agent 技能: ${item.title}】\n${content || "（暂无具体 SKILL.md 内容）"}`,
			);
		}
	}

	const executionRules = `★ 核心执行铁律（Skill 为最高优先级规则，严格遵循）：\n1. 用户在本次任务中显式激活了上述本地技能。你必须以该技能设定的角色定位、标准流程、专业术语与质量规范来严格处理并回复用户的提问！\n2. 该技能的所有规范流程、决策索引及组件模板均已在上方完整提供，或存于本机本地目录。\n3. 【技能自身文件禁网】查阅该技能自身的规范文档、组件模板或源码时，只能调用本地专用的 read_skill_resource 工具从技能目录读取，严禁用 crawl_webpage_via_extension、read_webpage_content 或任何网络工具去 github.com、raw.githubusercontent.com 等外网抓取该技能本身的资料。\n4. 【任务级联网放行】执行该技能的任务流程时，若任务本身需要获取外部信息（热点榜单、最新资讯、公开项目资料、指定网页内容等），允许且应当使用 web_search / read_webpage_content / crawl_webpage_via_extension 完成外部检索；第 3 条的禁网约束仅针对"技能自身的文件"，不限制任务执行所需的外部信息获取，禁止以"禁网"为由把任务降级为本地知识库盘点。\n5. 【执行偏差声明（禁止静默降级）】必须严格按技能定义的流程与数据源执行。若技能要求的动作超出当前环境能力（例如要求执行本地脚本、调用当前未提供的工具、联网不可达），禁止悄悄改用本地知识库等其他数据源替代并把妥协包装成优点；必须在回复开头明确声明：原计划动作、不可执行的原因、实际采用的替代方案与数据口径（如"本次为本地存量盘点，非全网热点雷达"）。\n6. 【与文档协同流式写入铁律（至关重要）】：当用户要求将该技能的风格、排版、组件规范应用于“当前文章 / 这篇文章 / 当前文档”进行优化、排版、美化或改写时：\n   - 绝对禁止在聊天消息中直接倾倒整篇正文或完整排版代码！\n   - 若需查阅技能目录下的特定文件或模板规范，先调用本地专用的 read_skill_resource 工具读取；\n   - 读取完成后，【必须且只能调用 trigger_paragraph_rewrite】工具，将从技能中提炼出的排版风格、样式要求与润色原则作为 instruction 传入，由编辑器流水线在正文中逐段流式生成并渲染对比，聊天区仅输出精炼的设计理念与诊断总结！`;

	return `\n\n- 【用户指定激活的本地 Agent 技能指南与组件库 (Skill Instructions - 必须作为最高优先级规则严格遵循)】:\n${blocks.join("\n\n---\n\n")}\n\n${executionRules}`;
}

// ---------- Document context from dragged context items ----------

function buildDraggedDocumentPrompt(contextItems: ChatContextItem[]): string {
	const docs = contextItems.filter((item) => item.type === "document");
	if (docs.length === 0) return "";
	const lines = docs
		.map(
			(item) =>
				`  文档标题：${item.title}\n  字数：${item.subtitle ?? "-"}\n  内容摘要：${typeof item.data?.contentPreview === "string" ? item.data.contentPreview.slice(0, 800) : "(暂无预览)"}`,
		)
		.join("\n\n");
	return `\n- 【当前编辑文档（Editor Bridge 注入，最优先参考）】:\n${lines}\n  💡 提示：如需读取完整正文，请调用 read_document 工具（无需传 documentId，会自动定位当前文档）。`;
}

// ---------- Public API ----------

/**
 * Build the explicit-attachments prompt block and optional document context block.
 * Falls back to dragged document context items when no activeDocumentId is injected.
 *
 * @returns { attachmentsPrompt, draggedDocumentPrompt }
 */
export async function resolveAttachmentsPrompt(
	contextItems: ChatContextItem[],
	userQuery = "",
	activeNotePath?: string | null,
): Promise<{
	attachmentsPrompt: string;
	draggedDocumentPrompt: string;
}> {
	if (contextItems.length === 0) {
		return { attachmentsPrompt: "", draggedDocumentPrompt: "" };
	}

	// Constrain context items to MAX_CHAT_ATTACHMENTS to prevent prompt explosion
	const safeItems =
		contextItems.length > MAX_CHAT_ATTACHMENTS
			? contextItems.slice(0, MAX_CHAT_ATTACHMENTS)
			: contextItems;

	const webpageGuidance = buildWebpageGuidance(safeItems);
	const visualMediaGuidance = buildVisualMediaGuidance(safeItems);
	const entityGuidance = buildEntityGuidance(safeItems);
	const skillsPrompt = await buildSkillsPrompt(safeItems, userQuery);
	const uploadedDocsPrompt = await buildUploadedDocsPrompt(
		safeItems,
		activeNotePath,
	);
	const libraryMaterialsPrompt = buildLibraryMaterialsPrompt(safeItems);

	const itemLines = safeItems
		.map((item, i) => {
			const typeLabel = getTypeLabel(item.type);
			const detail = item.url
				? ` (网址: ${item.url})`
				: item.subtitle
					? ` (${item.subtitle})`
					: "";
			const imageNotice =
				item.type === "image" && item.thumbnail
					? " [已附带完整图像数据]"
					: item.type === "material" && item.data?.materialKind === "video"
						? " [已提取关键帧画面]"
						: "";
			return `  ${i + 1}. [${typeLabel}] 《${item.title}》${detail}${imageNotice}`;
		})
		.join("\n");

	const attachmentsPrompt = `\n- 【用户显式注入的上下文实体（重点优先参考）】:\n${itemLines}\n提示：用户在本次提问中显式拖入或引用了以上实体作为上下文，请在回答或调用工具时优先围绕这些目标进行深度剖析、总结或比对。${webpageGuidance}${visualMediaGuidance}${entityGuidance}${skillsPrompt}${uploadedDocsPrompt}${libraryMaterialsPrompt}`;

	const draggedDocumentPrompt = buildDraggedDocumentPrompt(safeItems);

	return { attachmentsPrompt, draggedDocumentPrompt };
}
