import type { JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/react";

/**
 * 主题色替换工具：直接在 TipTap/ProseMirror 文档上收集与批量替换颜色。
 *
 * 颜色在文档中的三处藏身点：
 * 1. textStyle mark 的 color / backgroundColor 属性（编辑器内主动设置的颜色）
 * 2. 节点 attrs.style 内联 CSS（公众号导入的 <p style="...">、styledContainer 等）
 * 3. 行内 mark attrs.style 内联 CSS（<strong style="...">、<a style="..."> 等）
 *
 * 所有替换在单个 ProseMirror transaction 中完成 = 一次 undo 即可整体回退。
 */

export interface Rgba {
	r: number;
	g: number;
	b: number;
	a: number;
}

export interface DocumentColorEntry {
	/** 归一化后的 hex（小写 #rrggbb），用于展示与替换定位 */
	hex: string;
	/** 出现次数（一个 token 算一次） */
	count: number;
}

/** CSS 颜色 token：#rgb / #rgba / #rrggbb / #rrggbbaa / rgb() / rgba() */
const CSS_COLOR_TOKEN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;

/** 默认匹配容差（RGB 欧氏距离）。用于合并 hex 与 rgb() 的等价写法及近色。 */
const DEFAULT_TOLERANCE = 24;

export function parseColor(token: string | null | undefined): Rgba | null {
	if (!token) return null;
	const value = token.trim().toLowerCase();

	if (value.startsWith("#")) {
		const hex = value.slice(1);
		if (/^[0-9a-f]{3,4}$/.test(hex)) {
			const [r, g, b, a] = hex.split("").map((c) => parseInt(c + c, 16));
			return { r, g, b, a: hex.length === 4 ? (a ?? 255) / 255 : 1 };
		}
		if (/^[0-9a-f]{6}$/.test(hex) || /^[0-9a-f]{8}$/.test(hex)) {
			const r = parseInt(hex.slice(0, 2), 16);
			const g = parseInt(hex.slice(2, 4), 16);
			const b = parseInt(hex.slice(4, 6), 16);
			const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
			return { r, g, b, a };
		}
		return null;
	}

	const rgbMatch = value.match(/^rgba?\(([^)]*)\)$/);
	if (rgbMatch) {
		const parts = rgbMatch[1]
			.split(/[\s,/]+/)
			.filter(Boolean)
			.map(Number);
		if (parts.length >= 3 && parts.slice(0, 3).every((n) => !Number.isNaN(n))) {
			return {
				r: parts[0],
				g: parts[1],
				b: parts[2],
				a: parts.length >= 4 && !Number.isNaN(parts[3]) ? parts[3] : 1,
			};
		}
	}
	return null;
}

