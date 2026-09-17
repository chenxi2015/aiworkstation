import type { ChatContextItem } from "../../../../types/chatContext.ts";
import { loadSkillContextBundle } from "../../../services/skillsScanner.ts";

// ---------- Type labels ----------

const TYPE_LABELS: Record<string, string> = {
	bookmark: "书签链接",
	folder: "文件夹",
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

function buildImageGuidance(contextItems: ChatContextItem[]): string {
	const hasImage = contextItems.some(
		(item) => item.type === "image" && Boolean(item.thumbnail),
	);
	if (!hasImage) return "";
	return "\n\n★ 重要视觉指引：用户在当前提问中附带了完整的图片/截图。如果用户的提问涉及提取图片文字（OCR）、分析截图、描述设计或解释图表，你可以直接基于接收到的图像内容给出完整、准确的分析与文字提取结果！";
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

	return `\n\n- 【用户指定激活的本地 Agent 技能指南与组件库 (Skill Instructions - 必须作为最高优先级规则严格遵循)】:\n${blocks.join("\n\n---\n\n")}\n\n★ 核心执行铁律（禁止联网，完全遵循本地规范）：\n1. 用户在本次任务中显式激活了上述本地技能。你必须以该技能设定的角色定位、标准流程、专业术语与质量规范来严格处理并回复用户的提问！\n2. 该技能的所有规范流程、决策索引及 HTML 组件库模板均已在上方完整提供，或存于本机本地目录。\n3. 【严禁联网查询】绝对禁止调用 crawl_webpage_via_extension、read_webpage_content 或任何网络工具去抓取 github.com、raw.githubusercontent.com 或外部网络来查找该技能的主题、组件或代码！\n4. 如需查阅技能目录下的其它文件，直接调用本地专用的 read_skill_resource 工具从本地读取，严禁联网！\n5. 【与文档协同流式写入铁律（至关重要）】：当用户要求将该技能的风格、排版、组件规范应用于“当前文章 / 这篇文章 / 当前文档”进行优化、排版、美化或改写时：\n   - 绝对禁止在聊天消息中直接倾倒整篇正文或完整排版代码！\n   - 若需查阅技能目录下的特定文件或模板规范，先调用本地专用的 read_skill_resource 工具读取；\n   - 读取完成后，【必须且只能调用 trigger_paragraph_rewrite】工具，将从技能中提炼出的排版风格、样式要求与润色原则作为 instruction 传入，由编辑器流水线在正文中逐段流式生成并渲染对比，聊天区仅输出精炼的设计理念与诊断总结！`;
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
): Promise<{
	attachmentsPrompt: string;
	draggedDocumentPrompt: string;
}> {
	if (contextItems.length === 0) {
		return { attachmentsPrompt: "", draggedDocumentPrompt: "" };
	}

	const webpageGuidance = buildWebpageGuidance(contextItems);
	const imageGuidance = buildImageGuidance(contextItems);
	const skillsPrompt = await buildSkillsPrompt(contextItems, userQuery);

	const itemLines = contextItems
		.map((item, i) => {
			const typeLabel = getTypeLabel(item.type);
			const detail = item.url
				? ` (网址: ${item.url})`
				: item.subtitle
					? ` (${item.subtitle})`
					: "";
			const imageNotice =
				item.type === "image" && item.thumbnail ? " [已附带完整图像数据]" : "";
			return `  ${i + 1}. [${typeLabel}] 《${item.title}》${detail}${imageNotice}`;
		})
		.join("\n");

	const attachmentsPrompt = `\n- 【用户显式注入的上下文实体（重点优先参考）】:\n${itemLines}\n提示：用户在本次提问中显式拖入或引用了以上实体作为上下文，请在回答或调用工具时优先围绕这些目标进行深度剖析、总结或比对。${webpageGuidance}${imageGuidance}${skillsPrompt}`;

	const draggedDocumentPrompt = buildDraggedDocumentPrompt(contextItems);

	return { attachmentsPrompt, draggedDocumentPrompt };
}
