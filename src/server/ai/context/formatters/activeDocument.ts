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
  ⚠️ 核心约束：本文档由系统内置 SQLite 数据库托管，【磁盘中不存在任何对应的文件路径】！严禁猜测路径或调用文件系统工具寻找文档！
  ⚠️ 核心协同底线：当用户的意图是针对当前这篇文档进行【全文优化、排版美化、改写润色、风格套用（如套用 Skill 技能规范）或深度二创】时：
  1. 绝对严禁在聊天消息中直接粘贴/输出改写后的正文全文！
  2. 你必须且只能调用 trigger_paragraph_rewrite 工具启动编辑器流水线，在正文中逐段流式改写并呈现 Diff 对比；
  3. 聊天消息只允许输出结构诊断、审稿意见与优化亮点简述。`;
}
