/**
 * Editor Agent Tools Factory
 * Provides read_document / list_documents / rewrite_document for the editor module.
 * Integrated into agentRunner when module === 'editor'.
 */
import {
	executeListDocuments,
	executeReadDocument,
	executeRewriteDocument,
	listDocumentsToolDef,
	readDocumentToolDef,
	rewriteDocumentToolDef,
} from "./tools/documentTools.ts";
import type { BookmarkToolHooks } from "./tools/types.ts";
import { wrapExecution } from "./tools/index.ts";

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
		// rewrite_document is marked needsApproval — the client-side tool approval
		// flow will gate execution; server impl executes only after user confirms.
		rewriteDocumentToolDef.server((args) =>
			wrapExecution(
				"rewrite_document",
				args,
				() => executeRewriteDocument(args),
				hooks,
			),
		),
	];
}
