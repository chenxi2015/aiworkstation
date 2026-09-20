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

/**
 * Build inline ProseMirror text nodes from diff segments without paragraph wrappers.
 * Used for intra-block replacements to strictly prevent creating empty paragraphs or splitting blocks.
 */
export function buildInlineNodesFromDiff(
	schema: Schema,
	segments: DiffSegment[],
	suggestionId: string,
): ProsemirrorNode[] {
	const deleteMark = schema.marks.suggestionDelete?.create({ suggestionId });
	const insertMark = schema.marks.suggestionInsert?.create({ suggestionId });

	const inlineNodes: ProsemirrorNode[] = [];

	for (const segment of segments) {
		const { text, status } = segment;
		if (!text) continue;

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
				inlineNodes.push(schema.text(part, marks));
			}

			// In-block separations use spaces strictly; never insert hardBreak (<br>)
			if (i < parts.length - 1) {
				inlineNodes.push(schema.text(" "));
			}
		}
	}

	return inlineNodes;
}

const ADD_CLASS =
	"no-underline bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-medium px-0.5 rounded mx-0.5";
const DEL_CLASS =
	"bg-danger/15 text-danger line-through font-medium px-0.5 rounded mx-0.5";

/**
 * Build rich markdown preserving layout (headings, tables, lists, code blocks, mermaid)
 * while injecting inline <ins> or <del> highlight tags for diff view.
 * Strictly avoids polluting code blocks / mermaid diagrams with HTML tags to keep syntax 100% valid.
 */
