/**
 * Editor Agent Tools Factory
 * Provides read_document / list_documents / rewrite_document for the editor module.
 * Integrated into agentRunner when module === 'editor'.
 */
import {
	executeListDocuments,
	executeReadDocument,
	executeTriggerParagraphRewrite,
	listDocumentsToolDef,
	readDocumentToolDef,
	triggerParagraphRewriteToolDef,
} from "./tools/documentTools.ts";
import { wrapExecution } from "./tools/index.ts";
import type { BookmarkToolHooks } from "./tools/types.ts";

export * from "./tools/documentTools.ts";

/**
 * Create executable editor tools with lifecycle hooks.
 * @param hooks    - Same hook interface as bookmark tools for unified step tracking
 * @param activeDocumentId - Injected by the caller (editor page) so read_document
 *                           can resolve the current doc without explicit ID
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
		// Trigger client-side paragraph streaming rewrite pipeline in Tiptap editor
		// Saves document changes in editor natively with rich diffs, never overwriting DB directly.
		triggerParagraphRewriteToolDef.server((args) =>
			wrapExecution(
				"trigger_paragraph_rewrite",
				args,
				() => executeTriggerParagraphRewrite(args),
				hooks,
			),
		),
	];
}
