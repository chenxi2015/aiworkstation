import {
	createFolderInputSchema,
	createFolderToolDef,
	executeCreateFolder,
} from "./createFolderTool.ts";
import {
	executeMoveBookmarks,
	moveBookmarksToFolderInputSchema,
	moveBookmarksToFolderToolDef,
} from "./moveBookmarksTool.ts";
import {
	executeQueryBookmarks,
	queryBookmarksInputSchema,
	queryBookmarksToolDef,
} from "./queryBookmarksTool.ts";
import type { BookmarkToolHooks, ToolExecutionResult } from "./types.ts";
import {
	executeUpdateFolder,
	updateFolderInputSchema,
	updateFolderToolDef,
} from "./updateFolderTool.ts";

export * from "./createFolderTool.ts";
export * from "./moveBookmarksTool.ts";
export * from "./queryBookmarksTool.ts";
export * from "./timeResolver.ts";
// Re-export all tool definitions and helpers
export * from "./types.ts";
export * from "./updateFolderTool.ts";

/**
 * Server Tools Factory: Create executable server tools with injected execution hooks
 */
export function createBookmarkServerTools(hooks?: BookmarkToolHooks) {
	return [
		queryBookmarksToolDef.server(async (args) => {
			const res = executeQueryBookmarks(args);
			if (res.references && res.references.length > 0) {
				hooks?.onReferencesFound?.(res.references);
			}
			return res.summary;
		}),
		createFolderToolDef.server(async (args) => {
			const res = executeCreateFolder(args);
			if (res.isMutation) {
				hooks?.onMutated?.();
			}
			return res.summary;
		}),
		moveBookmarksToFolderToolDef.server(async (args) => {
			const res = executeMoveBookmarks(args);
			if (res.isMutation) {
				hooks?.onMutated?.();
			}
			if (res.references && res.references.length > 0) {
				hooks?.onReferencesFound?.(res.references);
			}
			return res.summary;
		}),
		updateFolderToolDef.server(async (args) => {
			const res = executeUpdateFolder(args);
			if (res.isMutation) {
				hooks?.onMutated?.();
			}
			return res.summary;
		}),
	];
}

/**
 * Backward-compatible single tool dispatcher
 */
export async function executeBookmarkToolCall(
	toolCallId: string,
	toolName: string,
	argsJson: string | Record<string, unknown>,
): Promise<ToolExecutionResult & { toolCallId: string }> {
	let parsedArgs: Record<string, unknown> = {};
	if (typeof argsJson === "string") {
		try {
			parsedArgs = JSON.parse(argsJson || "{}");
		} catch {
			parsedArgs = {};
		}
	} else {
		parsedArgs = argsJson || {};
	}

	let result: ToolExecutionResult;
	switch (toolName) {
		case "query_bookmarks":
			result = executeQueryBookmarks(
				queryBookmarksInputSchema.parse(parsedArgs),
			);
			break;
		case "create_folder":
			result = executeCreateFolder(createFolderInputSchema.parse(parsedArgs));
			break;
		case "move_bookmarks_to_folder":
			result = executeMoveBookmarks(
				moveBookmarksToFolderInputSchema.parse(parsedArgs),
			);
			break;
		case "update_folder":
			result = executeUpdateFolder(updateFolderInputSchema.parse(parsedArgs));
			break;
		default:
			result = {
				toolName,
				summary: `未知工具名称: ${toolName}`,
				items: [],
				references: [],
				isMutation: false,
			};
	}

	return {
		...result,
		toolCallId,
	};
}
