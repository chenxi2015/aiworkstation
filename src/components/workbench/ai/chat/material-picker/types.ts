import type { ChatContextItem } from "../../../../../types/chatContext";
import type { Material } from "../../../../creator/types";

export interface MaterialLibraryPickerProps {
	isOpen: boolean;
	onClose: () => void;
	/** Callback when a single material is picked */
	onPick: (item: ChatContextItem) => void;
	/** Optional callback when multiple materials are picked */
	onPickBatch?: (items: ChatContextItem[]) => void;
	/** Maximum selectable count based on remaining quota */
	maxSelectable?: number;
}

export type PreviewState =
	| { kind: "video"; material: Material }
	| { kind: "image"; material: Material }
	| { kind: "audio"; material: Material }
	| { kind: "doc"; material: Material }
	| null;

