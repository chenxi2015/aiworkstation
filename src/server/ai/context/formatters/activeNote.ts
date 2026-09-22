import { readVaultNote } from "../../../services/obsidian/note.ts";

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
		if (!note || !note.content) return "";

		const wordCount = note.content.length;
		const preview = note.content.trim() || "(空笔记/暂无内容)";

		return `\n- 【当前正在查看/编辑的活跃 Obsidian 笔记（用户当前屏幕聚焦，最高优先级）】:
  - 文件相对路径: ${note.relPath}
  - 笔记标题: 《${note.name}》
  - 当前字数: ${wordCount} 字
  - 完整正文（包含 Wiki 双链 [[...]]、Markdown 结构、代码块、图片等）:
"""
${preview}
"""
  💡 提示：用户的提问默认针对此篇笔记展开，请充分结合上述笔记正文进行回答、总结、润色或提取要点。`;
	} catch (err) {
		console.warn("[resolveActiveNotePrompt] failed to read vault note:", err);
		return "";
	}
}
