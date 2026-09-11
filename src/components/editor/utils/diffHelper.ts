import type { Mark, Node as ProsemirrorNode, Schema } from "@tiptap/pm/model";
import * as diff from "diff";

export interface DiffSegment {
	text: string;
	status: "same" | "added" | "removed";
}

/**
 * Perform fine-grained word and space diff between old and new text
 */
export function computeFineDiff(
	oldText: string,
	newText: string,
): DiffSegment[] {
	const changes = diff.diffWordsWithSpace(oldText, newText);
	return changes.map((change) => ({
		text: change.value,
		status: change.added ? "added" : change.removed ? "removed" : "same",
	}));
}

/**
 * Build an array of ProseMirror nodes (paragraphs) from diff segments
 * preserves unchanged text as clean nodes and marks only changed words
 */
export function buildNodesFromDiff(
	schema: Schema,
	segments: DiffSegment[],
	suggestionId: string,
): ProsemirrorNode[] {
	const deleteMark = schema.marks.suggestionDelete?.create({ suggestionId });
	const insertMark = schema.marks.suggestionInsert?.create({ suggestionId });

	const paragraphs: ProsemirrorNode[] = [];
	let currentInlineNodes: ProsemirrorNode[] = [];

	const flushParagraph = () => {
		if (currentInlineNodes.length > 0) {
			paragraphs.push(schema.nodes.paragraph.create(null, currentInlineNodes));
			currentInlineNodes = [];
		} else {
			paragraphs.push(schema.nodes.paragraph.create());
		}
	};

	for (const segment of segments) {
		const { text, status } = segment;
		if (!text) continue;

		// Split text by newlines so paragraphs remain properly structured
		const parts = text.split("\n");

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];

			if (part) {
				const marks: Mark[] = [];
				if (status === "added" && insertMark) {
					marks.push(insertMark);
				} else if (status === "removed" && deleteMark) {
					marks.push(deleteMark);
				}

				currentInlineNodes.push(schema.text(part, marks));
			}

			// If there are more parts, a newline was encountered
			if (i < parts.length - 1) {
				flushParagraph();
			}
		}
	}

	// Flush the final paragraph
	if (currentInlineNodes.length > 0) {
		paragraphs.push(schema.nodes.paragraph.create(null, currentInlineNodes));
	}

	// Guarantee at least one node is returned
	return paragraphs.length > 0 ? paragraphs : [schema.nodes.paragraph.create()];
}