export function rgbaToHex({ r, g, b }: Rgba): string {
	const to2 = (n: number) =>
		Math.round(Math.max(0, Math.min(255, n)))
			.toString(16)
			.padStart(2, "0");
	return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/** 归一化任意 CSS 颜色 token 为小写 hex；无法解析时返回 null */
export function normalizeColor(
	token: string | null | undefined,
): string | null {
	const rgba = parseColor(token);
	return rgba ? rgbaToHex(rgba) : null;
}

function colorDistance(a: Rgba, b: Rgba): number {
	return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function colorsMatch(token: string, target: Rgba, tolerance: number): boolean {
	const rgba = parseColor(token);
	if (!rgba) return false;
	// 半透明色不参与主题色替换（多为遮罩/阴影）
	if (rgba.a < 0.98) return false;
	return colorDistance(rgba, target) <= tolerance;
}

/**
 * 替换一段内联 CSS 字符串中所有匹配 target 的颜色 token。
 * 返回 null 表示没有任何替换。
 */
export function replaceColorInStyle(
	style: string,
	target: Rgba,
	toHex: string,
	tolerance = DEFAULT_TOLERANCE,
): string | null {
	let changed = false;
	const next = style.replace(CSS_COLOR_TOKEN, (token) => {
		if (colorsMatch(token, target, tolerance)) {
			changed = true;
			return toHex;
		}
		return token;
	});
	return changed ? next : null;
}

/** 提取一段内联 CSS 字符串中出现的所有（归一化）颜色 */
function extractColorsFromStyle(style: string): string[] {
	const tokens = style.match(CSS_COLOR_TOKEN) || [];
	const result: string[] = [];
	for (const token of tokens) {
		const hex = normalizeColor(token);
		if (hex) result.push(hex);
	}
	return result;
}

/**
 * 扫描整篇文档，聚合出现过的所有颜色（textStyle mark + 节点/mark 的 style 字符串）。
 * 按出现次数降序返回。
 */
export function collectDocumentColors(doc: JSONContent): DocumentColorEntry[] {
	const counts = new Map<string, number>();
	const bump = (hex: string | null | undefined) => {
		if (!hex) return;
		counts.set(hex, (counts.get(hex) || 0) + 1);
	};

	const walk = (node: JSONContent) => {
		if (Array.isArray(node.marks)) {
			for (const mark of node.marks) {
				if (mark.type === "textStyle" && mark.attrs) {
					bump(normalizeColor(mark.attrs.color as string | undefined));
					bump(
						normalizeColor(mark.attrs.backgroundColor as string | undefined),
					);
				}
				if (typeof mark.attrs?.style === "string") {
					for (const hex of extractColorsFromStyle(mark.attrs.style)) {
						bump(hex);
					}
				}
			}
		}
		if (typeof node.attrs?.style === "string") {
			for (const hex of extractColorsFromStyle(node.attrs.style)) {
				bump(hex);
			}
		}
		if (Array.isArray(node.content)) {
			for (const child of node.content) walk(child);
		}
	};
	walk(doc);

	return Array.from(counts.entries())
		.map(([hex, count]) => ({ hex, count }))
		.sort((a, b) => b.count - a.count);
}

export interface ReplaceThemeColorResult {
	/** 发生替换的颜色 token 总数 */
	replacements: number;
	/** 是否有任何改动（无改动时不会产生事务/undo 记录） */
	changed: boolean;
}

/**
 * 把文档中所有匹配 fromHex 的颜色替换为 toHex。
 * 覆盖 textStyle mark 的 color/backgroundColor、节点 style、行内 mark style。
 * 整个替换合并为单个 transaction（单次撤销即可回退）。
 */
export function replaceThemeColor(
	editor: Editor,
	fromHex: string,
	toHex: string,
	tolerance = DEFAULT_TOLERANCE,
): ReplaceThemeColorResult {
	const target = parseColor(fromHex);
	const normalizedTo = normalizeColor(toHex);
	if (!target || !normalizedTo) return { replacements: 0, changed: false };

	const { state, schema } = editor;
	const tr = state.tr;
	let replacements = 0;

	const countMatches = (style: string): number => {
		const tokens = style.match(CSS_COLOR_TOKEN) || [];
		return tokens.filter((t) => colorsMatch(t, target, tolerance)).length;
	};

	state.doc.descendants((node, pos) => {
		// 1. 节点 attrs.style（styledContainer / paragraph / heading / image 等）
		if (typeof node.attrs?.style === "string" && node.attrs.style) {
			const nextStyle = replaceColorInStyle(
				node.attrs.style,
				target,
				normalizedTo,
				tolerance,
			);
			if (nextStyle !== null) {
				replacements += countMatches(node.attrs.style);
				tr.setNodeMarkup(pos, undefined, {
					...node.attrs,
					style: nextStyle,
				});
			}
		}

		// 2. 行内 marks：textStyle 的 color/backgroundColor + mark attrs.style
		for (const mark of node.marks) {
			if (mark.type === schema.marks.textStyle) {
				const attrs = { ...mark.attrs };
				let markChanged = false;
				for (const key of ["color", "backgroundColor"] as const) {
					const value = attrs[key];
					if (
						typeof value === "string" &&
						colorsMatch(value, target, tolerance)
					) {
						attrs[key] = normalizedTo;
						markChanged = true;
						replacements += 1;
					}
				}
				if (typeof attrs.style === "string" && attrs.style) {
					const nextStyle = replaceColorInStyle(
						attrs.style,
						target,
						normalizedTo,
						tolerance,
					);
					if (nextStyle !== null) {
						replacements += countMatches(attrs.style);
						attrs.style = nextStyle;
						markChanged = true;
					}
				}
				if (markChanged) {
					tr.addMark(pos, pos + node.nodeSize, mark.type.create(attrs));
				}
			} else if (typeof mark.attrs?.style === "string" && mark.attrs.style) {
				const nextStyle = replaceColorInStyle(
					mark.attrs.style,
					target,
					normalizedTo,
					tolerance,
				);
				if (nextStyle !== null) {
					replacements += countMatches(mark.attrs.style);
					tr.addMark(
						pos,
						pos + node.nodeSize,
						mark.type.create({ ...mark.attrs, style: nextStyle }),
					);
				}
			}
		}
		return true;
	});

	if (replacements === 0) return { replacements: 0, changed: false };
	editor.view.dispatch(tr);
	return { replacements, changed: true };
}
