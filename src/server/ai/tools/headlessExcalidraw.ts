import {
	generateExcalidrawElements,
	type SharedRawElement,
} from "../../../shared/excalidraw/elementFactory.ts";
import {
	createVaultCanvas,
	createVaultExcalidraw,
	readVaultNote,
	saveVaultNote,
} from "../../services/obsidian/note.ts";
import type { CanvasCreateBoardInput } from "./canvasTools.ts";
import type {
	ExcalidrawCreateBoardInput,
	ExcalidrawDrawInput,
} from "./excalidrawTools.ts";
import type { ToolExecutionResult, ToolNavigation } from "./types.ts";

/**
 * Headless execution engine for Vault-file-based tools.
 *
 * Executes creation and content writes entirely server-side (direct Vault file
 * I/O), without requiring the owning module's page view to be mounted. Used
 * when the AI agent operates from an unrelated module or the target artifact
 * is not currently open.
 */

function obsidianNavigation(relPath: string, label: string): ToolNavigation {
	return {
		route: "/obsidian",
		searchParams: { note: relPath },
		label,
	};
}

/** Headlessly create an Excalidraw board file in the Vault */
export async function headlessCreateExcalidrawBoard(
	args: ExcalidrawCreateBoardInput,
): Promise<ToolExecutionResult> {
	const res = await createVaultExcalidraw(
		args.dir ?? "",
		args.name,
		args.overwrite,
	);
	if (!res.success || !res.relPath) {
		throw new Error(res.error || "新建画板失败");
	}
	const name = res.relPath.split("/").pop() ?? res.relPath;
	return {
		toolName: "excalidraw_create_board",
		summary: `已静默创建 Excalidraw 画板「${name}」（位于 Vault「${res.relPath}」）。点击下方卡片跳转查看。`,
		items: [],
		references: [],
		isMutation: true,
		navigation: obsidianNavigation(res.relPath, "打开画板"),
	};
}

/** Headlessly create a Canvas board file in the Vault */
export async function headlessCreateCanvasBoard(
	args: CanvasCreateBoardInput,
): Promise<ToolExecutionResult> {
	const res = await createVaultCanvas(
		args.dir ?? "",
		args.name,
		args.overwrite,
	);
	if (!res.success || !res.relPath) {
		throw new Error(res.error || "新建白板失败");
	}
	const name = res.relPath.split("/").pop() ?? res.relPath;
	return {
		toolName: "canvas_create_board",
		summary: `已静默创建白板「${name}」（位于 Vault「${res.relPath}」）。点击下方卡片跳转查看。`,
		items: [],
		references: [],
		isMutation: true,
		navigation: obsidianNavigation(res.relPath, "打开白板"),
	};
}

/** Resolve which board file a draw call should target */
function resolveTargetNotePath(
	activeNotePath: string | undefined,
	expectedExt: string,
): string {
	if (activeNotePath?.endsWith(expectedExt)) {
		return activeNotePath;
	}
	throw new Error(
		`未指定目标文件。请先创建画板（excalidraw_create_board）或在笔记模块打开一个 ${expectedExt} 文件。`,
	);
}

/** Headlessly draw elements into an Excalidraw file (not currently open) */
export async function headlessDrawExcalidrawElements(
	args: ExcalidrawDrawInput,
	activeNotePath?: string,
): Promise<ToolExecutionResult> {
	const relPath = resolveTargetNotePath(activeNotePath, ".excalidraw");

	const note = await readVaultNote(relPath);
	let parsed: { elements?: SharedRawElement[] } = {};
	try {
		parsed = JSON.parse(note.content);
	} catch {
		throw new Error(`画板文件「${relPath}」内容不是合法 JSON，无法写入`);
	}

	const existing = Array.isArray(parsed.elements) ? parsed.elements : [];
	const generated = generateExcalidrawElements(args, {
		existingElements: existing,
	});
	const nextElements =
		args.mode === "replace" ? generated : [...existing, ...generated];

	const nextContent = JSON.stringify(
		{
			type: "excalidraw",
			version: 2,
			source: "https://excalidraw.com",
			...(parsed as Record<string, unknown>),
			elements: nextElements,
		},
		null,
		2,
	);

	// Optimistic concurrency: only write if the file has not changed since read
	const save = await saveVaultNote(relPath, nextContent, note.mtime);
	if (!save.success) {
		throw new Error(
			save.conflict
				? "画板在别处被修改，为避免覆盖已放弃写入，请重试"
				: save.error || "写入画板失败",
		);
	}

	const name = relPath.split("/").pop() ?? relPath;
	const connCount = args.connections?.length ?? 0;
	return {
		toolName: "excalidraw_draw_elements",
		summary: `已静默向画板「${name}」绘制 ${args.elements.length} 个图形元素、${connCount} 条连线。点击下方卡片跳转查看。`,
		items: [],
		references: [],
		isMutation: true,
		navigation: obsidianNavigation(relPath, "打开画板"),
	};
}
