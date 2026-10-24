import {
	type LibraryElement,
	placeLibraryItem,
} from "../../../shared/excalidraw/libraryItem.ts";
import {
	getPersonalLibraryFiles,
	getPersonalLibraryItem,
} from "../../services/personalLibrary.ts";
import { readVaultNote, saveVaultNote } from "../../services/obsidian/note.ts";
import type { InsertPersonalLibraryItemInput } from "./excalidrawPersonalLibrary.ts";
import type { ToolExecutionResult } from "./types.ts";

/**
 * Placement executor for personal-library items.
 *
 * Mirrors excalidrawLibraryPlacement.ts but sources items from
 * excalidraw_library_items (keyed by LibraryItem.id) and additionally
 * resolves image dataURLs from excalidraw_library_files — personal items
 * with image elements are fully usable, unlike public-catalog ones.
 */

const DEFAULT_GAP = 80;

interface Bounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

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

/** Same anchor resolution policy as the public-library placement path. */
function resolvePlacementBox(
	p: InsertPersonalLibraryItemInput["placements"][number],
	sceneElements: readonly Record<string, unknown>[],
	placementIndex: number,
): Bounds {
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
	if (!scene) return { x: 100, y: 100, width, height };
	return {
		x: scene.x + scene.width + gap + placementIndex * (width + gap),
		y: scene.y,
		width,
		height,
	};
}

interface ResolvedPlacements {
	elements: LibraryElement[];
	files: Record<string, unknown>;
	warnings: string[];
	placedBounds: Bounds[];
}

function resolvePersonalPlacements(
	placements: InsertPersonalLibraryItemInput["placements"],
	sceneElements: readonly Record<string, unknown>[],
): ResolvedPlacements {
	const warnings: string[] = [];
	const elements: LibraryElement[] = [];
	const placedBounds: Bounds[] = [];
	const neededFileIds = new Set<string>();
	let autoIndex = 0;

	for (const p of placements) {
		const item = getPersonalLibraryItem(p.itemId);
		if (!item) {
			warnings.push(`个人素材不存在：${p.itemId}，已跳过`);
			continue;
		}
		const hasExplicitXY =
			typeof p.anchor.x === "number" && typeof p.anchor.y === "number";
		let box: Bounds;
		try {
			box = resolvePlacementBox(p, sceneElements, hasExplicitXY ? 0 : autoIndex++);
		} catch (err) {
			warnings.push(
				`个人素材「${item.name ?? p.itemId}」落位失败：${(err as Error).message}`,
			);
			continue;
		}
		try {
			const placed = placeLibraryItem(
				item.elements,
				box,
				`plib_${Math.random().toString(36).slice(2, 8)}`,
			);
			elements.push(...placed.elements);
			placedBounds.push(box);
			warnings.push(...placed.warnings);
			for (const el of placed.elements) {
				if (typeof el.fileId === "string" && el.fileId) {
					neededFileIds.add(el.fileId);
				}
			}
		} catch (err) {
			warnings.push(
				`个人素材「${item.name ?? p.itemId}」放置失败：${(err as Error).message}`,
			);
		}
	}

	return {
		elements,
		files: getPersonalLibraryFiles([...neededFileIds]),
		warnings,
		placedBounds,
	};
}

/** Resolve placements for the currently-open board (client bridge inserts). */
export async function executeInsertPersonalLibraryItems(
	args: InsertPersonalLibraryItemInput,
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

	const { elements, files, warnings, placedBounds } =
		resolvePersonalPlacements(args.placements, existing);
	if (elements.length === 0) {
		throw new Error(
			`没有可插入的个人素材：${warnings.join("；") || "全部不可用"}`,
		);
	}

	const warnText = warnings.length ? `（${warnings.join("；")}）` : "";
	return {
		toolName: "excalidraw_insert_personal_item",
		summary: `已向当前画板插入 ${args.placements.length} 个个人素材（共 ${elements.length} 个元素）${warnText}。`,
		items: [],
		references: [],
		isMutation: true,
		actionPayload: {
			elements: elements as unknown as Record<string, unknown>[],
			files,
			placedBounds,
		},
	};
}

/** Headlessly insert personal-library items into an Excalidraw file. */
export async function headlessInsertPersonalLibraryItems(
	args: InsertPersonalLibraryItemInput,
	targetPath: string,
): Promise<ToolExecutionResult> {
	const note = await readVaultNote(targetPath);
	let parsed: {
		elements?: Record<string, unknown>[];
		files?: Record<string, unknown>;
	} = {};
	try {
		parsed = JSON.parse(note.content);
	} catch {
		throw new Error(`画板文件「${targetPath}」内容不是合法 JSON，无法写入`);
	}
	const existing = Array.isArray(parsed.elements) ? parsed.elements : [];

	const { elements, files, warnings } = resolvePersonalPlacements(
		args.placements,
		existing,
	);
	if (elements.length === 0) {
		throw new Error(
			`没有可插入的个人素材：${warnings.join("；") || "全部不可用"}`,
		);
	}

	const nextContent = JSON.stringify(
		{
			type: "excalidraw",
			version: 2,
			source: "https://excalidraw.com",
			...(parsed as Record<string, unknown>),
			elements: [...existing, ...elements],
			// Merge image dataURLs so the saved file renders standalone
			files: { ...(parsed.files ?? {}), ...files },
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
		toolName: "excalidraw_insert_personal_item",
		summary: `已静默向画板「${name}」插入 ${args.placements.length} 个个人素材（共 ${elements.length} 个元素）${warnText}。点击下方卡片跳转查看。`,
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
