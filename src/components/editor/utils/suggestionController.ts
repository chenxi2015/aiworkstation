import type { Editor } from "@tiptap/core";
import { buildNodesFromDiff, computeFineDiff } from "./diffHelper";

export interface ActiveSuggestionInfo {
	id: string;
	from: number;
	to: number;
	isStreaming?: boolean;
}

/**
 * Controller for managing AI inline suggestion diffs (Delete vs Insert)
 */
export const SuggestionController = {
	/**
	 * Insert a fine-grained word/paragraph diff into the editor at current range
	 */
	applyFineDiff(
		editor: Editor,
		range: { from: number; to: number },
		oldText: string,
		newText: string,
		suggestionId = `sug_${Date.now()}`,
	): ActiveSuggestionInfo | null {
		const { from, to } = range;
		const { state, view } = editor;
		const { tr } = state;

		const segments = computeFineDiff(oldText, newText);
		const nodes = buildNodesFromDiff(state.schema, segments, suggestionId);

		tr.replaceWith(from, to, nodes);

		if (tr.docChanged) {
			view.dispatch(tr);
		}

		return {
			id: suggestionId,
			from,
			to: from + nodes.reduce((sum, n) => sum + n.nodeSize, 0),
		};
	},

	/**
	 * Start a streaming suggestion in editor
	 */
	startStreaming(
		editor: Editor,
		range: { from: number; to: number },
		_oldText: string,
		suggestionId = `sug_${Date.now()}`,
	): ActiveSuggestionInfo | null {
		const { from, to } = range;
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

		// 2. Insert initial empty streaming paragraph with insert mark
		const insertMark = state.schema.marks.suggestionInsert?.create({
			suggestionId,
		});
		const initialTextNode = state.schema.text(
			"▍",
			insertMark ? [insertMark] : [],
		);
		tr.insert(to, initialTextNode);

		view.dispatch(tr);

		return {
			id: suggestionId,
			from,
			to: to + initialTextNode.nodeSize,
			isStreaming: true,
		};
	},

	/**
	 * Update streaming suggestion content during streaming
	 */
	updateStreaming(
		editor: Editor,
		suggestionId: string,
		streamedText: string,
	): void {
		const { state, view } = editor;
		const { doc, tr } = state;

		// Find the range of the current streamed text (has suggestionInsert mark)
		let insertFrom = -1;
		let insertTo = -1;

		doc.descendants((node, pos) => {
			if (!node.isText) return;
			const isInsert = node.marks.some(
				(m) =>
					m.type.name === "suggestionInsert" &&
					m.attrs.suggestionId === suggestionId,
			);
			if (isInsert) {
				if (insertFrom === -1) insertFrom = pos;
				insertTo = pos + node.nodeSize;
			}
		});

		if (insertFrom === -1 || insertTo === -1) return;

		const insertMark = state.schema.marks.suggestionInsert?.create({
			suggestionId,
		});
		const marks = insertMark ? [insertMark] : [];

		const lines = streamedText.split("\n");
		if (lines.length === 1) {
			const textNode = state.schema.text(`${lines[0]}▍`, marks);
			tr.replaceWith(insertFrom, insertTo, textNode);
		} else {
			const nodes = lines.map((line, idx) => {
				const isLast = idx === lines.length - 1;
				const content = isLast ? `${line}▍` : line;
				return content.trim()
					? state.schema.nodes.paragraph.create(
							null,
							state.schema.text(content, marks),
						)
					: state.schema.nodes.paragraph.create();
			});
			tr.replaceWith(insertFrom, insertTo, nodes);
		}

		if (tr.docChanged) {
			view.dispatch(tr);
		}
	},

	/**
	 * Finalize streaming suggestion with fine-grained diff
	 */
	finalizeStreaming(
		editor: Editor,
		suggestionId: string,
		oldText: string,
		finalNewText: string,
	): ActiveSuggestionInfo | null {
		const { state, view } = editor;
		const { doc, tr } = state;

		// Find the full span of this suggestion (both delete and insert ranges)
		let minPos = Infinity;
		let maxPos = -1;

		doc.descendants((node, pos) => {
			if (!node.isText) return;
			const isMatch = node.marks.some(
				(m) =>
					(m.type.name === "suggestionDelete" ||
						m.type.name === "suggestionInsert") &&
					m.attrs.suggestionId === suggestionId,
			);
			if (isMatch) {
				minPos = Math.min(minPos, pos);
				maxPos = Math.max(maxPos, pos + node.nodeSize);
			}
		});

		if (minPos === Infinity || maxPos === -1) return null;

		// Replace the entire temporary range with fine-grained diff
		const segments = computeFineDiff(oldText, finalNewText);
		const nodes = buildNodesFromDiff(state.schema, segments, suggestionId);

		tr.replaceWith(minPos, maxPos, nodes);

		if (tr.docChanged) {
			view.dispatch(tr);
		}

		return {
			id: suggestionId,
			from: minPos,
			to: minPos + nodes.reduce((sum, n) => sum + n.nodeSize, 0),
			isStreaming: false,
		};
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

		// 1. Unmark deleted original text so it restores to normal text first
		// Must be done before deleting insertRanges, otherwise document positions shift and become out of range
		for (const range of deleteRanges) {
			tr.removeMark(range.from, range.to, state.schema.marks.suggestionDelete);
		}

		// 2. Remove inserted text ranges (in reverse order to keep preceding positions valid)
		insertRanges.sort((a, b) => b.from - a.from);
		for (const range of insertRanges) {
			tr.delete(range.from, range.to);
		}

		if (tr.docChanged) {
			view.dispatch(tr);
		}
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