export function buildHighlightedMarkdown(
	baseMd: string,
	targetMd: string,
	role: "base" | "revised",
): string {
	if (!baseMd || !targetMd || baseMd.trim() === targetMd.trim()) {
		return role === "base" ? baseMd : targetMd;
	}

	const chunks = diff.diffLines(baseMd, targetMd);
	const result: string[] = [];
	let inCodeBlock = false;

	const isCodeFence = (line: string) => /^\s*(```|~~~)/.test(line);

	for (let i = 0; i < chunks.length; i++) {
		const current = chunks[i];

		if (!current.added && !current.removed) {
			const lines = current.value.split("\n");
			for (const line of lines) {
				if (isCodeFence(line)) {
					inCodeBlock = !inCodeBlock;
				}
			}
			result.push(current.value);
			continue;
		}

		if (role === "revised") {
			if (current.added) {
				const prev = chunks[i - 1];
				// If immediately following a single-line removed chunk and NOT in a code block, do fine-grained word diff
				if (
					!inCodeBlock &&
					prev &&
					prev.removed &&
					prev.count === 1 &&
					current.count === 1 &&
					!isCodeFence(current.value) &&
					!isCodeFence(prev.value)
				) {
					const wordDiffs = diff.diffWordsWithSpace(
						prev.value.trimEnd(),
						current.value.trimEnd(),
					);
					const lineHtml = wordDiffs
						.map((w) => {
							if (w.added) {
								return `<ins class="${ADD_CLASS}">${w.value}</ins>`;
							}
							if (w.removed) return "";
							return w.value;
						})
						.join("");
					result.push(`${lineHtml}\n`);
				} else {
					// Multiple lines or block added
					const lines = current.value.split("\n");
					const processed = lines.map((line, idx) => {
						if (idx === lines.length - 1 && !line) return line;

						if (isCodeFence(line)) {
							inCodeBlock = !inCodeBlock;
							return line; // Keep code fence completely pure
						}

						if (inCodeBlock) {
							return line; // Never inject HTML tags inside code blocks / mermaid diagrams
						}

						if (!line.trim()) return line;
						if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
							// Table row: highlight cells while preserving pipe separators
							return line
								.split("|")
								.map((cell) => {
									const trimmed = cell.trim();
									if (!trimmed || trimmed === "---" || trimmed.includes("---"))
										return cell;
									return ` <ins class="${ADD_CLASS}">${trimmed}</ins> `;
								})
								.join("|");
						}
						// Headings or regular lines
						const headingMatch = line.match(/^(#{1,6}\s+)(.*)$/);
						if (headingMatch) {
							return `${headingMatch[1]}<ins class="${ADD_CLASS}">${headingMatch[2]}</ins>`;
						}
						return `<ins class="${ADD_CLASS}">${line}</ins>`;
					});
					result.push(processed.join("\n"));
				}
			}
		} else {
			// role === "base"
			if (current.removed) {
				const next = chunks[i + 1];
				// If immediately followed by a single-line added chunk and NOT in a code block, do fine-grained word diff
				if (
					!inCodeBlock &&
					next &&
					next.added &&
					next.count === 1 &&
					current.count === 1 &&
					!isCodeFence(current.value) &&
					!isCodeFence(next.value)
				) {
					const wordDiffs = diff.diffWordsWithSpace(
						current.value.trimEnd(),
						next.value.trimEnd(),
					);
					const lineHtml = wordDiffs
						.map((w) => {
							if (w.removed) {
								return `<del class="${DEL_CLASS}">${w.value}</del>`;
							}
							if (w.added) return "";
							return w.value;
						})
						.join("");
					result.push(`${lineHtml}\n`);
				} else {
					// Block removed
					const lines = current.value.split("\n");
					const processed = lines.map((line, idx) => {
						if (idx === lines.length - 1 && !line) return line;

						if (isCodeFence(line)) {
							inCodeBlock = !inCodeBlock;
							return line; // Keep code fence completely pure
						}

						if (inCodeBlock) {
							return line; // Never inject HTML tags inside code blocks / mermaid diagrams
						}

						if (!line.trim()) return line;
						if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
							return line
								.split("|")
								.map((cell) => {
									const trimmed = cell.trim();
									if (!trimmed || trimmed === "---" || trimmed.includes("---"))
										return cell;
									return ` <del class="${DEL_CLASS}">${trimmed}</del> `;
								})
								.join("|");
						}
						const headingMatch = line.match(/^(#{1,6}\s+)(.*)$/);
						if (headingMatch) {
							return `${headingMatch[1]}<del class="${DEL_CLASS}">${headingMatch[2]}</del>`;
						}
						return `<del class="${DEL_CLASS}">${line}</del>`;
					});
					result.push(processed.join("\n"));
				}
			}
		}
	}

	return result.join("");
}

/**
 * Extract clean visible text from Markdown string by stripping syntax tokens and extra formatting
 */
export function markdownToPlainText(md: string): string {
	if (!md) return "";
	return md
		.replace(/!\[.*?\]\(.*?\)/g, "") // image syntax
		.replace(/\[(.*?)\]\(.*?\)/g, "$1") // link syntax -> link text
		.replace(/```[\s\S]*?```/g, "") // code fence blocks
		.replace(/^#{1,6}\s+/gm, "") // headings
		.replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
		.replace(/(\*|_)(.*?)\1/g, "$2") // italic
		.replace(/~~(.*?)~~/g, "$1") // strikethrough
		.replace(/^>\s+/gm, "") // blockquote
		.replace(/^[-*+]\s+/gm, "") // list bullets
		.replace(/^\d+\.\s+/gm, "") // list numbers
		.replace(/<[^>]+>/g, ""); // inline html tags
}

/**
 * Accurately compute diff delta (net added/removed visible words) between two Markdown versions.
 * Excludes Markdown syntax tokens, whitespace and newlines from the count.
 */
export function computeDiffWordDelta(baseMd: string, targetMd: string): number {
	if (!baseMd && !targetMd) return 0;
	if (baseMd.trim() === targetMd.trim()) return 0;

	const baseText = markdownToPlainText(baseMd);
	const targetText = markdownToPlainText(targetMd);

	if (baseText.trim() === targetText.trim()) return 0;

	const changes = diff.diffWordsWithSpace(baseText, targetText);
	let added = 0;
	let removed = 0;

	for (const change of changes) {
		const visibleCount = change.value.replace(/[\r\n\t\s]+/g, "").length;
		if (change.added) {
			added += visibleCount;
		} else if (change.removed) {
			removed += visibleCount;
		}
	}

	return added - removed;
}
