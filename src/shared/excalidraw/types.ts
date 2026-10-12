/**
 * Shared Excalidraw draw-input types, dependency-free so both the client
 * rendering view and the server-side headless executor can use them.
 */

export interface SharedExcalidrawElementInput {
	id: string;
	type?: "rectangle" | "ellipse" | "diamond" | "text";
	label: string;
	color?: "blue" | "green" | "yellow" | "red" | "purple" | "gray" | "default";
	strokeWidth?: 1 | 2 | 4;
}

export interface SharedExcalidrawConnectionInput {
	from: string;
	to: string;
	label?: string;
	style?: "solid" | "dashed";
}

export interface SharedExcalidrawDrawInput {
	layout?:
		| "horizontal_flow"
		| "vertical_flow"
		| "architecture_layers"
		| "grid"
		| "free";
	mode?: "append" | "replace";
	elements: SharedExcalidrawElementInput[];
	connections?: SharedExcalidrawConnectionInput[];
}

export interface SharedNodePosition {
	x: number;
	y: number;
	width: number;
	height: number;
	type?: string;
}

export interface SharedLayoutOptions {
	startX: number;
	startY: number;
}

export type SharedLayoutStrategy = (
	elements: SharedExcalidrawElementInput[],
	connections: SharedExcalidrawConnectionInput[],
	options: SharedLayoutOptions,
) => Map<string, SharedNodePosition>;

/** Minimal structural shape of an Excalidraw element for headless generation. */
export interface SharedRawElement {
	id: string;
	type: string;
	x: number;
	y: number;
	width?: number;
	height?: number;
	[key: string]: unknown;
}
