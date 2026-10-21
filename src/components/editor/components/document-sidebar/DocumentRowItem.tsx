import { Feedback } from "@dnd-kit/dom";
import { useDraggable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { memo } from "react";
import {
	EDITOR_DOC_TYPE,
	type EditorDocDragData,
	editorDocRowId,
} from "../../utils/editorDnd";
import { DocRowInner } from "./DocRowInner";
import type { DocRowCommonProps } from "./types";

/** Pinned doc row: Draggable to folders, but excluded from sortable list reordering */
export const PinnedDocRow = memo(function PinnedDocRow(
	props: DocRowCommonProps,
) {
	const { doc } = props;
	const { ref, isDragSource } = useDraggable({
		id: editorDocRowId(doc.id),
		type: EDITOR_DOC_TYPE,
		// Chip handles drag preview; source card does not follow cursor
		plugins: [Feedback.configure({ feedback: "none" })],
		data: {
			kind: "editor-doc",
			docId: doc.id,
			folderId: doc.folderId ?? null,
		} satisfies EditorDocDragData,
	});
	return (
		<div ref={ref} className={isDragSource ? "opacity-40" : undefined}>
			<DocRowInner {...props} />
		</div>
	);
});

export interface SortableDocRowProps extends DocRowCommonProps {
	index: number;
	disabled?: boolean;
}

/** Sortable doc row: Supports reordering within list and dragging to folders */
export const SortableDocRow = memo(function SortableDocRow(
	props: SortableDocRowProps,
) {
	const { doc, index, disabled } = props;
	const { ref, isDragSource } = useSortable({
		id: editorDocRowId(doc.id),
		index,
		disabled,
		// Dual isolation: Only reorders with docs; dragging to folder row won't trigger DOM movement
		type: EDITOR_DOC_TYPE,
		accept: EDITOR_DOC_TYPE,
		group: "editor-doc",
		// Chip handles drag preview; source card does not follow cursor
		plugins: [Feedback.configure({ feedback: "none" })],
		data: {
			kind: "editor-doc",
			docId: doc.id,
			folderId: doc.folderId ?? null,
		} satisfies EditorDocDragData,
	});
	return (
		<div ref={ref} className={isDragSource ? "opacity-40" : undefined}>
			<DocRowInner {...props} />
		</div>
	);
});
