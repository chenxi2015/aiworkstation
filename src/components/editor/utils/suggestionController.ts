import type { Editor } from "@tiptap/core";
import type { Slice } from "@tiptap/pm/model";
import {
	buildInlineNodesFromDiff,
	buildNodesFromDiff,
	computeFineDiff,
} from "./diffHelper";

export interface ActiveSuggestionInfo {
	id: string;
	from: number;
	to: number;
	isStreaming?: boolean;
}

interface SuggestionSnapshot {
	id: string;
	from: number;
	to: number;
	slice: Slice;
}

/** In-memory snapshot map for pristine document slice restoration */
const suggestionSnapshots = new Map<string, SuggestionSnapshot>();

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

		// 1. Snapshot pristine slice before any mutation for lossless rejection
		const originalSlice = state.doc.slice(from, to);
		suggestionSnapshots.set(suggestionId, {
			id: suggestionId,
			from,
			to,
			slice: originalSlice,
		});

		const $from = state.doc.resolve(from);
		const $to = state.doc.resolve(to);
		// Strictly require both oldText and newText to have NO newlines for inline diff
		const hasMultipleBlocks = oldText.includes("\n") || newText.includes("\n");
		const isInlineDiff =
			!hasMultipleBlocks && $from.sameParent($to) && $from.parent.isTextblock;

		const segments = computeFineDiff(oldText, newText);
		const nodes = isInlineDiff
			? buildInlineNodesFromDiff(state.schema, segments, suggestionId)
			: buildNodesFromDiff(state.schema, segments, suggestionId);

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
	 * Start a streaming suggestion in editor directly beneath the target paragraph block.
	 * Keeps original text clean and untouched during streaming.
	 */
	startStreaming(
		editor: Editor,
		range: { from: number; to: number },
		_oldText: string,
		suggestionId = `sug_${Date.now()}`,
	): ActiveSuggestionInfo | null {
		const { to } = range;
		const { state, view } = editor;
		const { tr } = state;

		// 1. Insert initial streaming paragraph directly after target block with isStreaming flag
		const insertMark = state.schema.marks.suggestionInsert?.create({
			suggestionId,
			isStreaming: true,
		});
		const initialTextNode = state.schema.text(
			"▍",
			insertMark ? [insertMark] : [],
		);
		const streamingParagraph = state.schema.nodes.paragraph.create(
			null,
			initialTextNode,
		);

		tr.insert(to, streamingParagraph);
		view.dispatch(tr);

		return {
			id: suggestionId,
			from: to,
			to: to + streamingParagraph.nodeSize,
			isStreaming: true,
		};
	},

	/**
	 * Update streaming suggestion content word by word during streaming
	 */
	updateStreaming(
		editor: Editor,
		suggestionId: string,
		streamedText: string,
	): void {
		const { state, view } = editor;
		const { doc, tr } = state;

		// Find the range of the current streamed text
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
			isStreaming: true,
		});
		const marks = insertMark ? [insertMark] : [];

		const content = `${streamedText || ""}▍`;
		const textNode = state.schema.text(content, marks);
		tr.replaceWith(insertFrom, insertTo, textNode);

		if (tr.docChanged) {
			view.dispatch(tr);
		}
	},

	/**
	 * Finalize streaming suggestion: convert original text and completed stream into fine-grained diff
	 */
	finalizeStreaming(
		editor: Editor,
		suggestionId: string,
		oldRange: { from: number; to: number },
		oldText: string,
		finalNewText: string,
	): ActiveSuggestionInfo | null {
		const { state, view } = editor;
		const { doc, tr } = state;

		// Find the end boundary of the streaming paragraph
		let streamEndPos = oldRange.to;

		doc.descendants((node, pos) => {
			if (!node.isText) return;
			const isMatch = node.marks.some(
				(m) =>
					m.type.name === "suggestionInsert" &&
					m.attrs.suggestionId === suggestionId,
			);
			if (isMatch) {
				streamEndPos = Math.max(streamEndPos, pos + node.nodeSize);
			}
		});

		// Find the enclosing block end of streamEndPos if it's inside a paragraph
		const $streamEnd = doc.resolve(Math.min(streamEndPos, doc.content.size));
		const replaceEnd =
			$streamEnd.parent.isBlock && $streamEnd.depth > 0
				? $streamEnd.after()
				: streamEndPos;

		// Replace original paragraph + streaming paragraph with fine-grained diff
		const segments = computeFineDiff(oldText, finalNewText);
		const nodes = buildNodesFromDiff(state.schema, segments, suggestionId);

		tr.replaceWith(oldRange.from, replaceEnd, nodes);

		if (tr.docChanged) {
			view.dispatch(tr);
		}

		return {
			id: suggestionId,
			from: oldRange.from,
			to: oldRange.from + nodes.reduce((sum, n) => sum + n.nodeSize, 0),
			isStreaming: false,
		};
	},

	/**
	 * Detect if there is any active suggestion mark ready for review in the document
	 * Ignores in-progress streaming marks to prevent premature popups
	 */
	detectActiveSuggestion(editor: Editor): ActiveSuggestionInfo | null {
		const { doc } = editor.state;
		let foundId: string | null = null;
		let minPos = Infinity;
		let maxPos = -1;
		let hasStreamingMark = false;

		doc.descendants((node, pos) => {
			if (!node.isText) return;
			for (const mark of node.marks) {
				if (
					mark.type.name === "suggestionDelete" ||
					mark.type.name === "suggestionInsert"
				) {
					if (mark.attrs.isStreaming) {
						hasStreamingMark = true;
					}
					foundId = mark.attrs.suggestionId || "default";
					minPos = Math.min(minPos, pos);
					maxPos = Math.max(maxPos, pos + node.nodeSize);
				}
			}
		});

		// Do not return active suggestion if actively streaming or not found
		if (!foundId || maxPos === -1 || hasStreamingMark) return null;

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

		suggestionSnapshots.delete(suggestionId);

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

		// 3. Clean up completely empty paragraphs left by deleting all text in a block
		tr.doc.descendants((node, pos) => {
			if (
				node.isBlock &&
				node.type.name === "paragraph" &&
				node.content.size === 0
			) {
				if (tr.doc.childCount > 1) {
					tr.delete(pos, pos + node.nodeSize);
				}
			}
		});

		if (tr.docChanged) {
			view.dispatch(tr);
		}
	},

	/**
	 * Reject suggestion: restore original text slice losslessly and remove inserted suggestion text
	 */
	reject(editor: Editor, suggestionId: string): void {
		const { state, view } = editor;
		const { doc, tr } = state;

		// 1. First attempt: pristine atomic Slice restoration
		const snapshot = suggestionSnapshots.get(suggestionId);
		if (snapshot) {
			let minPos = Infinity;
			let maxPos = -1;

			doc.descendants((node, pos) => {
				if (!node.isText) return;
				for (const mark of node.marks) {
					if (
						(mark.type.name === "suggestionDelete" ||
							mark.type.name === "suggestionInsert") &&
						mark.attrs.suggestionId === suggestionId
					) {
						minPos = Math.min(minPos, pos);
						maxPos = Math.max(maxPos, pos + node.nodeSize);
					}
				}
			});

			if (minPos !== Infinity && maxPos !== -1) {
				tr.replace(minPos, maxPos, snapshot.slice);
				suggestionSnapshots.delete(suggestionId);
				if (tr.docChanged) {
					view.dispatch(tr);
				}
				return;
			}
			suggestionSnapshots.delete(suggestionId);
		}

		// 2. Fallback: manual range mark removal and deletion if snapshot is unavailable
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

		// Unmark deleted original text
		for (const range of deleteRanges) {
			tr.removeMark(range.from, range.to, state.schema.marks.suggestionDelete);
		}

		// Remove inserted text ranges (in reverse order)
		insertRanges.sort((a, b) => b.from - a.from);
		for (const range of insertRanges) {
			tr.delete(range.from, range.to);
		}

		if (tr.docChanged) {
			view.dispatch(tr);
		}
	},

	/**
	 * Check whether the document still contains any suggestion marks
	 * (including in-progress streaming marks)
	 */
	hasSuggestionMarks(editor: Editor): boolean {
		let found = false;
		editor.state.doc.descendants((node) => {
			if (found) return false;
			if (
				node.isText &&
				node.marks.some(
					(m) =>
						m.type.name === "suggestionDelete" ||
						m.type.name === "suggestionInsert",
				)
			) {
				found = true;
				return false;
			}
			return true;
		});
		return found;
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
