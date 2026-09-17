import type { Editor } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type React from "react";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
} from "react";
import type { ChatContextItem } from "../../../../../types/chatContext";
import type { SlashItem } from "../../../../common/slash/useSlashSkills";
import { ChatInlineKeyboard } from "./ChatInlineKeyboard";
import { MentionInlineNode, SkillInlineNode } from "./ChatInlineNodes";

export interface SerializedInputData {
	text: string;
	skills: Array<{ id: string; name: string; dirPath?: string }>;
	mentions: ChatContextItem[];
	fullPrompt: string;
	isEmpty: boolean;
}

export interface ChatRichInlineInputHandle {
	focus: () => void;
	clear: () => void;
	setContent: (content: string) => void;
	insertSkill: (skill: SlashItem) => void;
	insertMention: (item: ChatContextItem) => void;
	removeTrigger: (char: "@" | "/") => void;
	getSerializedData: () => SerializedInputData;
	isEmpty: () => boolean;
}

export interface ChatRichInlineInputProps {
	placeholder?: string;
	onSend: () => void;
	onChangeText?: (text: string) => void;
	onTriggerMention: (query: string | null) => void;
	onTriggerSlash: (query: string | null) => void;
	isMenuOpen: boolean;
	onMenuKeyDown?: (e: React.KeyboardEvent) => boolean;
	className?: string;
	maxHeight?: number;
}

/**
 * Modern inline rich input powered by TipTap.
 * Seamlessly integrates inline Skill badges and Mention tokens inside the text flow (matching 图一).
 */
export const ChatRichInlineInput = forwardRef<
	ChatRichInlineInputHandle,
	ChatRichInlineInputProps
