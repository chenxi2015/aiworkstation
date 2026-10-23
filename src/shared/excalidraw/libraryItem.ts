/**
 * Dependency-free placement of an Excalidraw library item into a target box.
 *
 * Library items are complete element objects (groups, bound text, arrows with
 * bindings). They must NOT be flattened to skeletons, so this module keeps the
 * elements intact and only: remaps every id and internal reference, scales
 * uniformly into the box, and wraps the item in one outer group so it moves
 * as a unit.
 */

export interface LibraryElement {
	id: string;
	type: string;
	x: number;
	y: number;
	width?: number;
	height?: number;
	points?: [number, number][];
	fontSize?: number;
	groupIds?: string[];
	containerId?: string | null;
	boundElements?: { id: string; type: string }[] | null;
	startBinding?: { elementId: string; [k: string]: unknown } | null;
	endBinding?: { elementId: string; [k: string]: unknown } | null;
	fileId?: string | null;
	frameId?: string | null;
	isDeleted?: boolean;
	[key: string]: unknown;
}

export interface LibraryBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface PlacedLibraryItem {
	elements: LibraryElement[];
	warnings: string[];
}

export const MAX_ITEM_ELEMENTS = 300;

/** Union bounds of axis-aligned element boxes (rotation ignored on purpose). */
export function getItemBounds(elements: readonly LibraryElement[]): LibraryBox {
	const live = elements.filter((e) => !e.isDeleted);
	const minX = Math.min(...live.map((e) => e.x));
	const minY = Math.min(...live.map((e) => e.y));
	const maxX = Math.max(...live.map((e) => e.x + (e.width ?? 0)));
	const maxY = Math.max(...live.map((e) => e.y + (e.height ?? 0)));
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const remap = (map: Map<string, string>, id?: string | null) =>
	id ? (map.get(id) ?? null) : null;

/**
 * Place one library item into `box` (uniform scale, centered).
 * `prefix` must be unique per placement (it namespaces all new ids).
 */
export function placeLibraryItem(
	source: readonly LibraryElement[],
	box: LibraryBox,
	prefix: string,
): PlacedLibraryItem {
	const warnings: string[] = [];
	let elements = source.filter((e) => !e.isDeleted);

	if (elements.length === 0 || elements.length > MAX_ITEM_ELEMENTS) {
		throw new Error(`图库元素数量不合法（${elements.length}）`);
	}
	if (elements.some((e) => e.fileId)) {
		warnings.push("该图库项含图片资源，已跳过图片元素");
		elements = elements.filter((e) => !e.fileId);
		if (elements.length === 0) throw new Error("图库项仅包含图片资源，无法使用");
	}

	const bounds = getItemBounds(elements);
	if (bounds.width <= 0 && bounds.height <= 0) {
		throw new Error("图库项尺寸为 0");
	}
	const scale = Math.min(
		bounds.width > 0 ? box.width / bounds.width : Number.POSITIVE_INFINITY,
		bounds.height > 0 ? box.height / bounds.height : Number.POSITIVE_INFINITY,
	);
	const offsetX = box.x + (box.width - bounds.width * scale) / 2;
	const offsetY = box.y + (box.height - bounds.height * scale) / 2;

	const idMap = new Map(elements.map((e, i) => [e.id, `${prefix}_${i}`]));
	const groupMap = new Map<string, string>();
	const outerGroup = `${prefix}_all`;
	const mapGroup = (g: string) => {
		if (!groupMap.has(g)) groupMap.set(g, `${prefix}_g${groupMap.size}`);
		return groupMap.get(g) as string;
	};

	const placed = elements.map((e, index): LibraryElement => {
		const next: LibraryElement = {
			...e,
			id: idMap.get(e.id) as string,
			seed: typeof e.seed === "number" ? e.seed : index + 1,
			index: null,
			x: offsetX + (e.x - bounds.x) * scale,
			y: offsetY + (e.y - bounds.y) * scale,
			groupIds: [...(e.groupIds ?? []).map(mapGroup), outerGroup],
			containerId: remap(idMap, e.containerId),
			frameId: null,
			boundElements: (e.boundElements ?? [])
				.filter((b) => idMap.has(b.id))
				.map((b) => ({ ...b, id: idMap.get(b.id) as string })),
			startBinding: e.startBinding
				? remapBinding(e.startBinding, idMap)
				: (e.startBinding ?? null),
			endBinding: e.endBinding
				? remapBinding(e.endBinding, idMap)
				: (e.endBinding ?? null),
		};
		if (typeof e.width === "number") next.width = e.width * scale;
		if (typeof e.height === "number") next.height = e.height * scale;
		if (e.points) {
			next.points = e.points.map(([px, py]) => [px * scale, py * scale]);
		}
		if (typeof e.fontSize === "number") {
			next.fontSize = Math.max(Math.round(e.fontSize * scale * 10) / 10, 1);
		}
		return next;
	});

	return { elements: placed, warnings };
}

function remapBinding(
	binding: NonNullable<LibraryElement["startBinding"]>,
	idMap: Map<string, string>,
) {
	const elementId = idMap.get(binding.elementId);
	return elementId ? { ...binding, elementId } : null;
}

