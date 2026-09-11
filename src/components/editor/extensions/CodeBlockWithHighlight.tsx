import { findChildren, Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
	NodeViewContent,
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { common, createLowlight } from "lowlight";
import { Check, Copy } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";

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
	{ label: "PHP", value: "php" },
	{ label: "Ruby", value: "ruby" },
	{ label: "Swift", value: "swift" },
	{ label: "Kotlin", value: "kotlin" },
	{ label: "Diff", value: "diff" },
	{ label: "Plain Text", value: "plaintext" },
];

interface HastText {
	type: "text";
	value: string;
}

interface HastElement {
	type: "element";
	tagName: string;
	properties?: { className?: string[] };
	children?: Array<HastText | HastElement>;
}

/**
 * Recursively parse lowlight HAST nodes into flat tokens with classes
 */
function parseHastNodes(
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
function getCodeBlockDecorations({
	doc,
	name,
}: {
	doc: import("@tiptap/pm/model").Node;
	name: string;
}) {
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

/**
 * React NodeView for TipTap CodeBlock with header, language selector, and copy button
 */
export function CodeBlockComponent({
	node,
	updateAttributes,
	editor,
}: NodeViewProps) {
	const [copied, setCopied] = useState(false);
	const rawLanguage = (node.attrs.language as string) || "";
	const isEditable = editor?.isEditable ?? true;

	const displayLanguage = useMemo(() => {
		if (rawLanguage) return rawLanguage.toUpperCase();
		// Auto detect preview label
		try {
			const autoResult = lowlight.highlightAuto(node.textContent || "");
			return autoResult.data?.language?.toUpperCase() || "CODE";
		} catch {
			return "CODE";
		}
	}, [rawLanguage, node.textContent]);

	const handleCopy = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		const codeText = node.textContent;
		let success = false;

		if (navigator?.clipboard?.writeText) {
			try {
				await navigator.clipboard.writeText(codeText);
				success = true;
			} catch {
				success = false;
			}
		}

		// Fallback for older browsers or restricted environments
		if (!success) {
			try {
				const textarea = document.createElement("textarea");
				textarea.value = codeText;
				textarea.style.position = "fixed";
				textarea.style.opacity = "0";
				document.body.appendChild(textarea);
				textarea.select();
				document.execCommand("copy");
				document.body.removeChild(textarea);
				success = true;
			} catch (err) {
				console.error("Failed to copy code to clipboard:", err);
			}
		}

		if (success) {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	return (
		<NodeViewWrapper className="code-block-node-view not-prose my-4 rounded-xl border border-zinc-800/80 bg-[#1e1e1e] text-zinc-100 shadow-md overflow-hidden group">
			{/* Code Block Header */}
			<div className="flex items-center justify-between px-3.5 py-1.5 bg-[#252526] border-b border-zinc-800/80 select-none text-xs font-mono text-zinc-400">
				<div className="flex items-center gap-2">
					<div className="flex items-center gap-1.5 mr-1.5">
						<span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]/80 inline-block" />
						<span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]/80 inline-block" />
						<span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]/80 inline-block" />
					</div>

					{isEditable ? (
						<select
							aria-label="选择代码语言"
							value={rawLanguage}
							onChange={(e) => updateAttributes({ language: e.target.value })}
							className="bg-transparent text-zinc-300 text-xs font-mono font-medium focus:outline-none focus:ring-1 focus:ring-accent/40 rounded px-1.5 py-0.5 cursor-pointer hover:bg-zinc-800/80 transition-colors"
						>
							{SUPPORTED_LANGUAGES.map((lang) => (
								<option
									key={lang.value}
									value={lang.value}
									className="bg-zinc-900 text-zinc-200 py-1"
								>
									{lang.label}
								</option>
							))}
						</select>
					) : (
						<span className="font-mono text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
							{displayLanguage}
						</span>
					)}
				</div>

				{/* Copy Button */}
				<button
					type="button"
					onClick={handleCopy}
					aria-label="复制代码"
					title={copied ? "已复制到剪贴板" : "复制代码"}
					className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-sans font-medium transition-all duration-150 cursor-pointer ${
						copied
							? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/60"
							: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/90"
					}`}
				>
					{copied ? (
						<>
							<Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
							<span className="text-[11px] text-emerald-400">已复制</span>
						</>
					) : (
						<>
							<Copy className="w-3.5 h-3.5 shrink-0" />
							<span className="text-[11px]">复制</span>
						</>
					)}
				</button>
			</div>

			{/* Code Content */}
			<pre className="p-4 overflow-x-auto text-[13px] leading-relaxed font-mono bg-transparent m-0 select-text">
				<NodeViewContent<"code">
					as="code"
					className={rawLanguage ? `language-${rawLanguage} hljs` : "hljs"}
				/>
			</pre>
		</NodeViewWrapper>
	);
}

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
