import {
	ArrowUpDown,
	BarChart3,
	BookOpen,
	Database,
	FileText,
	Folder,
	GitBranch,
	GitCommit,
	Globe,
	Layers,
	LayoutGrid,
	Palette,
	Pencil,
	Search,
	SquareTerminal,
	Tag,
	Tags,
	Trash2,
	Workflow,
	Wrench,
} from "lucide-react";
import type { AgentStep } from "../../../../../types/agent.ts";
import type { FormattedStepAction, ToolStrategy } from "./types.ts";

/**
 * Extracts a clean filename or trailing entity name from a path or string
 */
export function getFileName(filePath?: unknown): string {
	if (typeof filePath !== "string" || !filePath) return "";
	const normalized = filePath.replace(/\\/g, "/");
	const parts = normalized.split("/");
	return parts[parts.length - 1] || normalized;
}

/**
 * Extracts target entity text from step args (e.g. filename, folder, or query)
 */
export function extractTargetText(
	args?: Record<string, unknown>,
): string | undefined {
	if (!args) return undefined;

	// Files and directories
	const filePath =
		args.path ||
		args.filePath ||
		args.targetPath ||
		args.sourcePath ||
		args.filename ||
		args.targetFile;
	if (typeof filePath === "string" && filePath) {
		return getFileName(filePath);
	}

	// Names, titles and folders
	const name =
		args.name ||
		args.folderName ||
		args.targetFolderName ||
		args.title ||
		args.boardName;
	if (typeof name === "string" && name) {
		return name;
	}

	// Keywords and search queries
	const query = args.query || args.keyword || args.pattern || args.search;
	if (typeof query === "string" && query) {
		return `「${query}」`;
	}

	// URL targets
	if (typeof args.url === "string" && args.url) {
		try {
			const parsed = new URL(args.url);
			return parsed.hostname;
		} catch {
			return args.url.slice(0, 30);
		}
	}

	// Command strings
	if (typeof args.command === "string" && args.command) {
		return args.command.split(" ")[0];
	}

	return undefined;
}

/**
 * Extracts line diff stats (e.g. +110 -0) from args or summary preview
 */
export function extractDiffStat(
	args?: Record<string, unknown>,
	summary?: string,
): string | null {
	if (args) {
		if (typeof args.content === "string") {
			const lines = args.content.split("\n").length;
			return `+${lines} -0`;
		}
		if (typeof args.patch === "string") {
			const added = (args.patch.match(/^\+[^+]/gm) || []).length;
			const removed = (args.patch.match(/^-[^-]/gm) || []).length;
			if (added > 0 || removed > 0) {
				return `+${added} -${removed}`;
			}
		}
	}
	if (summary) {
		const match = summary.match(/(\+\d+\s+-\d+)/);
		if (match) return match[1];
	}
	return null;
}

/**
 * Declarative strategies map for known built-in tools across all modules
 */
