/**
 * Agent Tool Registry — single entry point that instantiates the exact tool
 * subset available for the current request context.
 *
 * Replaces the previous "register everything + soft-prioritize" approach:
 * each toolDefinition declares its own provisioning contract via `metadata`
 * (see AgentToolMetadata in types.ts), and this registry filters by the
 * active view state. Tools the model cannot meaningfully use right now
 * (e.g. canvas view operations without an open board) are simply not
 * registered — smaller tool list, fewer tokens, fewer wrong picks.
 */
import type { AnyServerTool } from "@tanstack/ai";
import {
	createDirectoryToolDef,
	deleteToolDef,
	executeCreateDirectory,
	executeDelete,
	executeGetFileInfo,
	executeListDirectory,
	executeMove,
	executeOpenInOs,
	executePatchFile,
	executeReadFile,
	executeSearchContent,
	executeSearchFiles,
	executeWriteFile,
	getFileInfoToolDef,
	listDirectoryToolDef,
	moveToolDef,
	openInOsToolDef,
	patchFileToolDef,
	readFileToolDef,
	searchContentToolDef,
	searchFilesToolDef,
	writeFileToolDef,
} from "../fs/index.ts";
import {
	canvasCenterViewToolDef,
	canvasCreateElementsToolDef,
	canvasCreateGroupToolDef,
	canvasTidyLayoutToolDef,
	canvasUpdateNodeToolDef,
	draftCanvasToolDef,
	executeCanvasCenterView,
	executeCanvasCreateElements,
	executeCanvasCreateGroup,
	executeCanvasTidyLayout,
	executeCanvasUpdateNode,
} from "./canvasTools.ts";
import {
	executeGenerateDataChart,
	generateDataChartToolDef,
} from "./chartTool.ts";
import {
	crawlWebpageToolDef,
	executeCrawlWebpage,
} from "./crawlWebpageTool.ts";
import {
	editDocumentParagraphToolDef,
	executeEditDocumentParagraph,
	executeInsertDocumentBlock,
	executeListDocuments,
	executeReadDocument,
	executeTriggerParagraphRewrite,
	executeUpdateDocumentTitle,
	insertDocumentBlockToolDef,
	listDocumentsToolDef,
	readDocumentToolDef,
	triggerParagraphRewriteToolDef,
	updateDocumentTitleToolDef,
} from "./documentTools.ts";
import {
	draftArticleToolDef,
	executeDraftArticle,
} from "./draftArticleTool.ts";
import {
	draftExcalidrawToolDef,
	excalidrawCenterViewToolDef,
	excalidrawClearCanvasToolDef,
	excalidrawDrawElementsToolDef,
	excalidrawInsertLibraryItemToolDef,
	excalidrawUpdateElementToolDef,
	executeExcalidrawCenterView,
	executeExcalidrawClearCanvas,
	executeExcalidrawDrawElements,
	executeExcalidrawUpdateElement,
} from "./excalidrawTools.ts";
import {
	executeInsertExcalidrawLibraryItems,
	headlessInsertExcalidrawLibraryItems,
} from "./excalidrawLibraryPlacement.ts";
import {
	draftExcalidrawReplicaToolDef,
	executeDraftExcalidrawReplica,
	executeSearchExcalidrawLibrary,
	searchExcalidrawLibraryToolDef,
} from "./excalidrawReplicaTool.ts";
import { executeCommand, executeCommandToolDef } from "./executeCommandTool.ts";
import type { GetStatsInput } from "./getStatsTool.ts";
import {
	executeDraftCanvas,
	headlessCreateCanvasElements,
} from "./headlessCanvas.ts";
import {
	executeDraftExcalidraw,
	headlessDrawExcalidrawElements,
} from "./headlessExcalidraw.ts";
import {
	addTagsToBookmarksToolDef,
	createFolderToolDef,
	createTagsToolDef,
	deleteFolderToolDef,
	executeAddTagsToBookmarks,
	executeCreateFolder,
	executeCreateTags,
	executeDeleteFolder,
	executeGetStats,
	executeMergeFolders,
	executeMoveBookmarks,
	executeMoveFolder,
	executeQueryBookmarks,
	executeReadWebpage,
	executeRemoveBookmarks,
	executeRemoveTags,
	executeRenameOrMergeTags,
	executeReorderFolders,
	executeUpdateFolder,
	executeWebFetch,
	executeWebSearch,
	getStatsToolDef,
	mergeFoldersToolDef,
	moveBookmarksToFolderToolDef,
	moveFolderToolDef,
	queryBookmarksToolDef,
	readWebpageToolDef,
	removeBookmarksFromFolderToolDef,
	removeTagsToolDef,
	renameOrMergeTagsToolDef,
	reorderFoldersToolDef,
	updateFolderToolDef,
	webFetchToolDef,
	webSearchToolDef,
	wrapExecution,
} from "./index.ts";
import {
	executeGenerateMermaidDiagram,
	generateMermaidDiagramToolDef,
} from "./mermaidTool.ts";
import {
	executeReadSkillResource,
	readSkillResourceToolDef,
} from "./skillResourceTool.ts";
import {
	type AgentToolHooks,
	type AgentToolMetadata,
	getAgentToolMetadata,
} from "./types.ts";

