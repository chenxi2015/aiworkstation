import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";

export interface SlashCommandOptions {
	suggestion: Omit<SuggestionOptions, "editor">;
}

export const SlashCommands = Extension.create<SlashCommandOptions>({
	name: "slashCommands",

	addOptions() {
		return {
			suggestion: {
				char: "/",
				command: ({ editor, range, props }) => {
					props.command({ editor, range });
				},
			},
		};
	},

	addProseMirrorPlugins() {
		return [
			Suggestion({
				editor: this.editor,
				...this.options.suggestion,
			}),
		];
	},
});
