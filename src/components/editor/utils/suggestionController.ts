import type { Editor } from "@tiptap/core";

export interface ActiveSuggestionInfo {
	id: string;
	from: number;
	to: number;
}

/**
 * Controller for managing AI inline suggestion diffs (Delete vs Insert)
 */
export const SuggestionController = {
	/**
	 * Insert an inline suggestion diff into the editor at current range
	 */
	applyDiff(
		editor: Editor,
		range: { from: number; to: number },
		newText: string,
		suggestionId = `sug_${Date.now()}`,
	): ActiveSuggestionInfo | null {
		const { from, to } = range;
		if (from === to && !newText) return null;

		const { state, view } = editor;
		const { tr } = state;

		// 1. Mark original text with suggestionDelete
		if (from < to) {
			const deleteMark = state.schema.marks.suggestionDelete?.create({
				suggestionId,
			});
			if (deleteMark) {
				tr.addMark(from, to, deleteMark);
			}
		}

		// 2. Prepare inserted text with suggestionInsert mark
		const insertMark = state.schema.marks.suggestionInsert?.create({
			suggestionId,
		});
		const marks = insertMark ? [insertMark] : [];

		// If newText has line breaks, split and insert gracefully
		const lines = newText.split("\n");
		if (lines.length === 1) {
			const textNode = state.schema.text(lines[0], marks);
			// Insert immediately after original deleted block
			tr.insert(to, textNode);
		} else {
			// Multi-line insertion: create paragraph nodes with insert mark
			const nodes = lines.map((line) =>
				line.trim()
					? state.schema.nodes.paragraph.create(
							null,
							state.schema.text(line, marks),
						)
					: state.schema.nodes.paragraph.create(),
			);
			tr.insert(to, nodes);
		}

		// Dispatch transaction
		view.dispatch(tr);

		return {
			id: suggestionId,
			from,
			to: editor.state.selection.to,
		};
	},

	/**
	 * Accept suggestion: remove deleted original text and unmark inserted text
	 */
	accept(editor: Editor, suggestionId: string): void {
		const { state, view } = editor;
		const { doc, tr } = state;

		const deleteRanges: { from: number; to: number }[] = [];
		const insertRanges: { from: number; to: number }[] = [];

		doc.descendants((node, pos) => {
			if (!node.isText) return;
			for (const mark of node.marks) {
				if (
					mark.type.name === "suggestionDelete" &&
					(!suggestionId || mark.attrs.suggestionId === suggestionId)
				) {
					deleteRanges.push({ from: pos, to: pos + node.nodeSize });
				}
				if (
					mark.type.name === "suggestionInsert" &&
					(!suggestionId || mark.attrs.suggestionId === suggestionId)
				) {
					insertRanges.push({ from: pos, to: pos + node.nodeSize });
				}
			}
		});

		// 1. Unmark insert ranges so they become normal text
		for (const range of insertRanges) {
			tr.removeMark(range.from, range.to, state.schema.marks.suggestionInsert);
		}

		// 2. Delete the original text ranges (in reverse order to keep positions valid)
		deleteRanges.sort((a, b) => b.from - a.from);
		for (const range of deleteRanges) {
			tr.delete(range.from, range.to);
		}

		if (tr.docChanged) {
			view.dispatch(tr);
		}
	},

	/**
	 * Reject suggestion: remove inserted suggestion text and restore original text
	 */
	reject(editor: Editor, suggestionId: string): void {
		const { state, view } = editor;
		const { doc, tr } = state;

		const deleteRanges: { from: number; to: number }[] = [];
		const insertRanges: { from: number; to: number }[] = [];

		doc.descendants((node, pos) => {
			if (!node.isText) return;
			for (const mark of node.marks) {
				if (
					mark.type.name === "suggestionDelete" &&
					(!suggestionId || mark.attrs.suggestionId === suggestionId)
				) {
					deleteRanges.push({ from: pos, to: pos + node.nodeSize });
				}
				if (
					mark.type.name === "suggestionInsert" &&
					(!suggestionId || mark.attrs.suggestionId === suggestionId)
				) {
					insertRanges.push({ from: pos, to: pos + node.nodeSize });
				}
			}
		});

		// 1. Remove inserted text ranges (in reverse order)
		insertRanges.sort((a, b) => b.from - a.from);
		for (const range of insertRanges) {
			tr.delete(range.from, range.to);
		}

		// 2. Unmark deleted original text so it restores to normal text
		for (const range of deleteRanges) {
			tr.removeMark(range.from, range.to, state.schema.marks.suggestionDelete);
		}

		if (tr.docChanged) {
			view.dispatch(tr);
		}
	},

	/**
	 * Detect if there is any active suggestion mark in the document
	 */
	detectActiveSuggestion(editor: Editor): ActiveSuggestionInfo | null {
		const { doc } = editor.state;
		let foundId: string | null = null;
		let minPos = Infinity;
		let maxPos = -1;

		doc.descendants((node, pos) => {
			if (!node.isText) return;
			for (const mark of node.marks) {
				if (
					mark.type.name === "suggestionDelete" ||
					mark.type.name === "suggestionInsert"
				) {
					foundId = mark.attrs.suggestionId || "default";
					minPos = Math.min(minPos, pos);
					maxPos = Math.max(maxPos, pos + node.nodeSize);
				}
			}
		});

		if (!foundId || maxPos === -1) return null;

		return {
			id: foundId,
			from: minPos,
			to: maxPos,
		};
	},

	/**
	 * Compute screen coordinates for floating review bar at bottom of suggestion
	 */
	getFloatingCoordinates(
		editor: Editor,
		suggestionId?: string,
	): { top: number; left: number } | null {
		const { doc } = editor.state;
		let maxPos = -1;
		let minPos = Infinity;

		doc.descendants((node, pos) => {
			if (!node.isText) return;
			const isMatch = node.marks.some(
				(m) =>
					(m.type.name === "suggestionDelete" ||
						m.type.name === "suggestionInsert") &&
					(!suggestionId || m.attrs.suggestionId === suggestionId),
			);
			if (isMatch) {
				minPos = Math.min(minPos, pos);
				maxPos = Math.max(maxPos, pos + node.nodeSize);
			}
		});

		if (maxPos === -1) return null;

		try {
			const coords = editor.view.coordsAtPos(maxPos);
			const startCoords = editor.view.coordsAtPos(minPos);
			return {
				top: coords.bottom + 10,
				left: (startCoords.left + coords.right) / 2,
			};
		} catch {
			return null;
		}
	},
};
