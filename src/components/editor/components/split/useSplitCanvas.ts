import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { streamRewriteText } from "../../../../services/api/editorClient";
import { tiptapJsonToMarkdown } from "../../markdown";
import {
	type DocumentVersion,
	PRESET_MODES,
	type SplitCanvasMode,
	type ViewMode,
} from "./types";

export interface UseSplitCanvasOptions {
	leftEditor: Editor;
	docTitle?: string;
	stylePreset?: string;
	initialInstruction?: string;
	initialModeLabel?: string;
}

/**
 * Custom hook to manage the free dual-canvas workbench:
 * - Independent DocumentVersion pool (v0, v1, v2...)
 * - Any-to-any version diff and clean preview
 * - Full-article dynamic streaming generation from floating prompt dock
 * - Inline manual draft editing & status sync
 * - Bi-directional synchronized smooth scrolling
 */
export function useSplitCanvas({
	leftEditor,
	docTitle,
	stylePreset,
	initialInstruction,
	initialModeLabel,
}: UseSplitCanvasOptions) {
	// 1. Initial base version (v0) extracted from left TipTap editor
	const initialBaseMarkdown = useMemo(() => {
		try {
			const md = tiptapJsonToMarkdown(leftEditor.getJSON());
			return md.trim() || leftEditor.getText().trim();
		} catch {
			return leftEditor.getText().trim();
		}
	}, [leftEditor]);

	const [versions, setVersions] = useState<DocumentVersion[]>(() => {
		const v0: DocumentVersion = {
			id: "v0",
			label: "v0: 当前正文 (Base)",
			mode: "original",
			content: initialBaseMarkdown,
			createdAt: Date.now(),
		};
		return [v0];
	});

	const [leftVersionId, setLeftVersionId] = useState<string>("v0");
	const [rightVersionId, setRightVersionId] = useState<string>("v0");
	const [diffViewMode, setDiffViewMode] = useState<ViewMode>("diff");

	const [isStreaming, setIsStreaming] = useState(false);
	const [streamingVersionId, setStreamingVersionId] = useState<string | null>(
		null,
	);

	// Floating prompt dock state
	const [selectedMode, setSelectedMode] = useState<SplitCanvasMode>("spin");
	const [customPrompt, setCustomPrompt] = useState("");

	const leftScrollRef = useRef<HTMLDivElement>(null);
	const rightScrollRef = useRef<HTMLDivElement>(null);
	const isScrollingRef = useRef<"left" | "right" | null>(null);
	const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const abortControllerRef = useRef<AbortController | null>(null);
	const hasInitialTriggeredRef = useRef(false);

	// Bi-directional smooth scrolling
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
		if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
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
		if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
		scrollTimeoutRef.current = setTimeout(() => {
			isScrollingRef.current = null;
		}, 60);
	}, []);

	// Active versions lookup
	const leftVersion = useMemo(
		() => versions.find((v) => v.id === leftVersionId) || versions[0],
		[versions, leftVersionId],
	);

	const rightVersion = useMemo(
		() =>
			versions.find((v) => v.id === rightVersionId) ||
			versions[versions.length - 1],
		[versions, rightVersionId],
	);

	// Stop generation handler
	const handleStopGenerate = useCallback(() => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
		setIsStreaming(false);
		setStreamingVersionId(null);
	}, []);

	// Start generation handler
	const handleStartGenerate = useCallback(
		async (modeOverride?: SplitCanvasMode, instructionOverride?: string) => {
			const mode = modeOverride || selectedMode;
			const preset = PRESET_MODES.find((m) => m.id === mode) || PRESET_MODES[0];
			const promptExtra =
				instructionOverride !== undefined ? instructionOverride : customPrompt;

			// Base content to transform
			const baseContent = leftVersion.content.trim() || initialBaseMarkdown;
			if (!baseContent) return;

			// Generate new version ID
			const nextIndex = versions.length;
			const newVerId = `v${nextIndex}`;
			const label = `${newVerId}: ${preset.label}${promptExtra ? ` (${promptExtra.slice(0, 10)})` : ""}`;

			const newVersion: DocumentVersion = {
				id: newVerId,
				label,
				mode,
				content: "",
				createdAt: Date.now(),
				instruction: promptExtra,
			};

			setVersions((prev) => [...prev, newVersion]);
			setRightVersionId(newVerId);
			setIsStreaming(true);
			setStreamingVersionId(newVerId);

			const controller = new AbortController();
			abortControllerRef.current = controller;

			const fullHint = promptExtra
				? `${preset.defaultHint}\n\n【用户补充的特别要求】：\n${promptExtra}`
				: preset.defaultHint;

			try {
				await streamRewriteText(
					{
						prompt: baseContent,
						systemHint: fullHint,
						stylePreset,
						articleTitle: docTitle,
					},
					{
						onChunk: (_delta, fullText) => {
							setVersions((prev) =>
								prev.map((v) =>
									v.id === newVerId ? { ...v, content: fullText } : v,
								),
							);
							// Auto scroll right column to bottom as it writes
							if (rightScrollRef.current) {
								rightScrollRef.current.scrollTop =
									rightScrollRef.current.scrollHeight;
							}
						},
						onDone: (fullText) => {
							setVersions((prev) =>
								prev.map((v) =>
									v.id === newVerId
										? { ...v, content: fullText || baseContent }
										: v,
								),
							);
							setIsStreaming(false);
							setStreamingVersionId(null);
						},
						onError: (err) => {
							console.warn("[useSplitCanvas] Stream error:", err);
							setIsStreaming(false);
							setStreamingVersionId(null);
						},
					},
					controller.signal,
				);
			} catch (err) {
				if (!controller.signal.aborted) {
					console.error("[useSplitCanvas] Generation error:", err);
				}
				setIsStreaming(false);
				setStreamingVersionId(null);
			}
		},
		[
			selectedMode,
			customPrompt,
			leftVersion.content,
			initialBaseMarkdown,
			versions.length,
			stylePreset,
			docTitle,
		],
	);

	// Handle initial instruction if invoked externally (e.g. from Toolbar AI Rewrite Dropdown)
	useEffect(() => {
		if (hasInitialTriggeredRef.current) return;
		if (initialInstruction || initialModeLabel) {
			hasInitialTriggeredRef.current = true;
			const matchedMode =
				PRESET_MODES.find((m) => m.label === initialModeLabel)?.id || "spin";
			setSelectedMode(matchedMode);
			void handleStartGenerate(matchedMode, initialInstruction);
		}
	}, [initialInstruction, initialModeLabel, handleStartGenerate]);

	// Clean up streaming on unmount
	useEffect(() => {
		return () => {
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
			}
		};
	}, []);

	// Update version content directly from manual user edits
	const handleUpdateVersionContent = useCallback(
		(versionId: string, newContent: string) => {
			setVersions((prev) =>
				prev.map((v) => {
					if (v.id === versionId) {
						return {
							...v,
							content: newContent,
							mode: "manual",
							label: v.label.includes("(精修)") ? v.label : `${v.label} (精修)`,
						};
					}
					return v;
				}),
			);
		},
		[],
	);

	// Quick stats
	const diffStats = useMemo(() => {
		const leftLen = leftVersion?.content.length || 0;
		const rightLen = rightVersion?.content.length || 0;
		return {
			leftLen,
			rightLen,
			diffCount: rightLen - leftLen,
		};
	}, [leftVersion, rightVersion]);

	return {
		versions,
		leftVersion,
		rightVersion,
		leftVersionId,
		rightVersionId,
		setLeftVersionId,
		setRightVersionId,
		diffViewMode,
		setDiffViewMode,
		isStreaming,
		streamingVersionId,
		selectedMode,
		setSelectedMode,
		customPrompt,
		setCustomPrompt,
		leftScrollRef,
		rightScrollRef,
		handleLeftScroll,
		handleRightScroll,
		handleStartGenerate,
		handleStopGenerate,
		handleUpdateVersionContent,
		diffStats,
	};
}
