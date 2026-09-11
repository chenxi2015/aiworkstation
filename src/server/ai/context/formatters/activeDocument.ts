import { workbenchDb } from "../../../db/sqlite.ts";

/**
 * Build a detailed active-document context block for injection into the system prompt.
 * Returns empty string when no activeDocumentId is provided or document is not found.
 */
export function resolveActiveDocumentPrompt(
	activeDocumentId: number | undefined | null,
): string {
	if (!activeDocumentId) return "";

	const doc = workbenchDb.getDocument(activeDocumentId);
	if (!doc) return "";

	const wordCount = doc.contentText?.length ?? 0;
	const preview = (doc.contentText || "").slice(0, 1000) || "(空文档/暂无文字)";
	const previewSuffix = wordCount > 1000 ? `\n…（共 ${wordCount} 字）` : "";

	return `\n- 【当前正在编辑的活跃文档（用户当前屏幕聚焦，最高优先级）】:
  - 文档 ID: ${doc.id}
  - 标题: 《${doc.title}》
  - 状态: ${doc.status} | 风格: ${doc.stylePreset || "默认"}
  - 当前字数: ${wordCount} 字
  - 更新时间: ${doc.updatedAt ?? "-"}
  - 正文摘要预览:
"""
${preview}${previewSuffix}
"""
  💡 提示：用户的提问默认针对此篇文档展开。你可以直接参考上述正文进行理解与回答；若需要读取更长正文或进行深入解析，请调用 read_document 工具（可省略 documentId 或传入 ${doc.id}）。
  ⚠️ 核心约束：本文档由系统内置 SQLite 数据库托管，【磁盘中不存在任何对应的文件路径（如 ~/.aiworkstation 等不存在）】！严禁猜测路径或调用文件系统工具寻找文档！`;
}
