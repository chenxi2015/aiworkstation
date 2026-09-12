import { toast } from "@heroui/react";
import type { Editor } from "@tiptap/core";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import { streamRewriteText } from "../../../services/api/editorClient";
import { markdownToTiptapDoc } from "../markdown";

export interface ArticleCreationOptions {
	editorRef: React.RefObject<Editor | null>;
	onFlushSave?: () => Promise<void>;
}

export interface StartCreationParams {
	title: string;
	prompt: string;
	stylePreset?: string;
}

export interface UseArticleCreationPipelineReturn {
	isStreaming: boolean;
	creationTitle: string;
	streamedWordCount: number;
	startCreation: (params: StartCreationParams) => Promise<void>;
	stopCreation: () => void;
}

/**
 * Sequential full-article streaming creation pipeline:
 * Dynamically streams newly composed articles into a single rich-text editor canvas
 * using SSE chunks with throttled ProseMirror node rendering.
 */
export function useArticleCreationPipeline({
	editorRef,
	onFlushSave,
}: ArticleCreationOptions): UseArticleCreationPipelineReturn {
	const [isStreaming, setIsStreaming] = useState(false);
	const [creationTitle, setCreationTitle] = useState("");
	const [streamedWordCount, setStreamedWordCount] = useState(0);

	const abortControllerRef = useRef<AbortController | null>(null);
	const isCancelledRef = useRef(false);
	const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingTextRef = useRef<string>("");

	const applyContentToEditor = useCallback(
		(text: string, isFinal = false) => {
			const editor = editorRef.current;
			if (!editor) return;

			try {
				const { nodes } = markdownToTiptapDoc(text);
				editor.commands.setContent(
					{
						type: "doc",
						content: nodes.length > 0 ? nodes : [{ type: "paragraph" }],
					},
					{ emitUpdate: isFinal },
				);

				// Keep scroll container following new lines during generation
				const scrollEl = editor.view.dom.closest(".overflow-y-auto");
				if (scrollEl) {
					scrollEl.scrollTop = scrollEl.scrollHeight;
				}
			} catch (err) {
				console.warn("[ArticleCreationPipeline] setContent error:", err);
			}
		},
		[editorRef],
	);

	const stopCreation = useCallback(() => {
		isCancelledRef.current = true;
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
		if (throttleTimerRef.current) {
			clearTimeout(throttleTimerRef.current);
			throttleTimerRef.current = null;
		}
		// Flush any remaining accumulated text
		if (pendingTextRef.current) {
			applyContentToEditor(pendingTextRef.current, true);
		}
		setIsStreaming(false);
		toast.info("已停止文章生成，保留已创作内容");
		void onFlushSave?.();
	}, [applyContentToEditor, onFlushSave]);

	const startCreation = useCallback(
		async ({ title, prompt, stylePreset }: StartCreationParams) => {
			if (isStreaming) {
				toast.warning("当前已有文章正在生成中");
				return;
			}

			// Helper to wait briefly for editor instance if switching documents
			let editor = editorRef.current;
			if (!editor) {
				for (let i = 0; i < 15; i++) {
					await new Promise((r) => setTimeout(r, 60));
					if (editorRef.current) {
						editor = editorRef.current;
						break;
					}
				}
			}

			if (!editor) {
				toast.warning("编辑器未准备好");
				return;
			}

			// Clear editor for fresh article composition
			editor.commands.clearContent();

			setIsStreaming(true);
			setCreationTitle(title);
			setStreamedWordCount(0);
			isCancelledRef.current = false;
			pendingTextRef.current = "";

			const controller = new AbortController();
			abortControllerRef.current = controller;

			const effectivePrompt =
				prompt?.trim() ||
				`请围绕主题《${title}》展开创作一篇全面深刻、结构严密的专业长文。`;

			const systemHint = `你是一名顶级资深专栏作家与研究员。请根据用户给出的文章标题与创作要求，直接创作一篇深度长文。
【格式排版铁律】：
1. 采用规范的 Markdown 格式排版（包含各级标题 # / ## / ###、加粗、引用、列表等）；
2. 严禁输出任何问候语、开场白、确认语（例如严禁输出“好的”、“我为你撰写如下”等）或尾部闲话；
3. 直接输出文章正文内容，保持文字质感饱满、论证严密、文风契合。`;

			try {
				await streamRewriteText(
					{
						prompt: effectivePrompt,
						systemHint,
						stylePreset,
						articleTitle: title,
					},
					{
						onChunk: (_delta, fullText) => {
							if (isCancelledRef.current) return;
							pendingTextRef.current = fullText;
							setStreamedWordCount(fullText.length);

							// Throttle editor update to ~60ms for smooth 60fps rendering
							if (!throttleTimerRef.current) {
								throttleTimerRef.current = setTimeout(() => {
									throttleTimerRef.current = null;
									if (!isCancelledRef.current && pendingTextRef.current) {
										applyContentToEditor(pendingTextRef.current, false);
									}
								}, 60);
							}
						},
						onDone: (fullText) => {
							if (throttleTimerRef.current) {
								clearTimeout(throttleTimerRef.current);
								throttleTimerRef.current = null;
							}
							applyContentToEditor(fullText, true);
							setIsStreaming(false);
							setStreamedWordCount(fullText.length);
							toast.success(`《${title}》已创作完毕，正文已自动保存！`);
							void onFlushSave?.();
						},
						onError: (err) => {
							console.warn("[ArticleCreationPipeline] Stream error:", err);
							toast.warning(`生成过程中出现异常: ${err}`);
							setIsStreaming(false);
						},
					},
					controller.signal,
				);
			} catch (e: unknown) {
				if (isCancelledRef.current) return;
				console.error("[ArticleCreationPipeline] Failed:", e);
				setIsStreaming(false);
			}
		},
		[editorRef, isStreaming, applyContentToEditor, onFlushSave],
	);

	return {
		isStreaming,
		creationTitle,
		streamedWordCount,
		startCreation,
		stopCreation,
	};
}
