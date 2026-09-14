import { Mark, mergeAttributes } from "@tiptap/core";

export interface SuggestionMarkAttributes {
	suggestionId?: string;
}

/**
 * Mark for original text marked for deletion in AI suggestion
 */
export const SuggestionDelete = Mark.create({
	name: "suggestionDelete",
	priority: 110,

	addAttributes() {
		return {
			suggestionId: {
				default: null,
				parseHTML: (element) => element.getAttribute("data-suggestion-id"),
				renderHTML: (attributes) => {
					if (!attributes.suggestionId) return {};
					return { "data-suggestion-id": attributes.suggestionId };
				},
			},
		};
	},

	parseHTML() {
		return [
			{ tag: "del[data-ai-suggestion-delete]" },
			{ tag: "del" },
			{ tag: "span.ai-suggestion-delete" },
			{ tag: "span.diff-del" },
		];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"del",
			mergeAttributes(HTMLAttributes, {
				"data-ai-suggestion-delete": "",
				class:
					"ai-suggestion-delete line-through text-rose-600/85 dark:text-rose-400/85 decoration-rose-500/60 bg-rose-500/15 dark:bg-rose-500/20 px-1 py-0.5 rounded mx-0.5 select-text",
			}),
			0,
		];
	},
});

/**
 * Mark for newly suggested text by AI
 */
export const SuggestionInsert = Mark.create({
	name: "suggestionInsert",
	priority: 110,

	addAttributes() {
		return {
			suggestionId: {
				default: null,
				parseHTML: (element) => element.getAttribute("data-suggestion-id"),
				renderHTML: (attributes) => {
					if (!attributes.suggestionId) return {};
					return { "data-suggestion-id": attributes.suggestionId };
				},
			},
		};
	},

	parseHTML() {
		return [
			{ tag: "ins[data-ai-suggestion-insert]" },
			{ tag: "ins" },
			{ tag: "span.ai-suggestion-insert" },
			{ tag: "span.diff-add" },
		];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"ins",
			mergeAttributes(HTMLAttributes, {
				"data-ai-suggestion-insert": "",
				class:
					"ai-suggestion-insert no-underline bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-medium px-1 py-0.5 rounded border-b border-emerald-500/40 mx-0.5 select-text",
			}),
			0,
		];
	},
});

export const SuggestionDiffExtensions = [SuggestionDelete, SuggestionInsert];
