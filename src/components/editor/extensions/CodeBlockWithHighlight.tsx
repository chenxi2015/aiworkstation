import { Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CodeBlockComponent } from "./codeBlock/CodeBlockComponent";
import {
	getCodeBlockDecorations,
	lowlight,
	SUPPORTED_LANGUAGES,
} from "./codeBlock/codeHighlightUtils";

// Re-export utility functions and components for backward compatibility
export {
	CodeBlockComponent,
	getCodeBlockDecorations,
	lowlight,
	SUPPORTED_LANGUAGES,
};

/**
 * Custom TipTap CodeBlock extension with syntax highlighting and React NodeView
 */
export const CodeBlockWithHighlight = Node.create({
	name: "codeBlock",

	addOptions() {
		return {
			languageClassPrefix: "language-",
			exitOnTripleEnter: true,
			exitOnArrowDown: true,
			exitOnArrowUp: true,
			defaultLanguage: null,
			HTMLAttributes: {},
		};
	},

	content: "text*",

	marks: "",

	group: "block",

	code: true,

	defining: true,

	addAttributes() {
		return {
			language: {
				default: null,
				parseHTML: (element) => {
					const { languageClassPrefix } = this.options;
					const classNames = [
						...(element.firstElementChild?.classList ||
							element.classList ||
							[]),
					];
					const languages = classNames
						.filter((className) => className.startsWith(languageClassPrefix))
						.map((className) => className.replace(languageClassPrefix, ""));
					return languages[0] || null;
				},
				rendered: false,
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: "pre",
				preserveWhitespace: "full",
			},
		];
	},

	renderHTML({ HTMLAttributes }) {
		return ["pre", HTMLAttributes, ["code", {}, 0]];
	},

	addCommands() {
		return {
			setCodeBlock:
				(attributes) =>
				({ commands }) => {
					return commands.setNode(this.name, attributes);
				},
			toggleCodeBlock:
				(attributes) =>
				({ commands }) => {
					return commands.toggleNode(this.name, "paragraph", attributes);
				},
		};
	},

	addKeyboardShortcuts() {
		return {
			"Mod-Alt-c": () => this.editor.commands.toggleCodeBlock(),
		};
	},

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey("codeBlockLowlight"),
				state: {
					init: (_, { doc }) => {
						return getCodeBlockDecorations({ doc, name: this.name });
					},
					apply: (tr, decorationSet) => {
						if (!tr.docChanged) {
							return decorationSet.map(tr.mapping, tr.doc);
						}
						return getCodeBlockDecorations({ doc: tr.doc, name: this.name });
					},
				},
				props: {
					decorations(state) {
						return this.getState(state);
					},
				},
			}),
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(CodeBlockComponent);
	},
});
