import { Mark, mergeAttributes } from "@tiptap/core";

export interface SuggestionMarkAttributes {
	suggestionId?: string;
}

/**
 * Mark for original text marked for deletion in AI suggestion
 */
export const SuggestionDelete = Mark.create({
	name: "suggestionDelete",

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
			{
				tag: "del[data-ai-suggestion-delete]",
			},
			{
				tag: "span.ai-suggestion-delete",
			},
		];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"del",
			mergeAttributes(HTMLAttributes, {
				"data-ai-suggestion-delete": "",
				class:
					"ai-suggestion-delete line-through text-muted/70 opacity-60 decoration-muted/80 bg-danger/10 px-0.5 rounded select-none",
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
			{
				tag: "ins[data-ai-suggestion-insert]",
			},
			{
				tag: "span.ai-suggestion-insert",
			},
		];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"ins",
			mergeAttributes(HTMLAttributes, {
				"data-ai-suggestion-insert": "",
				class:
					"ai-suggestion-insert no-underline bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium px-1 py-0.5 rounded border-b border-emerald-500/40",
			}),
			0,
		];
	},
});

export const SuggestionDiffExtensions = [SuggestionDelete, SuggestionInsert];
