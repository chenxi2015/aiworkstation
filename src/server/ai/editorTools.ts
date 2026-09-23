/**
 * Editor Agent Tools Factory
 * Provides read_document / list_documents / rewrite_document for the editor module.
 * Integrated into agentRunner when module === 'editor'.
 */
import {
	executeGenerateDataChart,
	generateDataChartToolDef,
} from "./tools/chartTool.ts";
import {
	editDocumentParagraphToolDef,
	executeEditDocumentParagraph,
	executeInsertDocumentBlock,
	executeListDocuments,
	executeReadDocument,
	executeTriggerDocumentCreate,
	executeTriggerParagraphRewrite,
	executeUpdateDocumentTitle,
	insertDocumentBlockToolDef,
	listDocumentsToolDef,
	readDocumentToolDef,
	triggerDocumentCreateToolDef,
	triggerParagraphRewriteToolDef,
	updateDocumentTitleToolDef,
} from "./tools/documentTools.ts";
import { wrapExecution } from "./tools/index.ts";
import {
	executeGenerateMermaidDiagram,
	generateMermaidDiagramToolDef,
} from "./tools/mermaidTool.ts";
import type { BookmarkToolHooks } from "./tools/types.ts";

export * from "./tools/chartTool.ts";
export * from "./tools/documentTools.ts";
export * from "./tools/mermaidTool.ts";

/**
 * Create executable editor tools with lifecycle hooks.
 * @param hooks    - Same hook interface as bookmark tools for unified step tracking
 * @param activeDocumentId - Injected by the caller (editor page) so read_document
 *                           and update_document_title can resolve the current doc without explicit ID
 */
export function createEditorServerTools(
	hooks?: BookmarkToolHooks,
	activeDocumentId?: number,
) {
	return [
		readDocumentToolDef.server((args) =>
			wrapExecution(
				"read_document",
				args,
				() => executeReadDocument({ ...args, activeDocumentId }),
				hooks,
			),
		),
		listDocumentsToolDef.server((args) =>
			wrapExecution(
				"list_documents",
				args,
				() => executeListDocuments(args),
				hooks,
			),
		),
		updateDocumentTitleToolDef.server((args) =>
			wrapExecution(
				"update_document_title",
				args,
				() => executeUpdateDocumentTitle({ ...args, activeDocumentId }),
				hooks,
			),
		),
		// Trigger client-side full-article streaming creation pipeline in single Tiptap rich-text editor
		triggerDocumentCreateToolDef.server((args) =>
			wrapExecution(
				"trigger_document_create",
				args,
				() => executeTriggerDocumentCreate(args),
				hooks,
			),
		),
		// Trigger client-side paragraph streaming rewrite pipeline in Tiptap editor (split comparison view)
		// Saves document changes in editor natively with rich diffs, never overwriting DB directly.
		triggerParagraphRewriteToolDef.server((args) =>
			wrapExecution(
				"trigger_paragraph_rewrite",
				args,
				() => executeTriggerParagraphRewrite(args),
				hooks,
			),
		),
		// Targeted insertion of a block (paragraph, image, mermaid, heading, blockquote) at anchor position or append
		insertDocumentBlockToolDef.server((args) =>
			wrapExecution(
				"insert_document_block",
				args,
				() => executeInsertDocumentBlock({ ...args, activeDocumentId }),
				hooks,
			),
		),
		// Targeted modification/polishing of a specific single paragraph without full-article rewrite
		editDocumentParagraphToolDef.server((args) =>
			wrapExecution(
				"edit_document_paragraph",
				args,
				() => executeEditDocumentParagraph({ ...args, activeDocumentId }),
				hooks,
			),
		),
		// Structured Mermaid diagram generation and insertion into document
		generateMermaidDiagramToolDef.server((args) =>
			wrapExecution(
				"generate_mermaid_diagram",
				args,
				() => executeGenerateMermaidDiagram({ ...args, activeDocumentId }),
				hooks,
			),
		),
		// Data chart (bar/line/pie...) generation and insertion into document
		generateDataChartToolDef.server((args) =>
			wrapExecution(
				"generate_data_chart",
				args,
				() => executeGenerateDataChart({ ...args, activeDocumentId }),
				hooks,
			),
		),
	];
}

/**
 * Standalone rewrite pipeline tool definition for non-editor modules (e.g. Obsidian note split view).
 */
export function createRewritePipelineTool(hooks?: BookmarkToolHooks) {
	return triggerParagraphRewriteToolDef.server((args) =>
		wrapExecution(
			"trigger_paragraph_rewrite",
			args,
			() => executeTriggerParagraphRewrite(args),
			hooks,
		),
	);
}
