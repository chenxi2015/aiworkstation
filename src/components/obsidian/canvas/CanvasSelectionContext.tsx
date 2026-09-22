import { createContext, useContext } from "react";

export interface CanvasSelectionState {
	/** Whether the user is actively dragging a marquee selection box */
	isSelecting: boolean;
	/** Number of currently selected canvas nodes */
	selectedNodesCount: number;
}

export const CanvasSelectionContext = createContext<CanvasSelectionState>({
	isSelecting: false,
	selectedNodesCount: 0,
});

export function useCanvasSelection() {
	return useContext(CanvasSelectionContext);
}
