import { toast } from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { streamRewriteText } from "../../../services/api/editorClient";
import {
	buildHighlightedMarkdown,
	computeDiffWordDelta,
	markdownToPlainText,
} from "../../editor/utils/diffHelper";

export type DiffViewMode = "clean" | "diff";

export interface UseNoteSplitDiffOptions {
	originalContent: string;
	docTitle?: string;
	initialInstruction?: string;
	initialModeLabel?: string;
}

/**
 * Hook to manage markdown text diff comparison and AI streaming generation for Obsidian notes.
 */
export function useNoteSplitDiff({
	originalContent,
	docTitle,
	initialInstruction,
	initialModeLabel,
}: UseNoteSplitDiffOptions) {
	const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>("clean");
	const [draftContent, setDraftContent] = useState<string>("");
	const [isStreaming, setIsStreaming] = useState<boolean>(false);
	const [activeModeLabel, setActiveModeLabel] = useState<string | undefined>(
		initialModeLabel,
	);

	const abortControllerRef = useRef<AbortController | null>(null);
	const autoStartedRef = useRef<boolean>(false);

	// Stop ongoing streaming generation
	const stopGenerate = useCallback(() => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
		setIsStreaming(false);
	}, []);

	// Start or restart AI rewrite stream
	const startGenerate = useCallback(
		async (instructionOverride?: string, modeLabelOverride?: string) => {
			stopGenerate();

			const instruction =
				instructionOverride !== undefined
					? instructionOverride
					: initialInstruction || "";
			const label =
				modeLabelOverride !== undefined
					? modeLabelOverride
					: initialModeLabel || "全文润色";

			setActiveModeLabel(label);

			const baseText = originalContent.trim();
			if (!baseText && !instruction.trim()) {
				toast.warning("当前笔记内容为空，请输入改写或创作要求");
				return;
			}

			setIsStreaming(true);
			setDraftContent("");

			const controller = new AbortController();
			abortControllerRef.current = controller;

			let systemHint = "";
			if (!baseText) {
				systemHint = `你是一名专业中文知识与笔记写作大师。请根据以下用户提出的明确要求，直接构思并撰写高质量的 Markdown 笔记正文：\n\n【用户明确要求】：\n${instruction.trim()}\n\n【输出形态契约（最高优先级）】：纯 Markdown 正文，直接输出排版工整、层级清晰的正文，严禁输出任何问候、开场白、代码围栏包裹或解释说明。`;
			} else if (label.includes("洗稿") || label.includes("二创")) {
				const customReq = instruction.trim()
					? `\n补充要求：${instruction.trim().slice(0, 300)}`
					: "";
				systemHint = `你是一名资深内容二创与知识重构专家。请基于当前笔记事实进行深度重构：
1. 彻底打破原有句式与段落组织，重构叙事逻辑与切入视角；
2. 完整保留原文的核心要点、事实与关键数据，严禁无中生有；
3. 【配图与链接保留铁律】：原文中若包含任何 Markdown 图片（如 \`![说明](URL)\`）或双链（如 \`[[笔记名]]\`），必须完整原样保留，严禁擅自删除！
4. 直接输出纯 Markdown 正文，不要包含任何前缀、问候或额外解释。${customReq}`;
			} else if (label.includes("结构化")) {
				systemHint = `你是一名知识工程与笔记架构师。请将以下零散记录、速记或笔记重构为结构清晰的 Markdown 技术/知识文档：
1. 梳理清晰的层级标题结构（H1~H3）、要点列表与逻辑脉络；
2. 保持原有所有核心信息和结论不变；
3. 【配图与链接保留铁律】：原文中的所有图片与双链语法必须完整保留；
4. 直接输出重构后的纯 Markdown 正文，严禁包裹外层代码块或输出额外说明。`;
			} else {
				// Default: 全文润色
				systemHint = `你是一名专业文字编辑与学术笔记润色大师。请对以下笔记进行全面润色与提升：
1. 纠正错别字、语病，优化行文结构与表达质感，保持学术与技术严谨性；
2. 保持原有 Markdown 结构、列表、代码块与数学公式完好；
3. 【配图与链接保留铁律】：原文中若包含任何 Markdown 图片或双链，必须原样保留；
4. 直接输出润色后的纯 Markdown 正文，不要包含任何前缀、问候或额外说明。`;
			}

			try {
				await streamRewriteText(
					{
						prompt: baseText || instruction.trim(),
						systemHint,
						articleTitle: docTitle,
					},
					{
						onChunk: (_delta, fullText) => {
							setDraftContent(fullText);
						},
						onDone: (fullText) => {
							setDraftContent(fullText);
							setIsStreaming(false);
							toast.success("AI 改写完成，可对比审阅");
						},
						onError: (err) => {
							setIsStreaming(false);
							toast.danger(`改写生成出错: ${err}`);
						},
					},
					controller.signal,
				);
			} catch (err: unknown) {
				if (err instanceof Error && err.name === "AbortError") {
					// User cancelled deliberately
					return;
				}
				setIsStreaming(false);
				console.error("[useNoteSplitDiff] stream error:", err);
			}
		},
		[
			stopGenerate,
			originalContent,
			initialInstruction,
			initialModeLabel,
			docTitle,
		],
	);

	// Auto-trigger generation if an instruction was provided on mount
	useEffect(() => {
		if (autoStartedRef.current) return;
		autoStartedRef.current = true;
		if (initialInstruction || initialModeLabel) {
			void startGenerate(initialInstruction, initialModeLabel);
		}
	}, [initialInstruction, initialModeLabel, startGenerate]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
			}
		};
	}, []);

	// Diff highlights and word counts
	const diffStrings = useMemo(() => {
		if (diffViewMode !== "diff") {
			return { leftHighlighted: "", rightHighlighted: "", diffDelta: 0 };
		}
		if (!draftContent) {
			return {
				leftHighlighted: originalContent,
				rightHighlighted: "",
				diffDelta: 0,
			};
		}
		const leftHighlighted = buildHighlightedMarkdown(
			originalContent,
			draftContent,
			"base",
		);
		const rightHighlighted = buildHighlightedMarkdown(
			originalContent,
			draftContent,
			"revised",
		);
		const diffDelta = computeDiffWordDelta(originalContent, draftContent);
		return { leftHighlighted, rightHighlighted, diffDelta };
	}, [diffViewMode, originalContent, draftContent]);

	const leftWordCount = useMemo(() => {
		return markdownToPlainText(originalContent).length;
	}, [originalContent]);

	const rightWordCount = useMemo(() => {
		return markdownToPlainText(draftContent).length;
	}, [draftContent]);

	return {
		diffViewMode,
		setDiffViewMode,
		draftContent,
		setDraftContent,
		isStreaming,
		activeModeLabel,
		diffStrings,
		leftWordCount,
		rightWordCount,
		startGenerate,
		stopGenerate,
	};
}
