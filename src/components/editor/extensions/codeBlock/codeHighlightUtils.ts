import { findChildren } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { common, createLowlight } from "lowlight";

// Initialize lowlight with common programming languages
export const lowlight = createLowlight(common);

// Register common aliases for convenience
lowlight.registerAlias({
	go: ["golang"],
	typescript: ["ts", "tsx"],
	javascript: ["js", "jsx"],
	python: ["py"],
	bash: ["sh", "shell", "zsh"],
	yaml: ["yml"],
	rust: ["rs"],
	markdown: ["md"],
});

/**
 * Common languages supported in the language selector
 */
export const SUPPORTED_LANGUAGES = [
	{ label: "自动检测 (Auto)", value: "" },
	{ label: "Go", value: "go" },
	{ label: "TypeScript", value: "typescript" },
	{ label: "JavaScript", value: "javascript" },
	{ label: "Python", value: "python" },
	{ label: "Bash / Shell", value: "bash" },
	{ label: "JSON", value: "json" },
	{ label: "HTML", value: "html" },
	{ label: "CSS", value: "css" },
	{ label: "SQL", value: "sql" },
	{ label: "Rust", value: "rust" },
	{ label: "Java", value: "java" },
	{ label: "C++", value: "cpp" },
	{ label: "C#", value: "csharp" },
	{ label: "YAML", value: "yaml" },
	{ label: "Markdown", value: "markdown" },
	{ label: "Mermaid (图表)", value: "mermaid" },
	{ label: "PHP", value: "php" },
	{ label: "Ruby", value: "ruby" },
	{ label: "Swift", value: "swift" },
	{ label: "Kotlin", value: "kotlin" },
	{ label: "Diff", value: "diff" },
	{ label: "Plain Text", value: "plaintext" },
];

export interface HastText {
	type: "text";
	value: string;
}

export interface HastElement {
	type: "element";
	tagName: string;
	properties?: { className?: string[] };
	children?: Array<HastText | HastElement>;
}

/**
 * Recursively parse lowlight HAST nodes into flat tokens with classes
 */
export function parseHastNodes(
	nodes: Array<HastText | HastElement>,
	className: string[] = [],
): Array<{ text: string; classes: string[] }> {
	const tokens: Array<{ text: string; classes: string[] }> = [];

	for (const node of nodes) {
		const classes = [
			...className,
			...(node.type === "element" && node.properties?.className
				? node.properties.className
				: []),
		];

		if (node.type === "element" && node.children) {
			tokens.push(...parseHastNodes(node.children, classes));
		} else if (node.type === "text") {
			tokens.push({
				text: node.value,
				classes,
			});
		}
	}

	return tokens;
}

/**
 * Generate ProseMirror inline decorations for code blocks
 */
export function getCodeBlockDecorations({
	doc,
	name,
}: {
	doc: ProseMirrorNode;
	name: string;
}): DecorationSet {
	const decorations: Decoration[] = [];
	const blocks = findChildren(doc, (node) => node.type.name === name);

	for (const block of blocks) {
		const text = block.node.textContent;
		if (!text) continue;

		const lang = block.node.attrs.language as string | undefined;
		let nodes: Array<HastText | HastElement> = [];

		try {
			if (lang && lowlight.registered(lang)) {
				nodes = (lowlight.highlight(lang, text).children || []) as Array<
					HastText | HastElement
				>;
			} else {
				nodes = (lowlight.highlightAuto(text).children || []) as Array<
					HastText | HastElement
				>;
			}
		} catch {
			continue;
		}

		const tokens = parseHastNodes(nodes);
		let from = block.pos + 1;

		for (const token of tokens) {
			const to = from + token.text.length;
			if (token.classes.length > 0) {
				decorations.push(
					Decoration.inline(from, to, {
						class: token.classes.join(" "),
					}),
				);
			}
			from = to;
		}
	}

	return DecorationSet.create(doc, decorations);
}