>(function ChatRichInlineInput(
	{
		placeholder = "发消息、输入 @ 引用，输入 / 载入 Skills...",
		onSend,
		onChangeText,
		onTriggerMention,
		onTriggerSlash,
		isMenuOpen,
		onMenuKeyDown,
		className = "",
		maxHeight = 120,
	},
	ref,
) {
	const isMenuOpenRef = useRef(isMenuOpen);
	isMenuOpenRef.current = isMenuOpen;

	const onSendRef = useRef(onSend);
	onSendRef.current = onSend;

	const onMenuKeyDownRef = useRef(onMenuKeyDown);
	onMenuKeyDownRef.current = onMenuKeyDown;

	// Check trigger character (@ or /) before cursor
	const checkTriggers = useCallback(
		(editorInstance: Editor | null) => {
			if (!editorInstance) return;
			const { from } = editorInstance.state.selection;
			// Get up to 40 characters before cursor to detect mention / slash
			const textBefore = editorInstance.state.doc.textBetween(
				Math.max(0, from - 40),
				from,
				"\n",
				"\0",
			);

			// Check @ mention
			const lastAtIndex = textBefore.lastIndexOf("@");
			if (
				lastAtIndex !== -1 &&
				(lastAtIndex === 0 || /\s/.test(textBefore[lastAtIndex - 1]))
			) {
				const query = textBefore.slice(lastAtIndex + 1);
				if (!query.includes(" ") && !query.includes("\n")) {
					onTriggerMention(query);
					onTriggerSlash(null);
					return;
				}
			}
			onTriggerMention(null);

			// Check / slash skill
			const lastSlashIndex = textBefore.lastIndexOf("/");
			if (
				lastSlashIndex !== -1 &&
				(lastSlashIndex === 0 || /\s/.test(textBefore[lastSlashIndex - 1]))
			) {
				const query = textBefore.slice(lastSlashIndex + 1);
				if (!query.includes(" ") && !query.includes("\n")) {
					onTriggerSlash(query);
					return;
				}
			}
			onTriggerSlash(null);
		},
		[onTriggerMention, onTriggerSlash],
	);

	const editor = useEditor({
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
			Placeholder.configure({
				placeholder,
				emptyEditorClass: "is-editor-empty",
			}),
			SkillInlineNode,
			MentionInlineNode,
			ChatInlineKeyboard.configure({
				onSend: () => onSendRef.current?.(),
				isMenuOpen: () => isMenuOpenRef.current,
			}),
		],
		editorProps: {
			attributes: {
				class:
					"focus:outline-none text-xs leading-relaxed text-foreground min-h-[26px] max-w-full break-words selection:bg-blue-500/20",
			},
			handleKeyDown: (_view, event) => {
				if (isMenuOpenRef.current && onMenuKeyDownRef.current) {
					const handled = onMenuKeyDownRef.current(
						event as unknown as React.KeyboardEvent,
					);
					if (handled) return true;
				}
				return false;
			},
		},
		onUpdate: ({ editor: ed }) => {
			checkTriggers(ed);
			let stream = "";
			ed.state.doc.descendants((node) => {
				if (node.type.name === "skillInlineNode") {
					stream += `[Skill: ${node.attrs.name || ""}]`;
				} else if (node.type.name === "mentionInlineNode") {
					stream += `@[${node.attrs.title || ""}]`;
				} else if (node.isText) {
					stream += node.text || "";
				}
			});
			onChangeText?.(stream);
		},
		onSelectionUpdate: ({ editor: ed }) => {
			checkTriggers(ed);
		},
	});

	// Update placeholder dynamically when prop changes
	useEffect(() => {
		if (editor && !editor.isDestroyed) {
			const extension = editor.extensionManager.extensions.find(
				(ext) => ext.name === "placeholder",
			);
			if (extension) {
				extension.options.placeholder = placeholder;
				editor.view.dispatch(editor.state.tr);
			}
		}
	}, [editor, placeholder]);

	// Extract serialized data (text, skills, mentions)
	const getSerializedData = useCallback((): SerializedInputData => {
		if (!editor) {
			return {
				text: "",
				skills: [],
				mentions: [],
				fullPrompt: "",
				isEmpty: true,
			};
		}

		const skills: Array<{ id: string; name: string; dirPath?: string }> = [];
		const mentions: ChatContextItem[] = [];
		let inlineStreamText = "";

		editor.state.doc.descendants((node) => {
			if (node.type.name === "skillInlineNode") {
				const name = (node.attrs.name as string) || "";
				skills.push({
					id: (node.attrs.id as string) || name,
					name,
					dirPath: (node.attrs.dirPath as string) || undefined,
				});
				inlineStreamText += `[Skill: ${name}]`;
			} else if (node.type.name === "mentionInlineNode") {
				const title = (node.attrs.title as string) || "";
				mentions.push({
					id: (node.attrs.id as string) || `mention_${Date.now()}`,
					type: (node.attrs.type as ChatContextItem["type"]) || "document",
					title,
					subtitle: node.attrs.subtitle as string | undefined,
				});
				inlineStreamText += `@[${title}]`;
			} else if (node.isText) {
				inlineStreamText += node.text || "";
			}
		});

		const trimmedText = inlineStreamText.trim();
		const isEmpty =
			skills.length === 0 && mentions.length === 0 && !trimmedText;

		return {
			text: trimmedText,
			skills,
			mentions,
			fullPrompt: trimmedText,
			isEmpty,
		};
	}, [editor]);

	const insertSkill = useCallback(
		(skill: SlashItem) => {
			if (!editor) return;
			const { from } = editor.state.selection;
			const textBefore = editor.state.doc.textBetween(
				Math.max(0, from - 40),
				from,
				"\n",
				"\0",
			);
			const slashIdx = textBefore.lastIndexOf("/");

			let deleteFrom = from;
			if (slashIdx !== -1) {
				const charCount = textBefore.length - slashIdx;
				deleteFrom = from - charCount;
			}

			editor
				.chain()
				.focus()
				.deleteRange({ from: deleteFrom, to: from })
				.insertContent({
					type: "skillInlineNode",
					attrs: {
						id: skill.id,
						name: skill.name,
						dirPath: skill.skill?.dirPath || "",
					},
				})
				.insertContent(" ")
				.run();

			onTriggerSlash(null);
		},
		[editor, onTriggerSlash],
	);

	const insertMention = useCallback(
		(item: ChatContextItem) => {
			if (!editor) return;
			const { from } = editor.state.selection;
			const textBefore = editor.state.doc.textBetween(
				Math.max(0, from - 40),
				from,
				"\n",
				"\0",
			);
			const atIdx = textBefore.lastIndexOf("@");

			let deleteFrom = from;
			if (atIdx !== -1) {
				const charCount = textBefore.length - atIdx;
				deleteFrom = from - charCount;
			}

			editor
				.chain()
				.focus()
				.deleteRange({ from: deleteFrom, to: from })
				.insertContent({
					type: "mentionInlineNode",
					attrs: {
						id: item.id,
						type: item.type,
						title: item.title,
						subtitle: item.subtitle,
					},
				})
				.insertContent(" ")
				.run();

			onTriggerMention(null);
		},
		[editor, onTriggerMention],
	);

	const removeTrigger = useCallback(
		(char: "@" | "/") => {
			if (!editor) return;
			const { from } = editor.state.selection;
			const textBefore = editor.state.doc.textBetween(
				Math.max(0, from - 40),
				from,
				"\n",
				"\0",
			);
			const triggerIdx = textBefore.lastIndexOf(char);
			let deleteFrom = from;
			if (triggerIdx !== -1) {
				const charCount = textBefore.length - triggerIdx;
				deleteFrom = from - charCount;
			}
			editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();
		},
		[editor],
	);

	const clear = useCallback(() => {
		if (!editor) return;
		editor.commands.clearContent();
	}, [editor]);

	const focus = useCallback(() => {
		if (!editor) return;
		editor.commands.focus();
	}, [editor]);

	const setContent = useCallback(
		(content: string) => {
			if (!editor) return;
			editor.commands.setContent(content);
		},
		[editor],
	);

	const isEmpty = useCallback(() => {
		if (!editor) return true;
		return editor.isEmpty;
	}, [editor]);

	useImperativeHandle(
		ref,
		() => ({
			focus,
			clear,
			setContent,
			insertSkill,
			insertMention,
			removeTrigger,
			getSerializedData,
			isEmpty,
		}),
		[
			focus,
			clear,
			setContent,
			insertSkill,
			insertMention,
			removeTrigger,
			getSerializedData,
			isEmpty,
		],
	);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: clicking container focuses editor
		<div
			className={`chat-inline-editor relative w-full cursor-text overflow-y-auto ${className}`}
			style={{ maxHeight: `${maxHeight}px` }}
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) {
					editor?.commands.focus("end");
				}
			}}
		>
			<EditorContent editor={editor} />
		</div>
	);
});
