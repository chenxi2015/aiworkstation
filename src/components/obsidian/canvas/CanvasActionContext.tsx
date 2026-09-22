import { createContext, useContext } from "react";
import type { AlignmentType } from "./canvasAlignment";

export interface CanvasActionContextValue {
	// Node operations
	deleteNode: (id: string) => void;
	batchDeleteNodes: (ids: string[]) => void;
	setNodeColor: (id: string, color: string | undefined) => void;
	batchSetNodeColor: (ids: string[], color: string | undefined) => void;
	startEdit: (id: string) => void;
	commitText: (id: string, text: string) => void;
	commitLabel: (id: string, label: string) => void;
	alignGroupChildren: (groupId: string, type: AlignmentType) => void;
	createGroupFromSelection: (
		ids: string[],
		box: { minX: number; minY: number; width: number; height: number },
	) => void;
	alignSelectedNodes: (type: AlignmentType) => void;
	onNavigateNote?: (relPath: string) => void;

	// Edge operations
	deleteEdge: (id: string) => void;
	setEdgeColor: (id: string, color: string | undefined) => void;
	setEdgeDirection: (
		id: string,
		direction: "none" | "one-way" | "bidirectional",
	) => void;
	clearEdgeLabel: (id: string) => void;
	startEditEdge: (id: string) => void;
	commitEdgeLabel: (id: string, label: string) => void;
}

export const CanvasActionContext =
	createContext<CanvasActionContextValue | null>(null);

/**
 * Hook to access canvas node and edge actions from anywhere inside the CanvasFlow
 */
export function useCanvasActions(): CanvasActionContextValue {
	const ctx = useContext(CanvasActionContext);
	if (!ctx) {
		throw new Error(
			"useCanvasActions must be used within a CanvasActionContext.Provider",
		);
	}
	return ctx;
}
