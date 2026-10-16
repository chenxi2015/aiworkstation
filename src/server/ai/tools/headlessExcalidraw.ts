import {
	generateExcalidrawElements,
	type SharedRawElement,
} from "../../../shared/excalidraw/elementFactory.ts";
import { readVaultNote, saveVaultNote } from "../../services/obsidian/note.ts";
import { createDraft } from "../drafts/draftStore.ts";
import type {
	DraftExcalidrawInput,
	ExcalidrawDrawInput,
} from "./excalidrawTools.ts";
import type { ToolExecutionResult, ToolNavigation } from "./types.ts";

function obsidianNavigation(relPath: string, label: string): ToolNavigation {
	return {
		route: "/obsidian",
		searchParams: { note: relPath },
		label,
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
		`未指定目标文件。请在笔记模块打开一个 ${expectedExt} 文件后再执行绘制或修改。`,
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

/**
 * Generates an Excalidraw board draft in one atomic step and returns a delivery card navigation.
 * No Vault file is touched until the user confirms save on the delivery card.
 */
export async function executeDraftExcalidraw(
	args: DraftExcalidrawInput,
	sessionId?: string,
): Promise<ToolExecutionResult> {
	const title = (args.title || "未命名画板").trim();
	const generated = generateExcalidrawElements(
		{
			layout: args.layout ?? "vertical_flow",
			mode: "replace",
			elements: args.elements.map((el) => ({
				...el,
				type: el.type ?? "rectangle",
			})),
			connections: args.connections ?? [],
		},
		{ existingElements: [] },
	);

	const content = JSON.stringify(
		{
			type: "excalidraw",
			version: 2,
			source: "https://excalidraw.com",
			elements: generated,
			appState: {
				gridSize: null,
				viewBackgroundColor: "#ffffff",
			},
			files: {},
		},
		null,
		2,
	);

	const draft = createDraft({
		title,
		content,
		kind: "excalidraw",
		sessionId,
		wordCount: generated.length,
	});

	const connCount = args.connections?.length ?? 0;
	return {
		toolName: "draft_excalidraw",
		summary: `已为「${title}」生成 Excalidraw 画板草稿（共 ${args.elements.length} 个图形元素、${connCount} 条连线）。正文已暂存本地草稿区，等待用户在交付卡片中确认保存。`,
		items: [],
		references: [],
		isMutation: true,
		navigation: {
			route: "",
			searchParams: { draftId: draft.id },
			label: "存为画板",
			draftId: draft.id,
			draftKind: "excalidraw",
			title,
			wordCount: generated.length,
		},
	};
}
