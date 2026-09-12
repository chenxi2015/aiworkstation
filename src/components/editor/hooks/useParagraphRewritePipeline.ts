import { toast } from "@heroui/react";
import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { streamRewriteText } from "../../../services/api/editorClient";
import { SuggestionController } from "../utils/suggestionController";

export interface ParagraphPipelineOptions {
	editor: Editor | null;
	docTitle?: string;
	stylePreset?: string;
	onBeforeAiApply?: () => Promise<void>;
}

export interface PipelineProgress {
	isStreaming: boolean;
	currentStep: number;
	totalSteps: number;
	activeSuggestionCount: number;
}

export interface TargetParagraph {
	from: number;
	to: number;
	text: string;
}

/**
 * Sequential streaming paragraph rewrite pipeline:
 * Scans pure text paragraphs (ignoring images, videos, tables, etc.),
 * streams rewrite results block by block directly beneath original text,
 * and maintains ProseMirror position stability.
 */
export function useParagraphRewritePipeline({
	editor,
	docTitle,
	stylePreset,
	onBeforeAiApply,
}: ParagraphPipelineOptions) {
	const [isStreaming, setIsStreaming] = useState(false);
	const [currentStep, setCurrentStep] = useState(0);
	const [totalSteps, setTotalSteps] = useState(0);
	const [activeSuggestionCount, setActiveSuggestionCount] = useState(0);

	const abortControllerRef = useRef<AbortController | null>(null);
	const isCancelledRef = useRef(false);

	// Check whether there are pending suggestions in editor
	const refreshSuggestionStatus = useCallback(() => {
		if (!editor) {
			setActiveSuggestionCount(0);
			return;
		}
		const active = SuggestionController.detectActiveSuggestion(editor);
		setActiveSuggestionCount(active ? 1 : 0);
	}, [editor]);

	useEffect(() => {
		if (!editor) return;
		editor.on("update", refreshSuggestionStatus);
		return () => {
			editor.off("update", refreshSuggestionStatus);
		};
	}, [editor, refreshSuggestionStatus]);

	/**
	 * Find the next eligible pure text paragraph/heading strictly starting at or after searchAfterPos.
	 * Guarantees monotonic top-to-bottom traversal without loopbacks or skips.
	 */
	const findNextTargetParagraph = useCallback(
		(ed: Editor, searchAfterPos = 0): TargetParagraph | null => {
			const { doc } = ed.state;
			let found: TargetParagraph | null = null;

			doc.descendants((node, pos) => {
				if (found) return false;

				// Target top-level paragraph and heading blocks
				if (
					node.isBlock &&
					(node.type.name === "paragraph" || node.type.name === "heading")
				) {
					if (pos < searchAfterPos) {
						// Skip blocks that start before the current cursor
						return false;
					}

					const text = node.textContent.trim();
					// Skip empty lines or trivial one-character spaces
					if (text && text.length >= 2) {
						found = {
							from: pos,
							to: pos + node.nodeSize,
							text,
						};
						return false;
					}
				}

				return true;
			});

			return found;
		},
		[],
	);

	/**
	 * Count total pure text paragraphs to process
	 */
	const countTotalTargetParagraphs = useCallback((ed: Editor) => {
		const { doc } = ed.state;
		let count = 0;
		doc.descendants((node) => {
			if (
				node.isBlock &&
				(node.type.name === "paragraph" || node.type.name === "heading")
			) {
				const text = node.textContent.trim();
				if (text && text.length >= 2) {
					count += 1;
				}
				return false;
			}
			return true;
		});
		return count;
	}, []);

	/**
	 * Stop current pipeline execution
	 */
	const stopPipeline = useCallback(() => {
		isCancelledRef.current = true;
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
		setIsStreaming(false);
		toast.info("已停止段落改写流水线");
		refreshSuggestionStatus();
	}, [refreshSuggestionStatus]);

	/**
	 * Accept all pending suggestions
	 */
	const acceptAll = useCallback(() => {
		if (!editor) return;
		SuggestionController.accept(editor, "");
		setActiveSuggestionCount(0);
		toast.success("已采纳全部改写建议");
	}, [editor]);

	/**
	 * Reject all pending suggestions
	 */
	const rejectAll = useCallback(() => {
		if (!editor) return;
		SuggestionController.reject(editor, "");
		setActiveSuggestionCount(0);
		toast.info("已恢复原文，撤销全部建议");
	}, [editor]);

	/**
	 * Start sequential paragraph streaming rewrite
	 */
	const startPipeline = useCallback(
		async (customInstruction?: string) => {
			if (!editor) {
				toast.warning("编辑器未准备好");
				return;
			}

			if (isStreaming) {
				toast.warning("当前流水线正在运行中");
				return;
			}

			// Clean up previous suggestions before starting fresh
			if (SuggestionController.detectActiveSuggestion(editor)) {
				SuggestionController.accept(editor, "");
			}

			const total = countTotalTargetParagraphs(editor);
			if (total === 0) {
				toast.info("当前文档中没有可供改写的文本段落");
				return;
			}

			await onBeforeAiApply?.();

			setIsStreaming(true);
			isCancelledRef.current = false;
			setTotalSteps(total);
			setCurrentStep(0);

			let stepIndex = 0;
			let searchAfterPos = 0;

			// Reset scroll container to top before starting sequential pipeline
			try {
				const scrollContainer = editor.view.dom.closest(".overflow-y-auto");
				if (scrollContainer) {
					scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
				}
			} catch {
				// Ignore if container is not resolved
			}

			try {
				while (!isCancelledRef.current) {
					const target = findNextTargetParagraph(editor, searchAfterPos);
					if (!target) {
						// All eligible paragraphs rewritten
						break;
					}

					stepIndex += 1;
					setCurrentStep(stepIndex);

					const suggestionId = `pipe_${Date.now()}_${stepIndex}`;

					// 1. Scroll editor viewport smoothly to target paragraph block element
					try {
						let targetElement: Element | null = null;
						const directDom = editor.view.nodeDOM(target.from);
						if (directDom instanceof Element) {
							targetElement = directDom;
						} else {
							const domInfo = editor.view.domAtPos(
								Math.min(target.from + 1, editor.state.doc.content.size),
							);
							let el =
								domInfo.node instanceof Element
									? domInfo.node
									: domInfo.node.parentElement;
							while (
								el?.parentElement &&
								!el.parentElement.classList.contains("ProseMirror")
							) {
								el = el.parentElement;
							}
							targetElement = el;
						}

						if (targetElement) {
							targetElement.scrollIntoView({
								behavior: "smooth",
								block: stepIndex === 1 ? "start" : "center",
							});
						}
					} catch {
						// Fallback if scroll fails
					}

					// 2. Start streaming block beneath target paragraph
					SuggestionController.startStreaming(
						editor,
						{ from: target.from, to: target.to },
						target.text,
						suggestionId,
					);

					// 3. Initiate SSE request for this specific paragraph with full context
					const controller = new AbortController();
					abortControllerRef.current = controller;

					const systemHint =
						customInstruction ||
						"你是一名专业中文写作助手。请对给定的一段正文进行精细润色与优化。保持原意与事实，提升修辞、逻辑连贯性与表达质感。直接输出打磨后的正文段落，不要包含任何前缀、问候或解释说明。";

					let paragraphFullText = "";

					try {
						await streamRewriteText(
							{
								prompt: target.text,
								systemHint,
								stylePreset,
								articleTitle: docTitle,
								paragraphIndex: stepIndex,
								totalParagraphs: total,
							},
							{
								onChunk: (_delta, fullText) => {
									if (isCancelledRef.current) return;
									paragraphFullText = fullText;
									SuggestionController.updateStreaming(
										editor,
										suggestionId,
										fullText,
									);
								},
								onDone: (fullText) => {
									paragraphFullText = fullText;
								},
								onError: (err) => {
									console.warn("[RewritePipeline] Paragraph error:", err);
								},
							},
							controller.signal,
						);
					} catch (e: unknown) {
						if (isCancelledRef.current) break;
						console.error(
							"[RewritePipeline] Stream failed for step:",
							stepIndex,
							e,
						);
					}

					// 4. Finalize streaming for current paragraph into a fine-grained diff
					if (!isCancelledRef.current) {
						const cleanedResult = paragraphFullText.trim() || target.text;
						const finalizeResult = SuggestionController.finalizeStreaming(
							editor,
							suggestionId,
							{ from: target.from, to: target.to },
							target.text,
							cleanedResult,
						);
						// Monotonically advance search cursor to the end of the finalized block
						searchAfterPos = finalizeResult?.to ?? target.to;
					} else {
						searchAfterPos = target.to;
					}

					// Slight delay between paragraphs for smoother visual rhythm
					await new Promise((resolve) => setTimeout(resolve, 150));
				}

				if (!isCancelledRef.current) {
					toast.success(`全文逐段优化完成！共改写 ${stepIndex} 个段落`);
				}
			} finally {
				setIsStreaming(false);
				abortControllerRef.current = null;
				refreshSuggestionStatus();
			}
		},
		[
			editor,
			docTitle,
			isStreaming,
			countTotalTargetParagraphs,
			onBeforeAiApply,
			findNextTargetParagraph,
			stylePreset,
			refreshSuggestionStatus,
		],
	);

	return {
		isStreaming,
		currentStep,
		totalSteps,
		activeSuggestionCount,
		startPipeline,
		stopPipeline,
		acceptAll,
		rejectAll,
	};
}
