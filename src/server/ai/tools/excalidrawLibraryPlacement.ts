import {
	type LibraryElement,
	placeLibraryItem,
} from "../../../shared/excalidraw/libraryItem.ts";
import { loadLibraryItems } from "../../services/excalidrawLibrary.ts";
import { readVaultNote, saveVaultNote } from "../../services/obsidian/note.ts";
import type {
	ExcalidrawInsertLibraryItemInput,
	ExcalidrawLibraryPlacement,
	ExcalidrawLibraryPlacementResult,
} from "./excalidrawTools.ts";
import type { ToolExecutionResult } from "./types.ts";

const DEFAULT_GAP = 80;

interface Bounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Union bounds of existing canvas elements (axis-aligned, ignores rotation) */
function getSceneBounds(
	elements: readonly Record<string, unknown>[],
): Bounds | null {
	const live = elements.filter(
		(e) =>
			!e.isDeleted &&
			typeof e.x === "number" &&
			typeof e.y === "number" &&
			typeof e.width === "number" &&
			typeof e.height === "number",
	) as { x: number; y: number; width: number; height: number }[];
	if (live.length === 0) return null;
	const minX = Math.min(...live.map((e) => e.x));
	const minY = Math.min(...live.map((e) => e.y));
	const maxX = Math.max(...live.map((e) => e.x + e.width));
	const maxY = Math.max(...live.map((e) => e.y + e.height));
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function findElementBounds(
	elements: readonly Record<string, unknown>[],
	id: string,
): Bounds | null {
	const el = elements.find((e) => e.id === id && !e.isDeleted);
	if (
		!el ||
		typeof el.x !== "number" ||
		typeof el.y !== "number" ||
		typeof el.width !== "number" ||
		typeof el.height !== "number"
	) {
		return null;
	}
	return { x: el.x, y: el.y, width: el.width, height: el.height };
}

/**
 * Resolve one placement's bounding box. Falls back through:
 * explicit x/y → rightOf/below relative anchor → right of current scene content.
 */
function resolvePlacementBox(
	p: ExcalidrawLibraryPlacement,
	sceneElements: readonly Record<string, unknown>[],
	placementIndex: number,
): { x: number; y: number; width: number; height: number } {
	const { width, height, anchor } = p;
	const gap = anchor.gap ?? DEFAULT_GAP;

	if (typeof anchor.x === "number" && typeof anchor.y === "number") {
		return { x: anchor.x, y: anchor.y, width, height };
	}

	if (anchor.rightOf) {
		const ref = findElementBounds(sceneElements, anchor.rightOf);
		if (!ref) throw new Error(`相对定位参照元素「${anchor.rightOf}」不存在`);
		return {
			x: ref.x + ref.width + gap,
			y: ref.y + (ref.height - height) / 2,
			width,
			height,
		};
	}

	if (anchor.below) {
		const ref = findElementBounds(sceneElements, anchor.below);
		if (!ref) throw new Error(`相对定位参照元素「${anchor.below}」不存在`);
		return {
			x: ref.x + (ref.width - width) / 2,
			y: ref.y + ref.height + gap,
			width,
			height,
		};
	}

	const scene = getSceneBounds(sceneElements);
	if (!scene) {
		return { x: 100, y: 100, width, height };
	}
	// Default flow: extend to the right of everything already on canvas,
	// stacking further right for each additional auto-placed item.
	return {
		x: scene.x + scene.width + gap + placementIndex * (width + gap),
		y: scene.y,
		width,
		height,
	};
}

/**
 * Load referenced libraries once, then place every requested item as real
 * Excalidraw elements (ids/bindings remapped by placeLibraryItem).
 * Returns the placed elements plus the final anchored boxes (for client-side
 * viewport focusing).
 */
export async function resolveExcalidrawLibraryPlacements(
	placements: ExcalidrawLibraryPlacement[],
	sceneElements: readonly Record<string, unknown>[],
): Promise<ExcalidrawLibraryPlacementResult> {
	const sources = [...new Set(placements.map((p) => p.source))];
	const loaded = new Map<
		string,
		Awaited<ReturnType<typeof loadLibraryItems>>
	>();
	await Promise.all(
		sources.map(async (src) => {
			try {
				loaded.set(src, await loadLibraryItems(src));
			} catch {
				// 失败在下方逐条报为 warning
			}
		}),
	);

	const warnings: string[] = [];
	const elements: LibraryElement[] = [];
	const placedBounds: Bounds[] = [];
	let autoIndex = 0;

	for (const p of placements) {
		const items = loaded.get(p.source);
		const item = items?.find((i) => i.index === p.itemIndex);
		if (!item) {
			warnings.push(
				`图库素材不可用：${p.source} #${p.itemIndex}（${items ? "条目序号不存在" : "图库加载失败"}），已跳过`,
			);
			continue;
		}
		const hasExplicitXY =
			typeof p.anchor.x === "number" && typeof p.anchor.y === "number";
		const box = resolvePlacementBox(
			p,
			sceneElements,
			hasExplicitXY ? 0 : autoIndex++,
		);
		try {
			const placed = placeLibraryItem(
				item.elements,
				box,
				`lib_${Math.random().toString(36).slice(2, 8)}`,
			);
			elements.push(...placed.elements);
			placedBounds.push(box);
			warnings.push(...placed.warnings);
		} catch (err) {
			warnings.push(
				`图库素材 ${p.source} #${p.itemIndex} 放置失败：${(err as Error).message}`,
			);
		}
	}

	return { elements, warnings, placedBounds };
}

/**
 * Resolve placements for the currently-open board: read the vault file (same
 * source of truth the editor was opened from), compute placement boxes against
 * its elements, and return the real elements as actionPayload for the client
 * bridge to insert into the live scene.
 */
export async function executeInsertExcalidrawLibraryItems(
	args: ExcalidrawInsertLibraryItemInput,
	targetPath: string,
): Promise<ToolExecutionResult> {
	const note = await readVaultNote(targetPath);
	let parsed: { elements?: Record<string, unknown>[] } = {};
	try {
		parsed = JSON.parse(note.content);
	} catch {
		throw new Error(`画板文件「${targetPath}」内容不是合法 JSON，无法读取`);
	}

	const existing = Array.isArray(parsed.elements) ? parsed.elements : [];
	const { elements: placed, warnings, placedBounds } =
		await resolveExcalidrawLibraryPlacements(args.placements, existing);
	if (placed.length === 0) {
		throw new Error(
			`没有可插入的图库素材：${warnings.join("；") || "全部不可用"}`,
		);
	}

	const warnText = warnings.length ? `（${warnings.join("；")}）` : "";
	return {
		toolName: "excalidraw_insert_library_item",
		summary: `已向当前画板插入 ${args.placements.length} 个图库素材（共 ${placed.length} 个元素）${warnText}。`,
		items: [],
		references: [],
		isMutation: true,
		actionPayload: {
			elements: placed as unknown as Record<string, unknown>[],
			placedBounds,
		},
	};
}

/** Headlessly insert library items into an Excalidraw file (not currently open) */
export async function headlessInsertExcalidrawLibraryItems(
	args: ExcalidrawInsertLibraryItemInput,
	targetPath: string,
): Promise<ToolExecutionResult> {
	const note = await readVaultNote(targetPath);
	let parsed: { elements?: Record<string, unknown>[] } = {};
	try {
		parsed = JSON.parse(note.content);
	} catch {
		throw new Error(`画板文件「${targetPath}」内容不是合法 JSON，无法写入`);
	}

	const existing = Array.isArray(parsed.elements) ? parsed.elements : [];
	const { elements: placed, warnings } =
		await resolveExcalidrawLibraryPlacements(args.placements, existing);
	if (placed.length === 0) {
		throw new Error(
			`没有可插入的图库素材：${warnings.join("；") || "全部不可用"}`,
		);
	}

	const nextContent = JSON.stringify(
		{
			type: "excalidraw",
			version: 2,
			source: "https://excalidraw.com",
			...(parsed as Record<string, unknown>),
			elements: [...existing, ...placed],
		},
		null,
		2,
	);

	const save = await saveVaultNote(targetPath, nextContent, note.mtime);
	if (!save.success) {
		throw new Error(
			save.conflict
				? "画板在别处被修改，为避免覆盖已放弃写入，请重试"
				: save.error || "写入画板失败",
		);
	}

	const name = targetPath.split("/").pop() ?? targetPath;
	const warnText = warnings.length ? `（${warnings.join("；")}）` : "";
	return {
		toolName: "excalidraw_insert_library_item",
		summary: `已静默向画板「${name}」插入 ${args.placements.length} 个图库素材（共 ${placed.length} 个元素）${warnText}。点击下方卡片跳转查看。`,
		items: [],
		references: [],
		isMutation: true,
		navigation: {
			route: "/obsidian",
			searchParams: { note: targetPath },
			label: "打开画板",
		},
	};
}
