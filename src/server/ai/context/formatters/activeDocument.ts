import { tiptapJsonToMarkdown } from "../../../../components/editor/markdown.ts";
import { workbenchDb } from "../../../db/sqlite.ts";

/**
 * Build a detailed active-document context block for injection into the system prompt.
 * Preserves full Markdown formatting including images and videos.
 */
export function resolveActiveDocumentPrompt(
	activeDocumentId: number | undefined | null,
): string {
	if (!activeDocumentId) return "";

	const doc = workbenchDb.getDocument(activeDocumentId);
	if (!doc) return "";

	let markdownContent = "";
	if (doc.content) {
		try {
			const parsed = JSON.parse(doc.content);
			markdownContent = tiptapJsonToMarkdown(parsed);
		} catch {
			markdownContent = doc.contentText || "";
		}
	} else {
		markdownContent = doc.contentText || "";
	}

	const wordCount = doc.contentText?.length ?? markdownContent.length;
	const preview = markdownContent || "(空文档/暂无文字)";

	return `\n- 【当前正在编辑的活跃文档（用户当前屏幕聚焦，最高优先级）】:
  - 文档 ID: ${doc.id}
  - 标题: 《${doc.title}》
  - 状态: ${doc.status} | 风格: ${doc.stylePreset || "默认"}
  - 当前字数: ${wordCount} 字
  - 更新时间: ${doc.updatedAt ?? "-"}
  - 完整正文（包含标题、段落、图片 ![alt](url)、视频 [▶ 视频](url)）:
"""
${preview}
"""
  💡 提示：用户的提问默认针对此篇文档展开。文档包含多媒体标记，改写时请务必保留原有图片与视频链接！若需检索或盘点历史文档，请使用对应工具。
  ⚠️ 核心约束：本文档由系统内置 SQLite 数据库托管，【磁盘中不存在任何对应的文件路径】！严禁猜测路径或调用文件系统工具寻找文档！`;
}
