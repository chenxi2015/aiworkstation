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
		if (!note || !note.content) {
			return `\n- 【当前活跃笔记】路径 ${activeNotePath} 内容为空或不可读。请明确告知用户：笔记正文为空或读取失败，建议先在左侧重新打开该笔记后再提问。`;
		}

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
  💡 提示：用户的提问默认针对此篇笔记展开，请充分结合上述笔记正文进行回答、总结、润色或提取要点。
  ⚠️ 核心协同底线：当用户的意图是针对当前这篇笔记进行【全文二创洗稿、改写重构、全文润色、结构重排或语言风格调整】时：
  1. 绝对严禁在聊天消息中直接倾倒输出修改后的正文全文！
  2. 你必须调用 trigger_paragraph_rewrite 工具启动双栏比对改写流水线，将提炼后的改写要求传入 instruction，驱动左侧笔记自动开启双栏比对并在右栏流式生成；
  3. 聊天消息中只允许输出简要的篇章诊断、改写策略与亮点说明。`;
	} catch (err) {
		console.warn("[resolveActiveNotePrompt] failed to read vault note:", err);
		return `\n- 【当前活跃笔记读取异常】路径 ${activeNotePath} 读取失败（${err instanceof Error ? err.message : String(err)}）。请明确告知用户笔记读取失败及原因，建议重新打开笔记后重试，不要凭空编造笔记内容。`;
	}
}