export const TOOL_STRATEGIES: Record<string, ToolStrategy> = {
	// ================= Filesystem Tools =================
	fs_read_file: (args) => ({
		Icon: BookOpen,
		actionText: "已读取文件",
		targetText: extractTargetText(args),
	}),
	read_file: (args) => ({
		Icon: BookOpen,
		actionText: "已读取文件",
		targetText: extractTargetText(args),
	}),
	view_file: (args) => ({
		Icon: BookOpen,
		actionText: "已读取文件",
		targetText: extractTargetText(args),
	}),
	fs_write_file: (args) => ({
		Icon: Pencil,
		actionText: "已创建",
		targetText: extractTargetText(args),
	}),
	write_file: (args) => ({
		Icon: Pencil,
		actionText: "已创建",
		targetText: extractTargetText(args),
	}),
	write_to_file: (args) => ({
		Icon: Pencil,
		actionText: "已创建",
		targetText: extractTargetText(args),
	}),
	fs_patch_file: (args) => ({
		Icon: Pencil,
		actionText: "编辑了文件",
		targetText: extractTargetText(args),
	}),
	patch_file: (args) => ({
		Icon: Pencil,
		actionText: "编辑了文件",
		targetText: extractTargetText(args),
	}),
	replace_file_content: (args) => ({
		Icon: Pencil,
		actionText: "编辑了文件",
		targetText: extractTargetText(args),
	}),
	fs_list_directory: (args) => ({
		Icon: Folder,
		actionText: "已读取目录",
		targetText: extractTargetText(args),
	}),
	list_directory: (args) => ({
		Icon: Folder,
		actionText: "已读取目录",
		targetText: extractTargetText(args),
	}),
	fs_search_files: () => ({
		Icon: Search,
		actionText: "搜索了文件",
	}),
	search_files: () => ({
		Icon: Search,
		actionText: "搜索了文件",
	}),
	fs_search_content: () => ({
		Icon: Search,
		actionText: "检索了文件内容",
	}),
	search_content: () => ({
		Icon: Search,
		actionText: "检索了文件内容",
	}),
	fs_create_directory: (args) => ({
		Icon: Folder,
		actionText: "创建了目录",
		targetText: extractTargetText(args),
	}),
	create_directory: (args) => ({
		Icon: Folder,
		actionText: "创建了目录",
		targetText: extractTargetText(args),
	}),
	fs_delete: (args) => ({
		Icon: Trash2,
		actionText: "删除了文件",
		targetText: extractTargetText(args),
	}),
	delete_file: (args) => ({
		Icon: Trash2,
		actionText: "删除了文件",
		targetText: extractTargetText(args),
	}),
	fs_move: () => ({
		Icon: Folder,
		actionText: "移动了文件",
	}),
	move_file: () => ({
		Icon: Folder,
		actionText: "移动了文件",
	}),
	fs_get_file_info: (args) => ({
		Icon: FileText,
		actionText: "获取文件信息",
		targetText: extractTargetText(args),
	}),
	get_file_info: (args) => ({
		Icon: FileText,
		actionText: "获取文件信息",
		targetText: extractTargetText(args),
	}),
	fs_open_in_os: () => ({
		Icon: Folder,
		actionText: "在系统中打开",
	}),

	// ================= Terminal & Shell Tools =================
	run_command: () => ({
		Icon: SquareTerminal,
		actionText: "运行了命令",
	}),
	exec_command: () => ({
		Icon: SquareTerminal,
		actionText: "运行了命令",
	}),
	bash: () => ({
		Icon: SquareTerminal,
		actionText: "运行了命令",
	}),
	cmd: () => ({
		Icon: SquareTerminal,
		actionText: "运行了命令",
	}),
	powershell: () => ({
		Icon: SquareTerminal,
		actionText: "运行了命令",
	}),

	// ================= Canvas & Board Tools =================
	canvas_create_elements: () => ({
		Icon: LayoutGrid,
		actionText: "创建了画布元素",
	}),
	canvas_update_node: () => ({
		Icon: LayoutGrid,
		actionText: "更新了画布节点",
	}),
	canvas_tidy_layout: () => ({
		Icon: LayoutGrid,
		actionText: "规整了画布布局",
	}),
	canvas_create_group: () => ({
		Icon: Layers,
		actionText: "创建了画布分组",
	}),
	canvas_create_board: (args) => ({
		Icon: LayoutGrid,
		actionText: "新建了画布白板",
		targetText: extractTargetText(args),
	}),

	// ================= Excalidraw Tools =================
	excalidraw_create_board: (args) => ({
		Icon: Palette,
		actionText: "新建了 Excalidraw 画板",
		targetText: extractTargetText(args),
	}),
	excalidraw_draw_elements: () => ({
		Icon: Palette,
		actionText: "绘制了手绘图形与连线",
	}),
	excalidraw_update_element: () => ({
		Icon: Palette,
		actionText: "更新了画板元素",
	}),
	excalidraw_clear_canvas: () => ({
		Icon: Palette,
		actionText: "清空了画板",
	}),
	excalidraw_center_view: () => ({
		Icon: Palette,
		actionText: "居中了画板视野",
	}),

	// ================= Charts & Diagram Tools =================
	generate_data_chart: () => ({
		Icon: BarChart3,
		actionText: "生成了数据图表",
	}),
	generate_mermaid_diagram: () => ({
		Icon: Workflow,
		actionText: "生成了架构流程图",
	}),

	// ================= Document Tools =================
	read_document: (args) => ({
		Icon: BookOpen,
		actionText: "已读取文档",
		targetText: extractTargetText(args),
	}),
	rewrite_document: () => ({
		Icon: Pencil,
		actionText: "重写了文档",
	}),
	edit_document_paragraph: () => ({
		Icon: Pencil,
		actionText: "编辑了文档段落",
	}),
	trigger_document_create: (args) => ({
		Icon: Pencil,
		actionText: "创建了文档",
		targetText: extractTargetText(args),
	}),
	trigger_paragraph_rewrite: () => ({
		Icon: Pencil,
		actionText: "重写了文档段落",
	}),
	insert_document_block: () => ({
		Icon: Pencil,
		actionText: "更新了文档内容",
	}),
	update_document_title: (args) => ({
		Icon: Pencil,
		actionText: "修改了文档标题",
		targetText: extractTargetText(args),
	}),
	list_documents: () => ({
		Icon: BookOpen,
		actionText: "检索了文档",
	}),

	// ================= Web & Extension Tools =================
	web_search: (args) => ({
		Icon: Search,
		actionText: "搜索了网络",
		targetText: extractTargetText(args),
	}),
	read_webpage_content: (args) => ({
		Icon: Globe,
		actionText: "读取了网页",
		targetText: extractTargetText(args),
	}),
	crawl_webpage_via_extension: (args) => ({
		Icon: Globe,
		actionText: "采集了网页",
		targetText: extractTargetText(args),
	}),
	read_skill_resource: (args) => ({
		Icon: BookOpen,
		actionText: "读取了技能资源",
		targetText: extractTargetText(args),
	}),

	// ================= Bookmarks & Knowledge Base Tools =================
	get_stats: () => ({
		Icon: BarChart3,
		actionText: "分析了知识库",
	}),
	query_bookmarks: (args) => ({
		Icon: Search,
		actionText: "检索了书签",
		targetText: extractTargetText(args),
	}),
	create_folder: (args) => ({
		Icon: Folder,
		actionText: "创建了文件夹",
		targetText: extractTargetText(args),
	}),
	merge_folders: (args) => ({
		Icon: Folder,
		actionText: "合并了文件夹",
		targetText: extractTargetText(args),
	}),
	update_folder: (args) => ({
		Icon: Pencil,
		actionText: "修改了文件夹",
		targetText: extractTargetText(args),
	}),
	move_bookmarks_to_folder: (args) => ({
		Icon: Folder,
		actionText: "归类了书签",
		targetText: extractTargetText(args),
	}),
	move_folder: (args) => ({
		Icon: Folder,
		actionText: "移动了文件夹",
		targetText: extractTargetText(args),
	}),
	reorder_folders: () => ({
		Icon: ArrowUpDown,
		actionText: "更新了排序",
	}),
	remove_bookmarks_from_folder: () => ({
		Icon: Folder,
		actionText: "移出了书签",
	}),
	delete_folder: (args) => ({
		Icon: Trash2,
		actionText: "删除了文件夹",
		targetText: extractTargetText(args),
	}),
	create_tags: (args) => ({
		Icon: Tag,
		actionText: "创建了标签",
		targetText: extractTargetText(args),
	}),
	add_tags_to_bookmarks: (args) => ({
		Icon: Tag,
		actionText: "添加了标签",
		targetText: extractTargetText(args),
	}),
	remove_tags: (args) => ({
		Icon: Tag,
		actionText: "移除了标签",
		targetText: extractTargetText(args),
	}),
	rename_or_merge_tags: (args) => ({
		Icon: Tags,
		actionText: "治理了标签",
		targetText: extractTargetText(args),
	}),

	// ================= Git & Version Control Tools =================
	git_diff: () => ({
		Icon: GitCommit,
		actionText: "比对了代码变更",
	}),
	git_status: () => ({
		Icon: GitBranch,
		actionText: "检查了仓库状态",
	}),
	git_commit: (args) => ({
		Icon: GitCommit,
		actionText: "提交了代码改动",
		targetText: extractTargetText(args),
	}),
	git_log: () => ({
		Icon: GitCommit,
		actionText: "查看了提交历史",
	}),

	// ================= Database & Notes Tools =================
	db_query: () => ({
		Icon: Database,
		actionText: "查询了数据库",
	}),
	sql_query: () => ({
		Icon: Database,
		actionText: "执行了 SQL 查询",
	}),
	obsidian_search: (args) => ({
		Icon: Search,
		actionText: "检索了笔记",
		targetText: extractTargetText(args),
	}),
	obsidian_read_note: (args) => ({
		Icon: BookOpen,
		actionText: "读取了笔记",
		targetText: extractTargetText(args),
	}),
	obsidian_create_note: (args) => ({
		Icon: Pencil,
		actionText: "创建了笔记",
		targetText: extractTargetText(args),
	}),
	obsidian_update_note: (args) => ({
		Icon: Pencil,
		actionText: "更新了笔记",
		targetText: extractTargetText(args),
	}),
};

