import {
	createFolderInputSchema,
	createFolderToolDef,
	executeCreateFolder,
} from "./createFolderTool.ts";
import {
	deleteFolderInputSchema,
	deleteFolderToolDef,
	executeDeleteFolder,
} from "./deleteFolderTool.ts";
import {
	executeGetStats,
	type GetStatsInput,
	getStatsInputSchema,
	getStatsToolDef,
} from "./getStatsTool.ts";
import {
	executeMergeFolders,
	mergeFoldersInputSchema,
	mergeFoldersToolDef,
} from "./mergeFoldersTool.ts";
import {
	executeMoveBookmarks,
	moveBookmarksToFolderInputSchema,
	moveBookmarksToFolderToolDef,
} from "./moveBookmarksTool.ts";
import {
	executeMoveFolder,
	moveFolderInputSchema,
	moveFolderToolDef,
} from "./moveFolderTool.ts";
import {
	executeQueryBookmarks,
	queryBookmarksInputSchema,
	queryBookmarksToolDef,
} from "./queryBookmarksTool.ts";
import {
	executeRemoveBookmarks,
	removeBookmarksFromFolderToolDef,
	removeBookmarksInputSchema,
} from "./removeBookmarksTool.ts";
import {
	executeReorderFolders,
	reorderFoldersInputSchema,
	reorderFoldersToolDef,
} from "./reorderFoldersTool.ts";
import type { BookmarkToolHooks, ToolExecutionResult } from "./types.ts";
import {
	executeUpdateFolder,
	updateFolderInputSchema,
	updateFolderToolDef,
} from "./updateFolderTool.ts";

export * from "./createFolderTool.ts";
export * from "./deleteFolderTool.ts";
export * from "./getStatsTool.ts";
export * from "./mergeFoldersTool.ts";
export * from "./moveBookmarksTool.ts";
export * from "./moveFolderTool.ts";
export * from "./queryBookmarksTool.ts";
export * from "./removeBookmarksTool.ts";
export * from "./reorderFoldersTool.ts";
export * from "./timeResolver.ts";
// Re-export all tool definitions and helpers
export * from "./types.ts";
export * from "./updateFolderTool.ts";

/**
 * Generic execution wrapper that logs metrics and dispatches lifecycle hooks
 */
async function wrapExecution<TArgs>(
	toolName: string,
	args: TArgs,
	executor: () => ToolExecutionResult,
	hooks?: BookmarkToolHooks,
): Promise<string> {
	const start = Date.now();
	hooks?.onToolStart?.(toolName, (args || {}) as Record<string, unknown>);
	try {
		const res = executor();
		if (res.isMutation) {
			hooks?.onMutated?.();
		}
		if (res.references && res.references.length > 0) {
			hooks?.onReferencesFound?.(res.references);
		}
		const durationMs = Date.now() - start;
		hooks?.onToolEnd?.(toolName, res.summary, true, durationMs);
		return res.summary;
	} catch (err: unknown) {
		const durationMs = Date.now() - start;
		const errMsg = err instanceof Error ? err.message : String(err);
		hooks?.onToolEnd?.(toolName, `执行失败: ${errMsg}`, false, durationMs);
		throw err;
	}
}

/**
 * Server Tools Factory: Create executable server tools with injected execution hooks
 */
export function createBookmarkServerTools(hooks?: BookmarkToolHooks) {
	return [
		queryBookmarksToolDef.server((args) =>
			wrapExecution(
				"query_bookmarks",
				args,
				() => executeQueryBookmarks(args),
				hooks,
			),
		),
		createFolderToolDef.server((args) =>
			wrapExecution(
				"create_folder",
				args,
				() => executeCreateFolder(args),
				hooks,
			),
		),
		moveBookmarksToFolderToolDef.server((args) =>
			wrapExecution(
				"move_bookmarks_to_folder",
				args,
				() => executeMoveBookmarks(args),
				hooks,
			),
		),
		updateFolderToolDef.server((args) =>
			wrapExecution(
				"update_folder",
				args,
				() => executeUpdateFolder(args),
				hooks,
			),
		),
		moveFolderToolDef.server((args) =>
			wrapExecution("move_folder", args, () => executeMoveFolder(args), hooks),
		),
		reorderFoldersToolDef.server((args) =>
			wrapExecution(
				"reorder_folders",
				args,
				() => executeReorderFolders(args),
				hooks,
			),
		),
		removeBookmarksFromFolderToolDef.server((args) =>
			wrapExecution(
				"remove_bookmarks_from_folder",
				args,
				() => executeRemoveBookmarks(args),
				hooks,
			),
		),
		deleteFolderToolDef.server((args) =>
			wrapExecution(
				"delete_folder",
				args,
				() => executeDeleteFolder(args),
				hooks,
			),
		),
		mergeFoldersToolDef.server((args) =>
			wrapExecution(
				"merge_folders",
				args,
				() => executeMergeFolders(args),
				hooks,
			),
		),
		getStatsToolDef.server((args) =>
			wrapExecution(
				"get_stats",
				args,
				() => executeGetStats((args || {}) as GetStatsInput),
				hooks,
			),
		),
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
		case "get_stats":
			result = executeGetStats(getStatsInputSchema.parse(parsedArgs));
			break;
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
		case "merge_folders":
			result = executeMergeFolders(mergeFoldersInputSchema.parse(parsedArgs));
			break;
		case "update_folder":
			result = executeUpdateFolder(updateFolderInputSchema.parse(parsedArgs));
			break;
		case "move_folder":
			result = executeMoveFolder(moveFolderInputSchema.parse(parsedArgs));
			break;
		case "reorder_folders":
			result = executeReorderFolders(
				reorderFoldersInputSchema.parse(parsedArgs),
			);
			break;
		case "remove_bookmarks_from_folder":
			result = executeRemoveBookmarks(
				removeBookmarksInputSchema.parse(parsedArgs),
			);
			break;
		case "delete_folder":
			result = executeDeleteFolder(deleteFolderInputSchema.parse(parsedArgs));
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
