import { mergeAttributes, Node } from "@tiptap/core";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import {
	Bookmark,
	Box,
	FileText,
	Folder as FolderIcon,
	Globe,
	X,
} from "lucide-react";

/** Format item name for clean display */
function formatItemName(name: string): string {
	if (!name) return "";
	if (name.includes(" ") && /[A-Z]/.test(name)) return name;
	return name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * React NodeView for Inline Skill Badge
 * Replicates Figure 1: Box icon + Sky blue title in the same text stream
 */
function SkillInlineNodeView({ node, deleteNode }: NodeViewProps) {
	const name = (node.attrs.name as string) || "";
	const displayName = formatItemName(name);

	return (
		<NodeViewWrapper
			as="span"
			className="inline-flex items-center align-middle h-5 gap-1 text-blue-600 dark:text-blue-400 font-medium text-xs shrink-0 select-none group mr-1.5 cursor-default bg-transparent -translate-y-px"
		>
			<Box className="w-3.5 h-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
			<span className="tracking-tight leading-none">{displayName}</span>
			<button
				type="button"
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					deleteNode();
				}}
				title="移除"
				className="opacity-0 group-hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 text-blue-500/70 dark:text-blue-400/70 p-0.5 rounded transition-opacity cursor-pointer ml-0.5 inline-flex items-center justify-center"
			>
				<X className="w-3 h-3" />
			</button>
		</NodeViewWrapper>
	);
}

/**
 * Inline Skill Node specification for TipTap
 */
export const SkillInlineNode = Node.create({
	name: "skillInlineNode",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,
	draggable: true,

	addAttributes() {
		return {
			id: {
				default: "",
			},
			name: {
				default: "",
			},
			dirPath: {
				default: "",
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: "span[data-skill-node]",
				getAttrs: (dom) => {
					if (!(dom instanceof HTMLElement)) return false;
					return {
						id: dom.getAttribute("data-skill-id") || "",
						name: dom.getAttribute("data-skill-name") || "",
						dirPath: dom.getAttribute("data-skill-dir-path") || "",
					};
				},
			},
		];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"span",
			mergeAttributes(HTMLAttributes, {
				"data-skill-node": "",
				"data-skill-id": HTMLAttributes.id,
				"data-skill-name": HTMLAttributes.name,
				"data-skill-dir-path": HTMLAttributes.dirPath,
			}),
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(SkillInlineNodeView);
	},
});

/**
 * React NodeView for Inline Mention / Context Badge
 * Replicates Figure 1: File icon + Sky blue title in the same text stream
 */
function MentionInlineNodeView({ node, deleteNode }: NodeViewProps) {
	const title = (node.attrs.title as string) || "Context";
	const type = (node.attrs.type as string) || "document";

	const renderIcon = () => {
		switch (type) {
			case "folder":
				return <FolderIcon className="w-3.5 h-3.5 shrink-0 text-amber-500" />;
			case "material":
			case "bookmark":
				return <Bookmark className="w-3.5 h-3.5 shrink-0 text-emerald-500" />;
			case "history":
			case "global":
				return <Globe className="w-3.5 h-3.5 shrink-0 text-blue-500" />;
			default:
				return <FileText className="w-3.5 h-3.5 shrink-0 text-blue-500" />;
		}
	};

	return (
		<NodeViewWrapper
			as="span"
			className="inline-flex items-center align-middle h-5 gap-1 text-blue-600 dark:text-blue-400 font-medium text-xs shrink-0 select-none group mr-1.5 cursor-default bg-transparent -translate-y-px"
		>
			{renderIcon()}
			<span className="tracking-tight leading-none">{title}</span>
			<button
				type="button"
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					deleteNode();
				}}
				title="移除"
				className="opacity-0 group-hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 text-blue-500/70 dark:text-blue-400/70 p-0.5 rounded transition-opacity cursor-pointer ml-0.5 inline-flex items-center justify-center"
			>
				<X className="w-3 h-3" />
			</button>
		</NodeViewWrapper>
	);
}

/**
 * Inline Mention / Context Node specification for TipTap
 */
export const MentionInlineNode = Node.create({
	name: "mentionInlineNode",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,
	draggable: true,

	addAttributes() {
		return {
			id: {
				default: "",
			},
			type: {
				default: "document",
			},
			title: {
				default: "",
			},
			subtitle: {
				default: "",
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: "span[data-mention-node]",
				getAttrs: (dom) => {
					if (!(dom instanceof HTMLElement)) return false;
					return {
						id: dom.getAttribute("data-mention-id") || "",
						type: dom.getAttribute("data-mention-type") || "document",
						title: dom.getAttribute("data-mention-title") || "",
						subtitle: dom.getAttribute("data-mention-subtitle") || "",
					};
				},
			},
		];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"span",
			mergeAttributes(HTMLAttributes, {
				"data-mention-node": "",
				"data-mention-id": HTMLAttributes.id,
				"data-mention-type": HTMLAttributes.type,
				"data-mention-title": HTMLAttributes.title,
				"data-mention-subtitle": HTMLAttributes.subtitle,
			}),
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(MentionInlineNodeView);
	},
});
