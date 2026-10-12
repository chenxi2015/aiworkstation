import { workbenchDb } from "../../db/sqlite.ts";
import { generateArticleContent } from "../documentGeneration.ts";
import { resolveEditorPresetPrompt } from "../editorPresets.ts";
import type { TriggerDocumentCreateInput } from "./documentTools.ts";
import type { ToolExecutionResult, ToolNavigation } from "./types.ts";

/**
 * Headless long-form document creation: create the document row, generate the
 * full article server-side, and persist the content — all without the editor
 * page being mounted. The interactive pipeline (single-editor live typing)
 * remains the preferred path when the user is already in the studio; this
 * headless path serves requests issued from any other module.
 */

function studioNavigation(documentId: number): ToolNavigation {
	return {
		route: "/creator/studio",
		searchParams: { doc: String(documentId), mode: "doc" },
		label: "打开文档",
	};
}

/** Create + fully generate a document entirely server-side */
export async function headlessCreateDocument(
	args: TriggerDocumentCreateInput,
): Promise<ToolExecutionResult> {
	const title = args.title.trim() || "未命名文档";
	const presetPrompt = resolveEditorPresetPrompt(args.stylePreset);

	const content = await generateArticleContent(
		{ title, prompt: args.prompt, stylePreset: args.stylePreset },
		presetPrompt,
	);

	const documentId = workbenchDb.createDocument({
		title,
		content,
		contentText: content,
		stylePreset: args.stylePreset ?? "",
	});

	const wordCount = content.length;
	return {
		toolName: "trigger_document_create",
		summary: `已静默创建文档《${title}》并完成全文创作（约 ${wordCount} 字），内容已入库。点击下方卡片跳转创作台查看。`,
		items: [],
		references: [],
		isMutation: true,
		navigation: studioNavigation(documentId),
	};
}