/** Runtime context that drives precise tool provisioning */
export interface ToolRuntimeContext {
	/** Current module code (editor / obsidian / bookmarks / …) */
	module?: string;
	/** Editor module: active document id */
	activeDocumentId?: number;
	/** Obsidian module: relative path of the currently open note */
	activeNotePath?: string;
	/** Creator module: selected material id */
	activeMaterialId?: number;
	/** Conversation session id (draft containment) */
	sessionId?: string;
	/** Active skill directory for read_skill_resource */
	activeSkillDir?: string;
	/** Abort signal for cancelling active tool executions like shell commands */
	signal?: AbortSignal;
}

type NamedDef = { name: string; metadata?: Record<string, unknown> };

interface ToolSpec {
	def: NamedDef;
	make: () => AnyServerTool;
}

/**
 * Decide whether a tool is provisioned for the current context, driven
 * entirely by the tool's own metadata.requiresView declaration.
 */
export function isToolAvailable(
	metadata: AgentToolMetadata | undefined,
	ctx: ToolRuntimeContext,
): boolean {
	const view = metadata?.requiresView;
	if (!view) return true;
	const boardType = ctx.activeNotePath?.endsWith(".canvas")
		? "canvas"
		: ctx.activeNotePath?.endsWith(".excalidraw")
			? "excalidraw"
			: null;
	switch (view) {
		case "canvas":
			return boardType === "canvas";
		case "excalidraw":
			return boardType === "excalidraw";
		case "editor-document":
			return Boolean(ctx.activeDocumentId);
		case "obsidian-note":
			return Boolean(ctx.activeNotePath) && boardType === null;
		case "rewrite-target":
			return (
				Boolean(ctx.activeDocumentId) ||
				(Boolean(ctx.activeNotePath) && boardType === null)
			);
		default:
			return true;
	}
}

/**
 * Build the full tool spec list, then filter by the current context.
 * `make` closures are only invoked for tools that survive the filter.
 */
