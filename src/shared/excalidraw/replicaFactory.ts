import type { PlacedLibraryItem } from "./libraryItem.ts";
import type { SharedRawElement } from "./types.ts";

/**
 * Dependency-free factory for "image -> Excalidraw" high-fidelity replication.
 *
 * Unlike `elementFactory` (semantic graph + auto layout), the geometry here is
 * authoritative: the vision model reads absolute pixel coordinates from the
 * source image and this module only normalizes them into skeleton JSON, fits
 * text into its container and reports problems as warnings.
 */

export type ReplicaFontFamily = "hand" | "normal" | "code";
export type ReplicaArrowhead = "arrow" | "triangle" | "bar" | "dot";

export interface ReplicaElement {
	id: string;
	type:
		| "rectangle"
		| "ellipse"
		| "diamond"
		| "text"
		| "line"
		| "arrow"
		| "library";
	/** library: catalog source (e.g. "author/name.excalidrawlib") and item index. */
	librarySource?: string;
	itemIndex?: number;
	/** Shapes / text: top-left corner in source-image pixels. */
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	/** line / arrow: absolute vertices in source-image pixels. */
	points?: [number, number][];
	/** Text content (text), label inside the shape (shapes) or arrow label. */
	text?: string;
	/** Stroke colour; also the text colour for `text` elements. */
	stroke?: string;
	/** Text colour for labels inside shapes (defaults to stroke). */
	textColor?: string;
	fill?: string;
	strokeWidth?: number;
	strokeStyle?: "solid" | "dashed" | "dotted";
	rounded?: boolean;
	opacity?: number;
	fontSize?: number;
	fontFamily?: ReplicaFontFamily;
	textAlign?: "left" | "center" | "right";
	/** Arrow endpoints bound to shape ids (keeps arrows attached when moved). */
	startId?: string;
	endId?: string;
	startArrowhead?: ReplicaArrowhead | null;
	endArrowhead?: ReplicaArrowhead | null;
}

export interface ReplicaInput {
	/** Source image size in pixels; used for out-of-bounds checks. */
	canvas?: { width: number; height: number; background?: string };
	/** Sketchy hand-drawn style (true) or clean lines (false) — match the source. */
	sketch?: boolean;
	/** Array order is z-order: backgrounds / containers first, labels last. */
	elements: ReplicaElement[];
}

export interface ReplicaOptions {
	/** Sync resolver for `library` elements (the caller prefetches the data). */
	resolveLibrary?: (el: ReplicaElement) => PlacedLibraryItem;
}

export interface ReplicaResult {
	elements: SharedRawElement[];
	warnings: string[];
	background: string;
}

/** Excalidraw 0.18 font ids: 5 = Excalifont, 2 = Helvetica, 3 = Cascadia. */
const FONT_IDS: Record<ReplicaFontFamily, number> = {
	hand: 5,
	normal: 2,
	code: 3,
};
const LINE_HEIGHT = 1.25;
const MIN_FONT_SIZE = 10;
const DEFAULT_FONT_SIZE = 16;
const TEXT_PADDING = 8;
/** Share of a shape's box that text can safely occupy. */
const TEXT_AREA_RATIO: Record<string, number> = {
	rectangle: 1,
	ellipse: 0.72,
	diamond: 0.5,
};

const isCjk = (ch: string) =>
	/[\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef\u3000-\u303f]/.test(ch);

/** Approximate glyph width: close enough to pre-wrap before Excalidraw measures. */
function charWidth(ch: string, fontSize: number): number {
	if (isCjk(ch)) return fontSize;
	if (ch === " ") return fontSize * 0.3;
	if (/[A-Z0-9MW]/.test(ch)) return fontSize * 0.62;
	return fontSize * 0.52;
}

const lineWidth = (line: string, fontSize: number) =>
	[...line].reduce((sum, ch) => sum + charWidth(ch, fontSize), 0);

/** Greedy wrap that respects existing line breaks. */
export function wrapText(
	text: string,
	maxWidth: number,
	fontSize: number,
): string[] {
	const lines: string[] = [];
	for (const raw of text.split("\n")) {
		let current = "";
		for (const ch of raw) {
			if (current && lineWidth(current + ch, fontSize) > maxWidth) {
				lines.push(current.trimEnd());
				current = ch === " " ? "" : ch;
			} else {
				current += ch;
			}
		}
		lines.push(current);
	}
	return lines;
}

