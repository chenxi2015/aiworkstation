import type { Editor } from "@tiptap/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { markdownToHtml } from "../../../markdown";
import {
	buildHighlightedMarkdown,
	computeDiffWordDelta,
	markdownToPlainText,
} from "../../../utils/diffHelper";
import type { DocumentVersion, ViewMode } from "../types";
import { applyVersionContent } from "../utils";

export interface UseSplitDiffOptions {
	activeLeftVersion: DocumentVersion;
	activeRightVersion: DocumentVersion;
	leftVersionId: string;
	rightVersionId: string;
	initialBaseMarkdown: string;
	leftPreviewEditor: Editor | null;
	rightEditor: Editor | null;
	isStreaming: boolean;
	rightWordCount: number;
}

export function useSplitDiff({
	activeLeftVersion,
	activeRightVersion,
	leftVersionId,
	rightVersionId,
	initialBaseMarkdown,
	leftPreviewEditor,
	rightEditor,
	isStreaming,
	rightWordCount,
}: UseSplitDiffOptions) {
	const [diffViewMode, setDiffViewMode] = useState<ViewMode>("clean");

	// Compute Diff Highlighting strings and accurate word delta between left and right versions
	const diffStrings = useMemo(() => {
		if (diffViewMode !== "diff") {
			return { leftHighlighted: "", rightHighlighted: "", diffDelta: 0 };
		}
		const leftMd = activeLeftVersion?.content || "";
		const rightMd = activeRightVersion?.content || "";
		const leftHighlighted = buildHighlightedMarkdown(leftMd, rightMd, "base");
		const rightHighlighted = buildHighlightedMarkdown(
			leftMd,
			rightMd,
			"revised",
		);
		const diffDelta = computeDiffWordDelta(leftMd, rightMd);
		return { leftHighlighted, rightHighlighted, diffDelta };
	}, [diffViewMode, activeLeftVersion, activeRightVersion]);

	// Synchronize left & right editor contents between clean and diff highlighting modes
	const lastAppliedModeRef = useRef<ViewMode>("clean");
	const lastAppliedLeftVerRef = useRef<string>("v0");
	const lastAppliedRightVerRef = useRef<string>("v_draft");

	useEffect(() => {
		if (isStreaming) return;

		const modeChanged = lastAppliedModeRef.current !== diffViewMode;
		const leftVerChanged = lastAppliedLeftVerRef.current !== leftVersionId;
		const rightVerChanged = lastAppliedRightVerRef.current !== rightVersionId;

		if (!modeChanged && !leftVerChanged && !rightVerChanged) {
			return;
		}

		lastAppliedModeRef.current = diffViewMode;
		lastAppliedLeftVerRef.current = leftVersionId;
		lastAppliedRightVerRef.current = rightVersionId;

		if (diffViewMode === "diff") {
			// Diff mode: apply diff highlights and freeze right editor from manual typing
			if (leftPreviewEditor && diffStrings.leftHighlighted) {
				const html = markdownToHtml(diffStrings.leftHighlighted);
				leftPreviewEditor.commands.setContent(html || "<p></p>", {
					emitUpdate: false,
				});
			}
			if (rightEditor && diffStrings.rightHighlighted) {
				const html = markdownToHtml(diffStrings.rightHighlighted);
				rightEditor.commands.setContent(html || "<p></p>", {
					emitUpdate: false,
				});
				rightEditor.setEditable(false);
			}
		} else {
			// Clean mode: restore clean rich text content and re-enable editing
			if (leftPreviewEditor && activeLeftVersion) {
				applyVersionContent(leftPreviewEditor, activeLeftVersion);
			}
			if (rightEditor) {
				if (activeRightVersion) {
					applyVersionContent(rightEditor, activeRightVersion);
				}
				rightEditor.setEditable(true);
			}
		}
	}, [
		diffViewMode,
		leftVersionId,
		rightVersionId,
		diffStrings.leftHighlighted,
		diffStrings.rightHighlighted,
		activeLeftVersion,
		activeRightVersion,
		leftPreviewEditor,
		rightEditor,
		isStreaming,
	]);

	// Check if right canvas has substantial changes compared to the base text
	const hasSubstantialChanges = useMemo(() => {
		const rightPlain = markdownToPlainText(
			activeRightVersion?.content || "",
		).trim();
		if (!rightPlain) return false;
		const basePlain = markdownToPlainText(
			activeLeftVersion?.content || initialBaseMarkdown,
		).trim();
		return rightPlain !== basePlain;
	}, [
		activeRightVersion?.content,
		activeLeftVersion?.content,
		initialBaseMarkdown,
	]);

	const canAccept = hasSubstantialChanges && !isStreaming;
	const canSaveAsNew = rightWordCount > 0 && !isStreaming;

	return {
		diffViewMode,
		setDiffViewMode,
		diffStrings,
		hasSubstantialChanges,
		canAccept,
		canSaveAsNew,
	};
}
