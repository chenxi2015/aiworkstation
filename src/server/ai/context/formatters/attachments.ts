import type { ChatContextItem } from "../../../../types/chatContext.ts";

// ---------- Type labels ----------

const TYPE_LABELS: Record<string, string> = {
	bookmark: "书签链接",
	folder: "文件夹",
	image: "图片",
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
export function resolveAttachmentsPrompt(contextItems: ChatContextItem[]): {
	attachmentsPrompt: string;
	draggedDocumentPrompt: string;
} {
	if (contextItems.length === 0) {
		return { attachmentsPrompt: "", draggedDocumentPrompt: "" };
	}

	const webpageGuidance = buildWebpageGuidance(contextItems);
	const imageGuidance = buildImageGuidance(contextItems);

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

	const attachmentsPrompt = `\n- 【用户显式注入的上下文实体（重点优先参考）】:\n${itemLines}\n提示：用户在本次提问中显式拖入或引用了以上实体作为上下文，请在回答或调用工具时优先围绕这些目标进行深度剖析、总结或比对。${webpageGuidance}${imageGuidance}`;

	const draggedDocumentPrompt = buildDraggedDocumentPrompt(contextItems);

	return { attachmentsPrompt, draggedDocumentPrompt };
}