/** Shrink font size until the wrapped text fits the box (or the minimum is hit). */
export function fitText(
	text: string,
	boxWidth: number,
	boxHeight: number,
	fontSize: number,
): { text: string; fontSize: number; fits: boolean } {
	const maxW = Math.max(boxWidth - TEXT_PADDING * 2, 1);
	const maxH = Math.max(boxHeight - TEXT_PADDING, 1);
	for (let size = fontSize; size >= MIN_FONT_SIZE; size -= 1) {
		const lines = wrapText(text, maxW, size);
		if (lines.length * size * LINE_HEIGHT <= maxH) {
			return { text: lines.join("\n"), fontSize: size, fits: true };
		}
	}
	const lines = wrapText(text, maxW, MIN_FONT_SIZE);
	return { text: lines.join("\n"), fontSize: MIN_FONT_SIZE, fits: false };
}

const isNum = (v: unknown): v is number =>
	typeof v === "number" && Number.isFinite(v);

function baseStyle(el: ReplicaElement, roughness: number) {
	const fill = el.fill && el.fill !== "transparent" ? el.fill : "transparent";
	return {
		strokeColor: el.stroke ?? "#1e1e1e",
		backgroundColor: fill,
		fillStyle: "solid",
		strokeWidth: el.strokeWidth ?? 2,
		strokeStyle: el.strokeStyle ?? "solid",
		roughness,
		opacity: el.opacity ?? 100,
		angle: 0,
	};
}

function buildShape(
	el: ReplicaElement,
	roughness: number,
	warnings: string[],
): Record<string, unknown> | null {
	if (![el.x, el.y, el.width, el.height].every(isNum)) {
		warnings.push(`元素 ${el.id} 缺少 x/y/width/height，已跳过`);
		return null;
	}
	const { x, y, width, height } = el as Required<
		Pick<ReplicaElement, "x" | "y" | "width" | "height">
	>;
	const config: Record<string, unknown> = {
		id: el.id,
		type: el.type,
		x,
		y,
		width,
		height,
		...baseStyle(el, roughness),
		roundness: el.rounded === false ? null : { type: 3 },
	};
	if (el.text) {
		const ratio = TEXT_AREA_RATIO[el.type] ?? 1;
		const fitted = fitText(
			el.text,
			width * ratio,
			height * ratio,
			el.fontSize ?? DEFAULT_FONT_SIZE,
		);
		if (!fitted.fits) {
			warnings.push(`元素 ${el.id} 文字「${el.text.slice(0, 12)}」放不下，请放大该图形`);
		}
		config.label = {
			text: fitted.text,
			fontSize: fitted.fontSize,
			fontFamily: FONT_IDS[el.fontFamily ?? "hand"],
			strokeColor: el.textColor ?? el.stroke ?? "#1e1e1e",
			textAlign: "center",
			verticalAlign: "middle",
		};
	}
	return config;
}

function buildText(
	el: ReplicaElement,
	warnings: string[],
): Record<string, unknown> | null {
	if (!el.text || !isNum(el.x) || !isNum(el.y)) {
		warnings.push(`文字 ${el.id} 缺少 text/x/y，已跳过`);
		return null;
	}
	return {
		id: el.id,
		type: "text",
		x: el.x,
		y: el.y,
		text: el.text,
		strokeColor: el.stroke ?? "#1e1e1e",
		backgroundColor: "transparent",
		fontSize: el.fontSize ?? DEFAULT_FONT_SIZE,
		fontFamily: FONT_IDS[el.fontFamily ?? "hand"],
		textAlign: el.textAlign ?? "left",
		verticalAlign: "top",
		opacity: el.opacity ?? 100,
	};
}

