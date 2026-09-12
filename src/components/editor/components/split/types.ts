import type { Editor } from "@tiptap/core";

export interface SplitCompareViewProps {
	/** Original main editor instance */
	leftEditor: Editor;
	/** Document title */
	docTitle?: string;
	/** Document id for media context */
	docId: number;
	/** Style preset reference for AI */
	stylePreset?: string;
	/** Rewrite prompt / instruction (e.g. "精简这篇文章") */
	instruction?: string;
	/** Rewrite action / mode label (e.g. "二创洗稿", "扩写") */
	modeLabel?: string;
	/** Callback when user accepts the revised version */
	onAccept: (cleanDocJson: any) => void;
	/** Callback when user rejects/exits split compare */
	onCancel: () => void;
}

export interface DocBlock {
	id: string;
	type: "text" | "image" | "video" | "other";
	nodeType: string;
	attrs?: Record<string, any>;
	originalText: string;
	revisedText: string;
	aiRevisedText?: string;
	status: "pending" | "streaming" | "done";
	textIndex?: number;
}

export type ViewMode = "diff" | "clean";
