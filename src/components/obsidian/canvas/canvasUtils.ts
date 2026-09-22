export interface CanvasNode {
	id: string;
	type: "text" | "file" | "link" | "group";
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
	text?: string;
	file?: string;
	url?: string;
	label?: string;
}

export interface CanvasEdge {
	id: string;
	fromNode: string;
	fromSide?: "top" | "right" | "bottom" | "left";
	toNode: string;
	toSide?: "top" | "right" | "bottom" | "left";
	color?: string;
	label?: string;
	fromEnd?: "none" | "arrow";
	toEnd?: "none" | "arrow";
}

export interface CanvasData {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}

/** Obsidian canvas color presets (1-6) */
export const COLOR_PRESETS: Record<string, string> = {
	"1": "#e03131",
	"2": "#f08c00",
	"3": "#eab308",
	"4": "#37b24d",
	"5": "#0ca678",
	"6": "#7048e8",
};

/** Resolve preset color id or hex string */
export function resolveColor(color?: string): string | undefined {
	if (!color) return undefined;
	return COLOR_PRESETS[color] ?? (color.startsWith("#") ? color : undefined);
}

/**
 * Converts a hex or rgba/rgb color string into an rgba string with the specified alpha.
 */
export function colorToAlpha(color: string, alpha: number): string {
	if (color.startsWith("#")) {
		let hex = color.slice(1);
		if (hex.length === 3) {
			hex = hex
				.split("")
				.map((c) => c + c)
				.join("");
		}
		const r = parseInt(hex.slice(0, 2), 16);
		const g = parseInt(hex.slice(2, 4), 16);
		const b = parseInt(hex.slice(4, 6), 16);
		if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
			return `rgba(${r}, ${g}, ${b}, ${alpha})`;
		}
	}
	if (color.startsWith("rgba(")) {
		return color.replace(/[\d.]+\)$/, `${alpha})`);
	}
	if (color.startsWith("rgb(")) {
		return color.replace("rgb(", "rgba(").replace(/\)$/, `, ${alpha})`);
	}
	return color;
}

export type Side = NonNullable<CanvasEdge["fromSide"]>;

/** Guess optimal sides based on node center orientation */
export function guessSides(
	from: CanvasNode,
	to: CanvasNode,
): { fromSide: Side; toSide: Side } {
	const fx = from.x + from.width / 2;
	const fy = from.y + from.height / 2;
	const tx = to.x + to.width / 2;
	const ty = to.y + to.height / 2;
	const dx = tx - fx;
	const dy = ty - fy;
	if (Math.abs(dx) >= Math.abs(dy)) {
		return dx >= 0
			? { fromSide: "right", toSide: "left" }
			: { fromSide: "left", toSide: "right" };
	}
	return dy >= 0
		? { fromSide: "bottom", toSide: "top" }
		: { fromSide: "top", toSide: "bottom" };
}