/**
 * Dynamic heuristic engine matching unknown, composite, or MCP tool calls
 */
export function resolveFallbackStrategy(
	toolName: string,
	args: Record<string, unknown>,
): FormattedStepAction {
	const lower = toolName.toLowerCase().replace(/^(mcp_|tool_|fn_)/, "");
	const targetText = extractTargetText(args);

	// Command / Terminal / Exec
	if (
		lower.includes("command") ||
		lower.includes("exec") ||
		lower.includes("terminal") ||
		lower.includes("bash") ||
		lower.includes("shell")
	) {
		return { Icon: SquareTerminal, actionText: "运行了命令", targetText };
	}

	// Query / Search / Find
	if (
		lower.startsWith("query") ||
		lower.startsWith("search") ||
		lower.startsWith("find") ||
		lower.startsWith("lookup")
	) {
		return { Icon: Search, actionText: "检索了数据", targetText };
	}

	// Read / Fetch / Load / View
	if (
		lower.startsWith("read") ||
		lower.startsWith("get") ||
		lower.startsWith("view") ||
		lower.startsWith("fetch") ||
		lower.startsWith("load")
	) {
		return { Icon: BookOpen, actionText: "已读取内容", targetText };
	}

	// Create / Write / New / Add
	if (
		lower.startsWith("create") ||
		lower.startsWith("write") ||
		lower.startsWith("new") ||
		lower.startsWith("add")
	) {
		return { Icon: Pencil, actionText: "创建了内容", targetText };
	}

	// Edit / Update / Patch / Modify
	if (
		lower.startsWith("edit") ||
		lower.startsWith("update") ||
		lower.startsWith("patch") ||
		lower.startsWith("modify")
	) {
		return { Icon: Pencil, actionText: "编辑了内容", targetText };
	}

	// Delete / Remove / Drop
	if (
		lower.startsWith("delete") ||
		lower.startsWith("remove") ||
		lower.startsWith("drop")
	) {
		return { Icon: Trash2, actionText: "删除了项目", targetText };
	}

	// Canvas / Board
	if (lower.includes("canvas") || lower.includes("board")) {
		return { Icon: LayoutGrid, actionText: "操作了画布", targetText };
	}

	// Charts / Diagrams
	if (
		lower.includes("chart") ||
		lower.includes("diagram") ||
		lower.includes("graph")
	) {
		return { Icon: Workflow, actionText: "生成了图表", targetText };
	}

	// Database / SQL
	if (lower.includes("db") || lower.includes("sql")) {
		return { Icon: Database, actionText: "查询了数据库", targetText };
	}

	// Default fallback
	return {
		Icon: Wrench,
		actionText: `调用了 ${toolName}`,
		targetText,
	};
}

/**
 * Formats a raw AgentStep into human-friendly action presentation
 */
export function formatStepAction(step: AgentStep): FormattedStepAction {
	const args = (step.args || {}) as Record<string, unknown>;
	const strategy = TOOL_STRATEGIES[step.toolName];
	if (strategy) {
		return strategy(args, step.toolName);
	}
	return resolveFallbackStrategy(step.toolName, args);
}