export function createAgentTools(
	hooks: AgentToolHooks | undefined,
	ctx: ToolRuntimeContext,
): AnyServerTool[] {
	const { activeDocumentId, activeNotePath, sessionId, activeSkillDir } = ctx;
	const canvasOpen = Boolean(activeNotePath?.endsWith(".canvas"));
	const excalidrawOpen = Boolean(activeNotePath?.endsWith(".excalidraw"));

	const specs: ToolSpec[] = [
		// ---------- 书签知识库 ----------
		{
			def: queryBookmarksToolDef,
			make: () =>
				queryBookmarksToolDef.server((args) =>
					wrapExecution(
						"query_bookmarks",
						args,
						() => executeQueryBookmarks(args),
						hooks,
					),
				),
		},
		{
			def: getStatsToolDef,
			make: () =>
				getStatsToolDef.server((args) =>
					wrapExecution(
						"get_stats",
						args,
						() => executeGetStats((args || {}) as GetStatsInput),
						hooks,
					),
				),
		},
		{
			def: createFolderToolDef,
			make: () =>
				createFolderToolDef.server((args) =>
					wrapExecution(
						"create_folder",
						args,
						() => executeCreateFolder(args),
						hooks,
					),
				),
		},
		{
			def: updateFolderToolDef,
			make: () =>
				updateFolderToolDef.server((args) =>
					wrapExecution(
						"update_folder",
						args,
						() => executeUpdateFolder(args),
						hooks,
					),
				),
		},
		{
			def: moveFolderToolDef,
			make: () =>
				moveFolderToolDef.server((args) =>
					wrapExecution(
						"move_folder",
						args,
						() => executeMoveFolder(args),
						hooks,
					),
				),
		},
		{
			def: reorderFoldersToolDef,
			make: () =>
				reorderFoldersToolDef.server((args) =>
					wrapExecution(
						"reorder_folders",
						args,
						() => executeReorderFolders(args),
						hooks,
					),
				),
		},
		{
			def: deleteFolderToolDef,
			make: () =>
				deleteFolderToolDef.server((args) =>
					wrapExecution(
						"delete_folder",
						args,
						() => executeDeleteFolder(args),
						hooks,
					),
				),
		},
		{
			def: mergeFoldersToolDef,
			make: () =>
				mergeFoldersToolDef.server((args) =>
					wrapExecution(
						"merge_folders",
						args,
						() => executeMergeFolders(args),
						hooks,
					),
				),
		},
		{
			def: moveBookmarksToFolderToolDef,
			make: () =>
				moveBookmarksToFolderToolDef.server((args) =>
					wrapExecution(
						"move_bookmarks_to_folder",
						args,
						() => executeMoveBookmarks(args),
						hooks,
					),
				),
		},
		{
			def: removeBookmarksFromFolderToolDef,
			make: () =>
				removeBookmarksFromFolderToolDef.server((args) =>
					wrapExecution(
						"remove_bookmarks_from_folder",
						args,
						() => executeRemoveBookmarks(args),
						hooks,
					),
				),
		},
		{
			def: createTagsToolDef,
			make: () =>
				createTagsToolDef.server((args) =>
					wrapExecution(
						"create_tags",
						args,
						() => executeCreateTags(args),
						hooks,
					),
				),
		},
		{
			def: addTagsToBookmarksToolDef,
			make: () =>
				addTagsToBookmarksToolDef.server((args) =>
					wrapExecution(
						"add_tags_to_bookmarks",
						args,
						() => executeAddTagsToBookmarks(args),
						hooks,
					),
				),
		},
		{
			def: removeTagsToolDef,
			make: () =>
				removeTagsToolDef.server((args) =>
					wrapExecution(
						"remove_tags",
						args,
						() => executeRemoveTags(args),
						hooks,
					),
				),
		},
		{
			def: renameOrMergeTagsToolDef,
			make: () =>
				renameOrMergeTagsToolDef.server((args) =>
					wrapExecution(
						"rename_or_merge_tags",
						args,
						() => executeRenameOrMergeTags(args),
						hooks,
					),
				),
		},
		// ---------- 网络检索与抓取 ----------
		{
			def: webSearchToolDef,
			make: () =>
				webSearchToolDef.server((args) =>
					wrapExecution(
						"web_search",
						args,
						() => executeWebSearch(args),
						hooks,
					),
				),
		},
		{
			def: webFetchToolDef,
			make: () =>
				webFetchToolDef.server((args) =>
					wrapExecution("web_fetch", args, () => executeWebFetch(args), hooks),
				),
		},
		{
			def: readWebpageToolDef,
			make: () =>
				readWebpageToolDef.server((args) =>
					wrapExecution(
						"read_webpage_content",
						args,
						() => executeReadWebpage(args),
						hooks,
					),
				),
		},
		{
			def: crawlWebpageToolDef,
			make: () =>
				crawlWebpageToolDef.server((args) =>
					wrapExecution(
						"crawl_webpage",
						args,
						() => executeCrawlWebpage(args),
						hooks,
					),
				),
		},
		{
			def: readSkillResourceToolDef,
			make: () =>
				readSkillResourceToolDef.server((args) =>
					wrapExecution(
						"read_skill_resource",
						args,
						() => executeReadSkillResource(args, activeSkillDir),
						hooks,
					),
				),
		},
		// ---------- 本地文件系统 ----------
		{
			def: listDirectoryToolDef,
			make: () =>
				listDirectoryToolDef.server((args) =>
					wrapExecution(
						"fs_list_directory",
						args,
						() => executeListDirectory(args),
						hooks,
					),
				),
		},
		{
			def: readFileToolDef,
			make: () =>
				readFileToolDef.server((args) =>
					wrapExecution(
						"fs_read_file",
						args,
						() => executeReadFile(args),
						hooks,
					),
				),
		},
		{
			def: searchContentToolDef,
			make: () =>
				searchContentToolDef.server((args) =>
					wrapExecution(
						"fs_search_content",
						args,
						() => executeSearchContent(args),
						hooks,
					),
				),
		},
		{
			def: searchFilesToolDef,
			make: () =>
				searchFilesToolDef.server((args) =>
					wrapExecution(
						"fs_search_files",
						args,
						() => executeSearchFiles(args),
						hooks,
					),
				),
		},
		{
			def: getFileInfoToolDef,
			make: () =>
				getFileInfoToolDef.server((args) =>
					wrapExecution(
						"fs_get_file_info",
						args,
						() => executeGetFileInfo(args),
						hooks,
					),
				),
		},
		{
			def: writeFileToolDef,
			make: () =>
				writeFileToolDef.server((args) =>
					wrapExecution(
						"fs_write_file",
						args,
						() => executeWriteFile(args),
						hooks,
					),
				),
		},
		{
			def: patchFileToolDef,
			make: () =>
				patchFileToolDef.server((args) =>
					wrapExecution(
						"fs_patch_file",
						args,
						() => executePatchFile(args),
						hooks,
					),
				),
		},
		{
			def: createDirectoryToolDef,
			make: () =>
				createDirectoryToolDef.server((args) =>
					wrapExecution(
						"fs_create_directory",
						args,
						() => executeCreateDirectory(args),
						hooks,
					),
				),
		},
		{
			def: moveToolDef,
			make: () =>
				moveToolDef.server((args) =>
					wrapExecution("fs_move", args, () => executeMove(args), hooks),
				),
		},
		{
			def: deleteToolDef,
			make: () =>
				deleteToolDef.server((args) =>
					wrapExecution("fs_delete", args, () => executeDelete(args), hooks),
				),
		},
		{
			def: openInOsToolDef,
			make: () =>
				openInOsToolDef.server((args) =>
					wrapExecution(
						"fs_open_in_os",
						args,
						() => executeOpenInOs(args),
						hooks,
					),
				),
		},
		// ---------- 系统命令执行（全局 headless 执行） ----------
		{
			def: executeCommandToolDef,
			make: () =>
				executeCommandToolDef.server((args) =>
					wrapExecution(
						"execute_command",
						args,
						() => executeCommand(args, ctx.signal),
						hooks,
					),
				),
		},
		// ---------- 草稿交付（全局 headless 创建） ----------
		{
			def: draftArticleToolDef,
			make: () =>
				draftArticleToolDef.server((args) =>
					wrapExecution(
						"draft_article",
						args,
						() => executeDraftArticle(args, { sessionId }),
						hooks,
					),
				),
		},
		{
			def: draftCanvasToolDef,
			make: () =>
				draftCanvasToolDef.server((args) =>
					wrapExecution(
						"draft_canvas",
						args,
						() => executeDraftCanvas(args, sessionId),
						hooks,
					),
				),
		},
		{
			def: draftExcalidrawToolDef,
			make: () =>
				draftExcalidrawToolDef.server((args) =>
					wrapExecution(
						"draft_excalidraw",
						args,
						() => executeDraftExcalidraw(args, sessionId),
						hooks,
					),
				),
		},
		{
			def: searchExcalidrawLibraryToolDef,
			make: () =>
				searchExcalidrawLibraryToolDef.server((args) =>
					wrapExecution(
						"search_excalidraw_library",
						args,
						() => executeSearchExcalidrawLibrary(args),
						hooks,
					),
				),
		},
		{
			def: draftExcalidrawReplicaToolDef,
			make: () =>
				draftExcalidrawReplicaToolDef.server((args) =>
					wrapExecution(
						"draft_excalidraw_replica",
						args,
						() => executeDraftExcalidrawReplica(args, sessionId),
						hooks,
					),
				),
		},
		// ---------- 创作文档 ----------
		{
			def: readDocumentToolDef,
			make: () =>
				readDocumentToolDef.server((args) =>
					wrapExecution(
						"read_document",
						args,
						() => executeReadDocument({ ...args, activeDocumentId }),
						hooks,
					),
				),
		},
		{
			def: listDocumentsToolDef,
			make: () =>
				listDocumentsToolDef.server((args) =>
					wrapExecution(
						"list_documents",
						args,
						() => executeListDocuments(args),
						hooks,
					),
				),
		},
		{
			def: updateDocumentTitleToolDef,
			make: () =>
				updateDocumentTitleToolDef.server((args) =>
					wrapExecution(
						"update_document_title",
						args,
						() => executeUpdateDocumentTitle({ ...args, activeDocumentId }),
						hooks,
					),
				),
		},
		{
			def: insertDocumentBlockToolDef,
			make: () =>
				insertDocumentBlockToolDef.server((args) =>
					wrapExecution(
						"insert_document_block",
						args,
						() => executeInsertDocumentBlock({ ...args, activeDocumentId }),
						hooks,
					),
				),
		},
		{
			def: editDocumentParagraphToolDef,
			make: () =>
				editDocumentParagraphToolDef.server((args) =>
					wrapExecution(
						"edit_document_paragraph",
						args,
						() => executeEditDocumentParagraph({ ...args, activeDocumentId }),
						hooks,
					),
				),
		},
		{
			def: generateMermaidDiagramToolDef,
			make: () =>
				generateMermaidDiagramToolDef.server((args) =>
					wrapExecution(
						"generate_mermaid_diagram",
						args,
						() => executeGenerateMermaidDiagram({ ...args, activeDocumentId }),
						hooks,
					),
				),
		},
		{
			def: generateDataChartToolDef,
			make: () =>
				generateDataChartToolDef.server((args) =>
					wrapExecution(
						"generate_data_chart",
						args,
						() => executeGenerateDataChart({ ...args, activeDocumentId }),
						hooks,
					),
				),
		},
		// ---------- 段落改写流水线（需活跃编辑面） ----------
		{
			def: triggerParagraphRewriteToolDef,
			make: () =>
				triggerParagraphRewriteToolDef.server((args) =>
					wrapExecution(
						"trigger_paragraph_rewrite",
						args,
						() => executeTriggerParagraphRewrite(args),
						hooks,
					),
				),
		},
		// ---------- Canvas 白板 ----------
		{
			def: canvasCreateElementsToolDef,
			make: () =>
				canvasCreateElementsToolDef.server((args) =>
					wrapExecution(
						"canvas_create_elements",
						args,
						async () => {
							const targetPath = args.targetPath;
							if (!canvasOpen && !targetPath) {
								throw new Error(
									"当前未打开任何 Canvas 白板。canvas_create_elements 仅用于修改当前已打开的白板，严禁用于新建白板。如需新建白板，请调用 draft_canvas 一次性生成完整草稿卡片。",
								);
							}
							if (
								canvasOpen &&
								(!targetPath || targetPath === activeNotePath)
							) {
								return executeCanvasCreateElements(args);
							}
							return headlessCreateCanvasElements(
								args,
								targetPath ?? activeNotePath,
							);
						},
						hooks,
					),
				),
		},
		{
			def: canvasUpdateNodeToolDef,
			make: () =>
				canvasUpdateNodeToolDef.server((args) =>
					wrapExecution(
						"canvas_update_node",
						args,
						() => executeCanvasUpdateNode(args),
						hooks,
					),
				),
		},
		{
			def: canvasTidyLayoutToolDef,
			make: () =>
				canvasTidyLayoutToolDef.server((args) =>
					wrapExecution(
						"canvas_tidy_layout",
						args,
						() => executeCanvasTidyLayout(args),
						hooks,
					),
				),
		},
		{
			def: canvasCenterViewToolDef,
			make: () =>
				canvasCenterViewToolDef.server((args) =>
					wrapExecution(
						"canvas_center_view",
						args,
						() => executeCanvasCenterView(args),
						hooks,
					),
				),
		},
		{
			def: canvasCreateGroupToolDef,
			make: () =>
				canvasCreateGroupToolDef.server((args) =>
					wrapExecution(
						"canvas_create_group",
						args,
						() => executeCanvasCreateGroup(args),
						hooks,
					),
				),
		},
		// ---------- Excalidraw 画板 ----------
		{
			def: excalidrawDrawElementsToolDef,
			make: () =>
				excalidrawDrawElementsToolDef.server((args) =>
					wrapExecution(
						"excalidraw_draw_elements",
						args,
						async () => {
							const targetPath = args.targetPath;
							if (!excalidrawOpen && !targetPath) {
								throw new Error(
									"当前未打开任何 Excalidraw 画板。excalidraw_draw_elements 仅用于修改当前已打开的画板，严禁用于新建画板。如需新建画板，请调用 draft_excalidraw 一次性生成完整草稿卡片。",
								);
							}
							if (
								excalidrawOpen &&
								(!targetPath || targetPath === activeNotePath)
							) {
								return executeExcalidrawDrawElements(args);
							}
							return headlessDrawExcalidrawElements(
								args,
								targetPath ?? activeNotePath,
							);
						},
						hooks,
					),
				),
		},
		{
			def: excalidrawInsertLibraryItemToolDef,
			make: () =>
				excalidrawInsertLibraryItemToolDef.server((args) =>
					wrapExecution(
						"excalidraw_insert_library_item",
						args,
						async () => {
							const targetPath = args.targetPath;
							if (!excalidrawOpen && !targetPath) {
								throw new Error(
									"当前未打开任何 Excalidraw 画板。excalidraw_insert_library_item 仅用于修改当前已打开的画板，如需新建画板请调用 draft_excalidraw。",
								);
							}
							if (
								excalidrawOpen &&
								(!targetPath || targetPath === activeNotePath)
							) {
								// 打开中的画板：服务端解析图库为真实元素，经 actionPayload 交给客户端桥接插入
								return executeInsertExcalidrawLibraryItems(
									args,
									activeNotePath as string,
								);
							}
							return headlessInsertExcalidrawLibraryItems(
								args,
								targetPath ?? (activeNotePath as string),
							);
						},
						hooks,
					),
				),
		},
		{
			def: excalidrawUpdateElementToolDef,
			make: () =>
				excalidrawUpdateElementToolDef.server((args) =>
					wrapExecution(
						"excalidraw_update_element",
						args,
						() => executeExcalidrawUpdateElement(args),
						hooks,
					),
				),
		},
		{
			def: excalidrawClearCanvasToolDef,
			make: () =>
				excalidrawClearCanvasToolDef.server((args) =>
					wrapExecution(
						"excalidraw_clear_canvas",
						args,
						() => executeExcalidrawClearCanvas(),
						hooks,
					),
				),
		},
		{
			def: excalidrawCenterViewToolDef,
			make: () =>
				excalidrawCenterViewToolDef.server((args) =>
					wrapExecution(
						"excalidraw_center_view",
						args,
						() => executeExcalidrawCenterView(args),
						hooks,
					),
				),
		},
	];

	return specs
		.filter(({ def }) => isToolAvailable(getAgentToolMetadata(def), ctx))
		.map(({ make }) => make());
}
