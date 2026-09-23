import { toast } from "@heroui/react";
import type { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { streamRewriteText } from "../../../../../services/api/editorClient";
import { markdownToTiptapDoc } from "../../../markdown";
import { normalizeAiGeneratedDocument } from "../../../utils/aiOutputNormalizer";
import { recordSplitPracticeSession } from "../services/splitChatSessionService";
import { PRESET_MODES, type SplitCanvasMode } from "../types";
import { DRAFT_VERSION_ID } from "./useSplitVersions";

export interface UseSplitAiStreamOptions {
	docId?: number;
	rightEditor: Editor | null;
	leftEditor: Editor;
	activeLeftVersion: { content: string };
	initialBaseMarkdown: string;
	docTitle?: string;
	stylePreset?: string;
	instruction?: string;
	modeLabel?: string;
	rightScrollRef: React.RefObject<HTMLDivElement | null>;
	isRightAtBottomRef: React.MutableRefObject<boolean>;
	setRightVersionId: (id: string) => void;
	setRightWordCount: (count: number) => void;
	setDraftContent: (content: string) => void;
	setDraftContentJson: (json: JSONContent) => void;
	draftOriginRef: React.MutableRefObject<"human" | "ai">;
	draftActionRef: React.MutableRefObject<string>;
}

export function useSplitAiStream({
	docId,
	rightEditor,
	leftEditor,
	activeLeftVersion,
	initialBaseMarkdown,
	docTitle,
	stylePreset,
	instruction,
	modeLabel,
	rightScrollRef,
	isRightAtBottomRef,
	setRightVersionId,
	setRightWordCount,
	setDraftContent,
	setDraftContentJson,
	draftOriginRef,
	draftActionRef,
}: UseSplitAiStreamOptions) {
	const [selectedMode, setSelectedMode] = useState<SplitCanvasMode | null>(
		() => {
			if (modeLabel) {
				const matched = PRESET_MODES.find((m) => m.label === modeLabel);
				if (matched) return matched.id;
			}
			return null;
		},
	);
	const [customPrompt, setCustomPrompt] = useState(instruction || "");
	const [isStreaming, setIsStreaming] = useState(false);
	const abortControllerRef = useRef<AbortController | null>(null);

	// Stop AI generation
	const handleStopGenerate = useCallback(() => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
		setIsStreaming(false);
	}, []);

	// Start AI generation into right rich text editor
	const handleStartGenerate = useCallback(
		async (
			modeOverride?: SplitCanvasMode | null,
			instructionOverride?: string,
		) => {
			if (!rightEditor) return;

			const mode = modeOverride !== undefined ? modeOverride : selectedMode;
			const preset = mode ? PRESET_MODES.find((m) => m.id === mode) : null;
			const promptExtra =
				instructionOverride !== undefined ? instructionOverride : customPrompt;

			// Guard: require either a preset mode or custom instruction
			if (!mode && !promptExtra.trim()) {
				toast.warning("请输入修改或创作要求");
				return;
			}

			// Base content to transform from currently selected left version
			const baseContent =
				activeLeftVersion?.content?.trim() || initialBaseMarkdown;
			if (!baseContent && !promptExtra.trim()) {
				toast.warning("当前没有可改写的正文内容，请输入要求");
				return;
			}

			// 中止可能存在的上一流（StrictMode 双调用 / 重复触发自愈），
			// 否则旧流会成为孤儿继续往编辑器写入，与新流互相覆盖
			handleStopGenerate();

			let actionTitle = "智能优化";
			if (preset) {
				actionTitle = preset.label;
			} else if (promptExtra.trim()) {
				const skillMatch = promptExtra.match(/\[Skill:\s*([^\]]+)\]/i);
				if (skillMatch) {
					actionTitle = skillMatch[1].trim();
				} else {
					const clean = promptExtra
						.replace(/^[[【][^\]】]+[\]】]\s*/, "")
						.trim();
					actionTitle = clean ? clean.slice(0, 12) : "演练创作";
				}
			}
			draftOriginRef.current = "ai";
			draftActionRef.current = actionTitle;

			setRightVersionId(DRAFT_VERSION_ID);
			setIsStreaming(true);

			const right = rightScrollRef.current;
			if (right) {
				isRightAtBottomRef.current =
					right.scrollHeight - right.scrollTop - right.clientHeight <= 80;
			}

			const controller = new AbortController();
			abortControllerRef.current = controller;

			const effectivePrompt = baseContent || promptExtra.trim();

			let fullHint = "";
			if (!baseContent) {
				fullHint = `你是一名专业中文内容创作与编辑大师。请根据以下用户提出的明确要求，直接构思并撰写高质量的完整正文：\n\n【用户明确要求】：\n${promptExtra.trim()}\n\n【输出形态契约（最高优先级）】：纯 Markdown 正文，直接输出排版工整、逻辑紧密的正文，严禁输出任何问候、开场白或解释说明。`;
			} else if (preset) {
				fullHint = promptExtra.trim()
					? `${preset.defaultHint}\n\n【用户补充的特别要求】：\n${promptExtra.trim()}`
					: preset.defaultHint;
			} else if (promptExtra.trim()) {
				fullHint = `你是一名专业中文内容创作与编辑助手。请根据以下用户提出的明确要求，对正文进行深度针对性改写与优化：\n\n【用户明确要求】：\n${promptExtra.trim()}\n\n【输出形态契约（最高优先级）】：你的输出将直接渲染进富文本编辑器，只能二选一并全篇统一：A. 纯 Markdown 正文（默认，正文严禁出现任何 HTML 标签）；B. 仅当用户明确要求"网页排版/美化样式/HTML 排版"时，输出纯裸 HTML 排版文档（以 <section>/<div> 开头，通篇无 Markdown 语法、无代码围栏）。严禁 Markdown 散文与 HTML 片段混排，严禁用 \`\`\` 围栏包裹任何排版内容。\n\n【配图保留铁律】：原文中若包含任何 Markdown 图片（形如 \`![说明](URL)\`）或多媒体，必须完整保留其链接并合理安排在改写后对应段落之间，严禁删除任何图片！直接输出改写优化后的全篇正文，不要包含任何前缀、问候或说明。`;
			} else {
				fullHint = `你是一名资深文字编辑与内容优化大师。请对以下正文进行全面精细化润色与提升：纠正错别字、病句，优化行文结构与表达质感，提升逻辑流畅性。【配图保留铁律】：原文中若包含任何 Markdown 图片（形如 \`![说明](URL)\`）或多媒体，必须完整保留其链接并合理安排在对应段落中，严禁删除任何图片！直接输出优化后的全篇正文，不要包含任何前缀、问候或说明。`;
			}

			try {
				await streamRewriteText(
					{
						prompt: effectivePrompt,
						systemHint: fullHint,
						stylePreset,
						articleTitle: docTitle,
					},
					{
						onChunk: (_delta, fullText) => {
							try {
								const normalizedText = normalizeAiGeneratedDocument(
									fullText,
									effectivePrompt,
								);
								const { nodes } = markdownToTiptapDoc(normalizedText);
								const docJson: JSONContent = {
									type: "doc",
									content: nodes.length > 0 ? nodes : [{ type: "paragraph" }],
								};
								rightEditor.commands.setContent(docJson, {
									emitUpdate: false,
								});
								setRightWordCount(normalizedText.length);
								setDraftContent(normalizedText);
								setDraftContentJson(docJson);

								const scrollEl = rightScrollRef.current;
								if (scrollEl && isRightAtBottomRef.current) {
									scrollEl.scrollTop = scrollEl.scrollHeight;
								}
							} catch (e) {
								console.warn("[SplitCompareView] setContent chunk error:", e);
							}
						},
						onDone: async (fullText) => {
							try {
								const normalizedText = normalizeAiGeneratedDocument(
									fullText,
									baseContent,
								);
								const { nodes } = markdownToTiptapDoc(normalizedText);

								// Scan and retain original images
								const originalImages: Array<{ src: string; alt?: string }> = [];
								const scanOriginalImages = (n: JSONContent) => {
									if (n.type === "image" && n.attrs?.src) {
										originalImages.push({
											src: String(n.attrs.src),
											alt: n.attrs.alt ? String(n.attrs.alt) : undefined,
										});
									}
									if (n.content && Array.isArray(n.content)) {
										for (const child of n.content) scanOriginalImages(child);
									}
								};
								scanOriginalImages(leftEditor.getJSON());

								const generatedSrcSet = new Set<string>();
								const scanGeneratedImages = (n: JSONContent) => {
									if (n.type === "image" && n.attrs?.src) {
										generatedSrcSet.add(String(n.attrs.src));
									}
									if (n.content && Array.isArray(n.content)) {
										for (const child of n.content) scanGeneratedImages(child);
									}
								};
								for (const node of nodes) scanGeneratedImages(node);

								const missingImages = originalImages.filter(
									(img) => !generatedSrcSet.has(img.src),
								);
								const finalNodes = [...nodes];
								if (missingImages.length > 0) {
									for (const img of missingImages) {
										finalNodes.push({
											type: "image",
											attrs: { src: img.src, alt: img.alt || "" },
										});
									}
								}

								const finalDocJson: JSONContent = {
									type: "doc",
									content:
										finalNodes.length > 0
											? finalNodes
											: [{ type: "paragraph" }],
								};
								rightEditor.commands.setContent(finalDocJson, {
									emitUpdate: true,
								});
								setRightWordCount(
									rightEditor.getText().length || normalizedText.length,
								);
								setDraftContent(normalizedText);
								setDraftContentJson(finalDocJson);

								// Record split AI interaction to persistent chat history
								void recordSplitPracticeSession({
									docId,
									docTitle,
									prompt: promptExtra,
									modeLabel: actionTitle,
									generatedContent: normalizedText,
								});
							} catch (e) {
								console.warn("[SplitCompareView] setContent done error:", e);
							}
							setIsStreaming(false);
						},
						onError: (err) => {
							console.warn("[SplitCompareView] Stream error:", err);
							toast.danger(`生成出错: ${err}`);
							setIsStreaming(false);
						},
					},
					controller.signal,
				);
			} catch (err) {
				if (!controller.signal.aborted) {
					console.error("[SplitCompareView] Generation error:", err);
					toast.danger(
						`生成失败: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
				setIsStreaming(false);
			}
		},
		[
			docId,
			rightEditor,
			handleStopGenerate,
			selectedMode,
			customPrompt,
			activeLeftVersion,
			initialBaseMarkdown,
			stylePreset,
			docTitle,
			leftEditor,
			rightScrollRef,
			isRightAtBottomRef,
			setRightVersionId,
			setRightWordCount,
			setDraftContent,
			setDraftContentJson,
			draftOriginRef,
			draftActionRef,
		],
	);

	// Auto-trigger if opened with instruction
	// StrictMode 安全（TanStack Start 默认入口整树包裹 StrictMode）：不用
	// triggerKey 守卫拦截重跑——StrictMode 会先跑一遍 effect、执行卸载清理
	// （中止首次 fetch）、再重跑 effect；重跑时 handleStartGenerate 内部先
	// handleStopGenerate 再发起新流，等于自愈。若用守卫拦截，首流被中止后
	// 永远无法重启，右栏会永久停在「生成中」。
	// biome-ignore lint/correctness/useExhaustiveDependencies: 仅在打开意图（instruction/modeLabel/editor 就绪）变化时触发
	useEffect(() => {
		if (!instruction && !modeLabel) return;
		if (!rightEditor) return;
		const targetMode = modeLabel
			? PRESET_MODES.find((m) => m.label === modeLabel)?.id || null
			: null;
		setSelectedMode(targetMode);
		setCustomPrompt("");
		void handleStartGenerate(targetMode, instruction);
	}, [instruction, modeLabel, rightEditor]);

	// Clean up streaming on unmount
	useEffect(() => {
		return () => {
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
			}
		};
	}, []);

	return {
		selectedMode,
		setSelectedMode,
		customPrompt,
		setCustomPrompt,
		isStreaming,
		handleStartGenerate,
		handleStopGenerate,
	};
}
