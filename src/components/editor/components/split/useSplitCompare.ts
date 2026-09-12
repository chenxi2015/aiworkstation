import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { streamRewriteText } from "../../../../services/api/editorClient";
import type { DocBlock } from "./types";
import { parseDocToBlocks } from "./utils";

export interface UseSplitCompareOptions {
	leftEditor: Editor;
	docTitle?: string;
	stylePreset?: string;
	instruction?: string;
}

/**
 * Custom hook to manage split compare pipeline, streaming state, sync scrolling, and stats.
 */
export function useSplitCompare({
	leftEditor,
	docTitle,
	stylePreset,
	instruction,
}: UseSplitCompareOptions) {
	const initialBlocks = useMemo(
		() => parseDocToBlocks(leftEditor),
		[leftEditor],
	);
	const [blocks, setBlocks] = useState<DocBlock[]>(initialBlocks);
	const [isStreaming, setIsStreaming] = useState(true);
	const [currentStep, setCurrentStep] = useState(0);

	const leftScrollRef = useRef<HTMLDivElement>(null);
	const rightScrollRef = useRef<HTMLDivElement>(null);
	const isScrollingRef = useRef<"left" | "right" | null>(null);
	const scrollTimeoutRef = useRef<any>(null);
	const abortControllerRef = useRef<AbortController | null>(null);
	const isCancelledRef = useRef(false);

	const textBlocks = useMemo(
		() => blocks.filter((b) => b.type === "text"),
		[blocks],
	);
	const totalSteps = textBlocks.length;

	// Freeze left editor's editability during comparison
	useEffect(() => {
		const prevEditable = leftEditor.isEditable;
		leftEditor.setEditable(false);
		return () => {
			leftEditor.setEditable(prevEditable);
		};
	}, [leftEditor]);

	// 1. Bi-directional sync scrolling
	const handleLeftScroll = useCallback(() => {
		if (isScrollingRef.current === "right") return;
		isScrollingRef.current = "left";
		if (leftScrollRef.current && rightScrollRef.current) {
			const left = leftScrollRef.current;
			const right = rightScrollRef.current;
			const maxScrollLeft = left.scrollHeight - left.clientHeight;
			const maxScrollRight = right.scrollHeight - right.clientHeight;
			if (maxScrollLeft > 0 && maxScrollRight > 0) {
				const ratio = left.scrollTop / maxScrollLeft;
				right.scrollTop = ratio * maxScrollRight;
			}
		}
		clearTimeout(scrollTimeoutRef.current);
		scrollTimeoutRef.current = setTimeout(() => {
			isScrollingRef.current = null;
		}, 60);
	}, []);

	const handleRightScroll = useCallback(() => {
		if (isScrollingRef.current === "left") return;
		isScrollingRef.current = "right";
		if (leftScrollRef.current && rightScrollRef.current) {
			const left = leftScrollRef.current;
			const right = rightScrollRef.current;
			const maxScrollLeft = left.scrollHeight - left.clientHeight;
			const maxScrollRight = right.scrollHeight - right.clientHeight;
			if (maxScrollLeft > 0 && maxScrollRight > 0) {
				const ratio = right.scrollTop / maxScrollRight;
				left.scrollTop = ratio * maxScrollLeft;
			}
		}
		clearTimeout(scrollTimeoutRef.current);
		scrollTimeoutRef.current = setTimeout(() => {
			isScrollingRef.current = null;
		}, 60);
	}, []);

	// 2. Sequential streaming pipeline
	useEffect(() => {
		let active = true;
		isCancelledRef.current = false;

		const runPipeline = async () => {
			const textItems = initialBlocks.filter((b) => b.type === "text");
			if (textItems.length === 0) {
				setIsStreaming(false);
				return;
			}

			setIsStreaming(true);

			for (let i = 0; i < textItems.length; i++) {
				if (!active || isCancelledRef.current) break;

				const target = textItems[i];
				setCurrentStep(i + 1);

				// Mark current block as actively streaming
				setBlocks((prev) =>
					prev.map((b) =>
						b.id === target.id ? { ...b, status: "streaming" as const } : b,
					),
				);

				// Scroll both columns to current block
				try {
					const leftEl = leftScrollRef.current?.querySelector(
						`[data-block-id="${target.id}"]`,
					);
					const rightEl = rightScrollRef.current?.querySelector(
						`[data-block-id="${target.id}"]`,
					);
					leftEl?.scrollIntoView({ behavior: "smooth", block: "center" });
					rightEl?.scrollIntoView({ behavior: "smooth", block: "center" });
				} catch {
					// Ignore DOM query failures
				}

				const controller = new AbortController();
				abortControllerRef.current = controller;

				const systemHint =
					instruction ||
					"你是一名专业中文写作助手。请对给定的一段正文进行精细润色与优化。保持原意与事实，提升修辞、逻辑连贯性与表达质感。直接输出打磨后的正文段落，不要包含任何前缀、问候或解释说明。";

				let accumulatedText = "";

				try {
					await streamRewriteText(
						{
							prompt: target.originalText,
							systemHint,
							stylePreset,
							articleTitle: docTitle,
							paragraphIndex: i + 1,
							totalParagraphs: textItems.length,
						},
						{
							onChunk: (_delta, full) => {
								if (!active || isCancelledRef.current) return;
								accumulatedText = full;
								setBlocks((prev) =>
									prev.map((b) =>
										b.id === target.id ? { ...b, revisedText: full } : b,
									),
								);
							},
							onDone: (full) => {
								accumulatedText = full;
							},
							onError: (err) => {
								console.warn("[useSplitCompare] Paragraph error:", err);
							},
						},
						controller.signal,
					);
				} catch (err: unknown) {
					if (!active || isCancelledRef.current) break;
					console.error("[useSplitCompare] Stream error:", err);
				}

				const finalized = accumulatedText.trim() || target.originalText;

				setBlocks((prev) =>
					prev.map((b) =>
						b.id === target.id
							? { ...b, revisedText: finalized, status: "done" as const }
							: b,
					),
				);

				// Small visual breathing room between paragraphs
				await new Promise((r) => setTimeout(r, 120));
			}

			if (active && !isCancelledRef.current) {
				setIsStreaming(false);
			}
		};

		void runPipeline();

		return () => {
			active = false;
			isCancelledRef.current = true;
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
				abortControllerRef.current = null;
			}
		};
	}, [initialBlocks, docTitle, stylePreset, instruction]);

	const handleStop = useCallback(() => {
		isCancelledRef.current = true;
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
		setIsStreaming(false);
	}, []);

	// Stats
	const diffStats = useMemo(() => {
		let totalOriginal = 0;
		let totalRevised = 0;
		for (const b of blocks) {
			if (b.type === "text") {
				totalOriginal += b.originalText.length;
				totalRevised += (b.revisedText || b.originalText).length;
			}
		}
		const diffCount = totalRevised - totalOriginal;
		return {
			originalLen: totalOriginal,
			revisedLen: totalRevised,
			diffCount,
		};
	}, [blocks]);

	return {
		blocks,
		isStreaming,
		currentStep,
		totalSteps,
		diffStats,
		leftScrollRef,
		rightScrollRef,
		handleLeftScroll,
		handleRightScroll,
		handleStop,
	};
}
