import { type Editor, type Range, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { uploadAssetRpc } from "../../../services/api/editorClient";
import type { SlashCommandMenuRef } from "../components/SlashCommandMenu";
import { getEditorBaseExtensions } from "../extensions/baseExtensions";
import { SlashCommands } from "../extensions/slashCommand";
import {
	extractImageUrl,
	extractMultipleMediaUrls,
	extractVideoUrl,
} from "../importers";
import { markdownToHtml } from "../markdown";
import {
	dataUrlToFile,
	extractMediaFiles,
	getMediaFileKind,
	shouldTreatAsMarkdown,
	updateMediaSrc,
} from "../utils/clipboard";
import {
	normalizeCodeCardDoc,
	normalizeCodeCardHtml,
} from "../utils/codeCardNormalizer";

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
	const base64ScanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const base64UploadingSrcsRef = useRef<Set<string>>(new Set());

	// 内联 base64 媒体转存到当前文档资产目录，替换为 /api/files/... 本地 URL
	const migrateBase64MediaToAssets = useCallback(() => {
		const currentEditor = editorRef.current;
		if (!currentEditor || currentEditor.isDestroyed) return;
		const inflight = base64UploadingSrcsRef.current;
		const targets: string[] = [];
		currentEditor.state.doc.descendants((node) => {
			if (node.type.name !== "image" && node.type.name !== "video") return;
			const src = node.attrs.src;
			if (
				typeof src === "string" &&
				src.startsWith("data:") &&
				!inflight.has(src)
			) {
				targets.push(src);
			}
		});
		for (const src of targets) {
			inflight.add(src);
			void (async () => {
				try {
					const file = dataUrlToFile(src);
					const { url } = await uploadAssetRpc(docId, file);
					const latestEditor = editorRef.current;
					if (latestEditor && !latestEditor.isDestroyed) {
						updateMediaSrc(latestEditor, src, url);
					}
				} catch (err) {
					console.warn(
						"[useRichTextEditor] base64 媒体转存失败，保留内联 data URL:",
						err,
					);
				} finally {
					inflight.delete(src);
				}
			})();
		}
	}, [docId]);

	const scheduleBase64Migration = () => {
		if (base64ScanTimerRef.current) clearTimeout(base64ScanTimerRef.current);
		base64ScanTimerRef.current = setTimeout(migrateBase64MediaToAssets, 1200);
	};

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

					// 2.4 Markdown content -> convert to formatted rich text via native TipTap parseHTML
					const html = event.clipboardData?.getData("text/html");
					if (shouldTreatAsMarkdown(text, html)) {
						try {
							const parsedHtml = markdownToHtml(text);
							if (parsedHtml) {
								event.preventDefault();
								editorRef.current
									.chain()
									.focus()
									.insertContent(parsedHtml)
									.run();
								return true;
							}
						} catch (err) {
							console.error("Failed to insert parsed markdown HTML:", err);
							// Fallback to inserting plain text if unexpected error occurs
							event.preventDefault();
							editorRef.current.chain().focus().insertContent(text).run();
							return true;
						}
					}
				}

				// 3. Rich HTML (e.g. 公众号「优化样式」排版): 把自定义深色代码卡片还原为
				//    独立完整的 <pre>，交给 TipTap 自带代码块卡片渲染，避免卡片套卡片
				const richHtml = event.clipboardData?.getData("text/html");
				if (richHtml && editorRef.current) {
					const normalized = normalizeCodeCardHtml(richHtml);
					if (normalized !== richHtml) {
						event.preventDefault();
						editorRef.current.chain().focus().insertContent(normalized).run();
						return true;
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
		content: (() => {
			if (!initialContent) return "";
			try {
				// JSON 正文原样加载（仅做代码卡片归一化）：
				// 完整保留 styledContainer 卡片与内联样式的排版效果。
				// ⚠️ 切勿在此做 markdown 往返（tiptapJsonToMarkdown → markdownToHtml），
				//    markdown 无法表达排版样式，往返会把整篇文章的样式全部洗掉。
				return normalizeCodeCardDoc(JSON.parse(initialContent));
			} catch {
				// 历史遗留的 Markdown / 纯文本正文
				return markdownToHtml(initialContent) || initialContent;
			}
		})(),
		onUpdate: ({ editor: e }) => {
			onChange(JSON.stringify(e.getJSON()), e.getText());
			scheduleBase64Migration();
		},
		onTransaction: () => forceRender(),
	});

	// 打开含历史 base64 图片的文档时，自动转存一次
	useEffect(() => {
		if (!editor) return;
		const timer = setTimeout(migrateBase64MediaToAssets, 1500);
		return () => clearTimeout(timer);
	}, [editor, migrateBase64MediaToAssets]);

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
