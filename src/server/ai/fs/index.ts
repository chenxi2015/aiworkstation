import { wrapExecution } from "../tools/index.ts";
import type { BookmarkToolHooks, ToolExecutionResult } from "../tools/types.ts";
import {
	createDirectoryInputSchema,
	createDirectoryToolDef,
	executeCreateDirectory,
} from "./createDirectoryTool.ts";
import {
	deleteInputSchema,
	deleteToolDef,
	executeDelete,
} from "./deleteTool.ts";
import {
	executeGetFileInfo,
	getFileInfoInputSchema,
	getFileInfoToolDef,
} from "./getFileInfoTool.ts";
import {
	executeListDirectory,
	listDirectoryInputSchema,
	listDirectoryToolDef,
} from "./listDirectoryTool.ts";
import { executeMove, moveInputSchema, moveToolDef } from "./moveTool.ts";
import {
	executeOpenInOs,
	openInOsInputSchema,
	openInOsToolDef,
} from "./openInOsTool.ts";
import {
	executePatchFile,
	patchFileInputSchema,
	patchFileToolDef,
} from "./patchFileTool.ts";
import {
	executeReadFile,
	readFileInputSchema,
	readFileToolDef,
} from "./readFileTool.ts";
import {
	executeSearchContent,
	searchContentInputSchema,
	searchContentToolDef,
} from "./searchContentTool.ts";
import {
	executeSearchFiles,
	searchFilesInputSchema,
	searchFilesToolDef,
} from "./searchFilesTool.ts";
import {
	executeWriteFile,
	writeFileInputSchema,
	writeFileToolDef,
} from "./writeFileTool.ts";

export * from "./createDirectoryTool.ts";
export * from "./deleteTool.ts";
export * from "./fsSafety.ts";
export * from "./getFileInfoTool.ts";
export * from "./listDirectoryTool.ts";
export * from "./moveTool.ts";
export * from "./openInOsTool.ts";
export * from "./patchFileTool.ts";
export * from "./readFileTool.ts";
export * from "./searchContentTool.ts";
export * from "./searchFilesTool.ts";
export * from "./writeFileTool.ts";

/**
 * 本地文件系统 Server Tools 工厂：
 * 基于 node:fs 直接操作本机文件/目录，与书签 DB 工具解耦。
 */
export function createFsServerTools(hooks?: BookmarkToolHooks) {
	return [
		listDirectoryToolDef.server((args) =>
			wrapExecution(
				"fs_list_directory",
				args,
				() => executeListDirectory(args),
				hooks,
			),
		),
		readFileToolDef.server((args) =>
			wrapExecution("fs_read_file", args, () => executeReadFile(args), hooks),
		),
		searchContentToolDef.server((args) =>
			wrapExecution(
				"fs_search_content",
				args,
				() => executeSearchContent(args),
				hooks,
			),
		),
		searchFilesToolDef.server((args) =>
			wrapExecution(
				"fs_search_files",
				args,
				() => executeSearchFiles(args),
				hooks,
			),
		),
		getFileInfoToolDef.server((args) =>
			wrapExecution(
				"fs_get_file_info",
				args,
				() => executeGetFileInfo(args),
				hooks,
			),
		),
		writeFileToolDef.server((args) =>
			wrapExecution("fs_write_file", args, () => executeWriteFile(args), hooks),
		),
		patchFileToolDef.server((args) =>
			wrapExecution("fs_patch_file", args, () => executePatchFile(args), hooks),
		),
		createDirectoryToolDef.server((args) =>
			wrapExecution(
				"fs_create_directory",
				args,
				() => executeCreateDirectory(args),
				hooks,
			),
		),
		moveToolDef.server((args) =>
			wrapExecution("fs_move", args, () => executeMove(args), hooks),
		),
		deleteToolDef.server((args) =>
			wrapExecution("fs_delete", args, () => executeDelete(args), hooks),
		),
		openInOsToolDef.server((args) =>
			wrapExecution("fs_open_in_os", args, () => executeOpenInOs(args), hooks),
		),
	];
}

/**
 * 兼容 dispatcher：按工具名分发（与 executeBookmarkToolCall 对齐）
 */
export async function executeFsToolCall(
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
		case "fs_list_directory":
			result = executeListDirectory(listDirectoryInputSchema.parse(parsedArgs));
			break;
		case "fs_read_file":
			result = executeReadFile(readFileInputSchema.parse(parsedArgs));
			break;
		case "fs_search_files":
			result = executeSearchFiles(searchFilesInputSchema.parse(parsedArgs));
			break;
		case "fs_search_content":
			result = executeSearchContent(searchContentInputSchema.parse(parsedArgs));
			break;
		case "fs_get_file_info":
			result = executeGetFileInfo(getFileInfoInputSchema.parse(parsedArgs));
			break;
		case "fs_write_file":
			result = executeWriteFile(writeFileInputSchema.parse(parsedArgs));
			break;
		case "fs_patch_file":
			result = executePatchFile(patchFileInputSchema.parse(parsedArgs));
			break;
		case "fs_create_directory":
			result = executeCreateDirectory(
				createDirectoryInputSchema.parse(parsedArgs),
			);
			break;
		case "fs_move":
			result = executeMove(moveInputSchema.parse(parsedArgs));
			break;
		case "fs_delete":
			result = executeDelete(deleteInputSchema.parse(parsedArgs));
			break;
		case "fs_open_in_os":
			result = await executeOpenInOs(openInOsInputSchema.parse(parsedArgs));
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

	return { ...result, toolCallId };
}
