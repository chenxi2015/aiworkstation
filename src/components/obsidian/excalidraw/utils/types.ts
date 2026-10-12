import type {
	ExcalidrawConnectionInput,
	ExcalidrawElementInput,
} from "../../types";

export interface NodePosition {
	x: number;
	y: number;
	width: number;
	height: number;
	type?: string;
}

export interface LayoutOptions {
	startX: number;
	startY: number;
}

export type LayoutStrategy = (
	elements: ExcalidrawElementInput[],
	connections: ExcalidrawConnectionInput[],
	options: LayoutOptions,
) => Map<string, NodePosition>;