function buildLinear(
	el: ReplicaElement,
	roughness: number,
	shapeIds: Set<string>,
	warnings: string[],
): Record<string, unknown> | null {
	const pts = el.points;
	if (!pts || pts.length < 2 || !pts.every(([px, py]) => isNum(px) && isNum(py))) {
		warnings.push(`${el.type} ${el.id} 至少需要 2 个顶点，已跳过`);
		return null;
	}
	const [x0, y0] = pts[0];
	const isArrow = el.type === "arrow";
	const bound = (id?: string) => {
		if (!id) return undefined;
		if (shapeIds.has(id)) return { id };
		warnings.push(`箭头 ${el.id} 绑定的图形 ${id} 不存在，已忽略绑定`);
		return undefined;
	};
	const start = isArrow ? bound(el.startId) : undefined;
	const end = isArrow ? bound(el.endId) : undefined;
	return {
		id: el.id,
		type: el.type,
		x: x0,
		y: y0,
		points: pts.map(([px, py]) => [px - x0, py - y0]),
		...baseStyle(el, roughness),
		roundness: null,
		...(isArrow
			? {
					startArrowhead: el.startArrowhead ?? null,
					endArrowhead:
						el.endArrowhead === undefined ? "arrow" : el.endArrowhead,
					...(start ? { start } : {}),
					...(end ? { end } : {}),
					...(el.text
						? {
								label: {
									text: el.text,
									fontSize: el.fontSize ?? 14,
									fontFamily: FONT_IDS[el.fontFamily ?? "hand"],
									strokeColor: el.textColor ?? el.stroke ?? "#1e1e1e",
								},
							}
						: {}),
				}
			: {}),
	};
}

/** Expand a library item in place; failures degrade to a warning. */
function buildLibrary(
	el: ReplicaElement,
	options: ReplicaOptions,
	warnings: string[],
): unknown[] {
	if (!options.resolveLibrary || !el.librarySource) {
		warnings.push(`图库元素 ${el.id} 缺少 librarySource 或未启用图库，已跳过`);
		return [];
	}
	try {
		const placed = options.resolveLibrary(el);
		for (const w of placed.warnings) warnings.push(`图库元素 ${el.id}: ${w}`);
		return placed.elements;
	} catch (err) {
		warnings.push(`图库元素 ${el.id} 放置失败：${(err as Error).message}`);
		return [];
	}
}

/** Collect out-of-bounds warnings against the declared source canvas. */
function checkBounds(
	elements: ReplicaElement[],
	canvas: ReplicaInput["canvas"],
	warnings: string[],
): void {
	if (!canvas) return;
	for (const el of elements) {
		const xs = el.points ? el.points.map((p) => p[0]) : [el.x, (el.x ?? 0) + (el.width ?? 0)];
		const ys = el.points ? el.points.map((p) => p[1]) : [el.y, (el.y ?? 0) + (el.height ?? 0)];
		const out =
			Math.min(...xs.map((v) => v ?? 0)) < -4 ||
			Math.min(...ys.map((v) => v ?? 0)) < -4 ||
			Math.max(...xs.map((v) => v ?? 0)) > canvas.width + 4 ||
			Math.max(...ys.map((v) => v ?? 0)) > canvas.height + 4;
		if (out) warnings.push(`元素 ${el.id} 超出原图范围 ${canvas.width}x${canvas.height}`);
	}
}

/** Make ids unique so later bindings stay unambiguous. */
function dedupeIds(elements: ReplicaElement[], warnings: string[]): ReplicaElement[] {
	const seen = new Set<string>();
	return elements.map((el) => {
		let id = el.id;
		for (let n = 2; seen.has(id); n++) id = `${el.id}_${n}`;
		if (id !== el.id) warnings.push(`重复 id ${el.id} 已改为 ${id}`);
		seen.add(id);
		return { ...el, id };
	});
}

/**
 * Convert replica input into Excalidraw skeleton JSON preserving the supplied
 * geometry and z-order. Pure function, safe to run on the server.
 */
export function generateReplicaElements(
	input: ReplicaInput,
	options: ReplicaOptions = {},
): ReplicaResult {
	const warnings: string[] = [];
	const roughness = input.sketch === false ? 0 : 1;
	const elements = dedupeIds(input.elements, warnings);
	const shapeIds = new Set(
		elements
			.filter((e) => ["rectangle", "ellipse", "diamond"].includes(e.type))
			.map((e) => e.id),
	);

	checkBounds(elements, input.canvas, warnings);

	const built = elements.flatMap((el) => {
		switch (el.type) {
			case "library":
				return buildLibrary(el, options, warnings);
			case "text":
				return buildText(el, warnings);
			case "line":
			case "arrow":
				return buildLinear(el, roughness, shapeIds, warnings);
			default:
				return buildShape(el, roughness, warnings);
		}
	});

	return {
		elements: built.filter(Boolean) as unknown as SharedRawElement[],
		warnings,
		background: input.canvas?.background ?? "#ffffff",
	};
}

