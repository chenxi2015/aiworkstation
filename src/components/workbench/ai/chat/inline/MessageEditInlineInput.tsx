import { Tooltip } from "@heroui/react";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArrowUp, X } from "lucide-react";
import { memo, useCallback, useEffect, useRef } from "react";
import { MentionInlineNode, SkillInlineNode } from "./ChatInlineNodes";

const TOKEN_SPLIT_REGEX = /(\[Skill:\s*[^\]]+\]|@\[[^\]]+\])/g;

/**
 * Parses a message string (with [Skill: xxx] or @[xxx] tokens) into Tiptap Doc JSON
 */
function parseMessageToDocJson(raw: string) {
	if (!raw) {
		return {
			type: "doc",
			content: [{ type: "paragraph" }],
		};
	}

	const parts = raw.split(TOKEN_SPLIT_REGEX);
	const content: Array<{
		type: string;
		text?: string;
		attrs?: Record<string, unknown>;
	}> = [];

	for (const part of parts) {
		if (!part) continue;
		if (part.startsWith("[Skill:") && part.endsWith("]")) {
			const skillName = part.slice(7, -1).trim();
			content.push({
				type: "skillInlineNode",
				attrs: {
					id: skillName,
					name: skillName,
				},
			});
		} else if (part.startsWith("@[") && part.endsWith("]")) {
			const title = part.slice(2, -1).trim();
			content.push({
				type: "mentionInlineNode",
				attrs: {
					id: `mention_${title}`,
					type: "document",
					title,
				},
			});
		} else {
			content.push({
				type: "text",
				text: part,
			});
		}
	}

	return {
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: content.length > 0 ? content : undefined,
			},
		],
	};
}

/**
 * Serializes Tiptap editor content back into a raw string with tokens
 */
function serializeDocToMessage(editor: Editor): string {
	let stream = "";
	editor.state.doc.descendants((node) => {
		if (node.type.name === "skillInlineNode") {
			stream += `[Skill: ${node.attrs.name || ""}]`;
		} else if (node.type.name === "mentionInlineNode") {
			stream += `@[${node.attrs.title || ""}]`;
		} else if (node.isText) {
			stream += node.text || "";
		}
	});
	return stream.trim();
}

export interface MessageEditInlineInputProps {
	initialContent: string;
	onSave: (newContent: string) => void;
	onCancel: () => void;
	isLoading?: boolean;
}

/**
 * Lightweight Tiptap-based inline editor for editing existing messages.
 * Only mounted on demand when editing, unmounted immediately when cancelled or saved.
 */
export const MessageEditInlineInput = memo(function MessageEditInlineInput({
	initialContent,
	onSave,
	onCancel,
	isLoading = false,
}: MessageEditInlineInputProps) {
	const onSaveRef = useRef(onSave);
	onSaveRef.current = onSave;

	const onCancelRef = useRef(onCancel);
	onCancelRef.current = onCancel;

	const handleCommit = useCallback((ed: Editor) => {
		const serialized = serializeDocToMessage(ed);
		if (!serialized) return;
		onSaveRef.current(serialized);
	}, []);

	const editor = useEditor({
		content: parseMessageToDocJson(initialContent),
		autofocus: "end",
		extensions: [
			StarterKit.configure({
				heading: false,
				codeBlock: false,
				blockquote: false,
				bulletList: false,
				orderedList: false,
				listItem: false,
				horizontalRule: false,
			}),
			SkillInlineNode,
			MentionInlineNode,
		],
		editorProps: {
			attributes: {
				class:
					"focus:outline-none text-xs leading-relaxed text-foreground min-h-[24px] max-w-full break-words selection:bg-blue-500/20",
			},
			handleKeyDown: (_view, event) => {
				if (event.key === "Enter" && !event.shiftKey) {
					event.preventDefault();
					if (editor) handleCommit(editor);
					return true;
				}
				if (event.key === "Escape") {
					event.preventDefault();
					onCancelRef.current();
					return true;
				}
				return false;
			},
		},
	});

	// Focus editor on mount
	useEffect(() => {
		if (editor && !editor.isDestroyed) {
			editor.commands.focus("end");
		}
	}, [editor]);

	const handleSaveClick = () => {
		if (!editor) return;
		handleCommit(editor);
	};

	return (
		<div className="w-full flex items-center gap-1.5 my-1">
			{/* Cancel Button */}
			<Tooltip>
				<Tooltip.Trigger>
					<button
						type="button"
						onClick={onCancel}
						className="p-1 text-muted hover:text-foreground hover:bg-surface-secondary/80 rounded-md transition-colors cursor-pointer shrink-0"
						aria-label="取消编辑"
					>
						<X className="w-4 h-4" />
					</button>
				</Tooltip.Trigger>
				<Tooltip.Content className="text-[10px] py-0.5 px-1.5">
					取消 (Esc)
				</Tooltip.Content>
			</Tooltip>

			{/* Tiptap Edit Container */}
			<div className="flex-1 min-w-0 bg-surface border-2 border-accent rounded-xl px-3 py-1.5 text-xs text-foreground focus-within:ring-1 focus-within:ring-accent shadow-xs max-h-36 overflow-y-auto transition-all">
				<EditorContent editor={editor} />
			</div>

			{/* Save Button */}
			<Tooltip>
				<Tooltip.Trigger>
					<button
						type="button"
						onClick={handleSaveClick}
						disabled={isLoading || !editor || editor.isEmpty}
						className="w-7 h-7 rounded-full bg-accent hover:bg-accent/90 disabled:opacity-50 text-accent-foreground flex items-center justify-center shrink-0 shadow-xs cursor-pointer transition-all"
						aria-label="保存并发送"
					>
						<ArrowUp className="w-4 h-4" />
					</button>
				</Tooltip.Trigger>
				<Tooltip.Content className="text-[10px] py-0.5 px-1.5">
					保存并重新提问 (Enter)
				</Tooltip.Content>
			</Tooltip>
		</div>
	);
});
