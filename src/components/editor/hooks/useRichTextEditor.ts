import { type Editor, type Range, useEditor } from "@tiptap/react";
import { useEffect, useReducer, useRef, useState } from "react";
import type { SlashCommandMenuRef } from "../components/SlashCommandMenu";
import { getEditorBaseExtensions } from "../extensions/baseExtensions";
import { SlashCommands } from "../extensions/slashCommand";
import {
	extractImageUrl,
	extractMultipleMediaUrls,
	extractVideoUrl,
} from "../importers";
import { markdownToTiptapDoc } from "../markdown";
import {
	extractMediaFiles,
	getMediaFileKind,
	shouldTreatAsMarkdown,
} from "../utils/clipboard";

export interface SlashMenuState {
	query: string;
	range: Range;
	clientRect: (() => DOMRect | null) | null;
	command: (item: unknown) => void;
}

export interface UseRichTextEditorOptions {
	docId: number;
	initialContent: string;
	onChange: (contentJson: string, contentText: string) => void;
	onEditorReady?: (editor: Editor | null) => void;
	insertAndUploadMediaFiles: (files: File[]) => Promise<void>;
	externalEditorRef?: { current: Editor | null };
}

/**
 * Hook for initializing and managing TipTap Editor instance, extensions, and event handlers
 */
export function useRichTextEditor({
	docId,
	initialContent,
	onChange,
	onEditorReady,
	insertAndUploadMediaFiles,
	externalEditorRef,
}: UseRichTextEditorOptions) {
	const [, forceRender] = useReducer((x: number) => x + 1, 0);
	const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
	const slashMenuRef = useRef<SlashCommandMenuRef>(null);
	const editorRef = useRef<Editor | null>(null);

	const editor = useEditor({
		immediatelyRender: false,
		extensions: [
			...getEditorBaseExtensions(),
			SlashCommands.configure({
				suggestion: {
					render: () => ({
						onStart: (props) => {
							setSlashMenu({
								query: props.query,
								range: props.range,
								clientRect: props.clientRect ?? null,
								command: props.command,
							});
						},
						onUpdate: (props) => {
							setSlashMenu((prev) =>
								prev
									? {
											...prev,
											query: props.query,
											range: props.range,
											clientRect: props.clientRect ?? null,
										}
									: null,
							);
						},
						onKeyDown: (props) => {
							if (slashMenuRef.current) {
								return slashMenuRef.current.onKeyDown(props.event);
							}
							return false;
						},
						onExit: () => {
							setSlashMenu(null);
						},
					}),
				},
			}),
		],
		editorProps: {
			handlePaste: (_view, event) => {
				// 1. Check for media files (pasted local files from Finder/Explorer, screenshots, etc.)
				const mediaFiles = extractMediaFiles(event.clipboardData);
				if (mediaFiles.some((f) => getMediaFileKind(f) !== null)) {
					event.preventDefault();
					insertAndUploadMediaFiles(mediaFiles);
					return true;
				}

				// 2. Check for plain text URLs (multiple media lines, single video URL, single image URL, or markdown)
				const text = event.clipboardData?.getData("text/plain")?.trim();
				if (text && editorRef.current) {
					// 2.1 Multiple media URLs/lines -> batch insert image/video blocks
					const multiMedia = extractMultipleMediaUrls(text);
					if (multiMedia.length > 0) {
						event.preventDefault();
						const nodes = multiMedia.map((item) => ({
							type: item.kind,
							attrs: { src: item.url },
						}));
						editorRef.current.chain().focus().insertContent(nodes).run();
						return true;
					}

					// 2.2 Video URL -> render directly as interactive video
					const videoUrl = extractVideoUrl(text);
					if (videoUrl) {
						editorRef.current
							.chain()
							.focus()
							.insertContent({ type: "video", attrs: { src: videoUrl } })
							.run();
						return true;
					}

					// 2.3 Image URL -> render directly as image
					const imageUrl = extractImageUrl(text);
					if (imageUrl) {
						editorRef.current.chain().focus().setImage({ src: imageUrl }).run();
						return true;
					}

					// 2.4 Markdown content -> convert to formatted rich text
					const html = event.clipboardData?.getData("text/html");
					if (shouldTreatAsMarkdown(text, html)) {
						const { nodes } = markdownToTiptapDoc(text);
						if (nodes.length > 0) {
							event.preventDefault();
							editorRef.current.chain().focus().insertContent(nodes).run();
							return true;
						}
					}
				}
				return false;
			},
			handleDrop: (_view, event, _slice, moved) => {
				if (moved) return false;
				const mediaFiles = extractMediaFiles(event.dataTransfer);
				if (mediaFiles.some((f) => getMediaFileKind(f) !== null)) {
					event.preventDefault();
					insertAndUploadMediaFiles(mediaFiles);
					return true;
				}
				return false;
			},
		},
		content: initialContent ? JSON.parse(initialContent) : "",
		onUpdate: ({ editor: e }) => {
			onChange(JSON.stringify(e.getJSON()), e.getText());
		},
		onTransaction: () => forceRender(),
	});

	editorRef.current = editor;
	if (externalEditorRef) {
		externalEditorRef.current = editor;
	}
	if (editor) {
		(editor as unknown as { docId: number }).docId = docId;
	}

	useEffect(() => {
		onEditorReady?.(editor);
		return () => {
			onEditorReady?.(null);
		};
	}, [editor, onEditorReady]);

	return {
		editor,
		editorRef,
		slashMenu,
		setSlashMenu,
		slashMenuRef,
	};
}
