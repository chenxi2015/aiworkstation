import type { Editor } from "@tiptap/react";
import { Shuffle, Sparkles } from "lucide-react";
import type React from "react";
import { useEffect, useRef } from "react";
import { useAiPanel } from "../../shell/AppShell";
import type { EditorDocument } from "../types";

export interface UseEditorAiBridgeOptions {
	activeDoc: EditorDocument | null;
	editorRef: React.RefObject<Editor | null>;
	onBeforeAiApply: () => Promise<void>;
	reloadDocuments: () => Promise<EditorDocument[]>;
	onStartRewritePipeline?: (
		customInstruction?: string,
		modeLabel?: string,
	) => Promise<void>;
	onStartCreatePipeline?: (params: {
		title: string;
		prompt: string;
		stylePreset?: string;
	}) => Promise<void>;
	flushSave?: () => Promise<void>;
	onSwitchDocument?: (id: number) => Promise<void>;
}

/**
 * Bridges the Editor document with the global AI Assistant panel.
 * Syncs editor content when backend AI tools mutate documents,
 * and exposes document metadata and full-text rewrite capabilities to the AI panel.
 */
export function useEditorAiBridge({
	activeDoc,
	editorRef,
	onBeforeAiApply: _onBeforeAiApply,
	reloadDocuments,
	onStartRewritePipeline,
	onStartCreatePipeline,
	flushSave,
	onSwitchDocument,
}: UseEditorAiBridgeOptions) {
	const { registerPageBridge, registerDataChangedHandler } = useAiPanel();

	const onStartRewritePipelineRef = useRef(onStartRewritePipeline);
	onStartRewritePipelineRef.current = onStartRewritePipeline;

	const onStartCreatePipelineRef = useRef(onStartCreatePipeline);
	onStartCreatePipelineRef.current = onStartCreatePipeline;

	const onSwitchDocumentRef = useRef(onSwitchDocument);
	onSwitchDocumentRef.current = onSwitchDocument;

	const flushSaveRef = useRef(flushSave);
	flushSaveRef.current = flushSave;

	const activeDocId = activeDoc?.id;
	const activeDocTitle = activeDoc?.title;

	// 1. Register page capabilities to AI side panel
	useEffect(() => {
		registerPageBridge({
			module: "editor",
			activeDocumentId: activeDocId,
			activeDocumentTitle: activeDocTitle,
			flushSave: async () => {
				await flushSaveRef.current?.();
			},
			actions: [
				{
					id: "stream_create_document",
					label: "新建长文创作",
					icon: Sparkles,
					variant: "accent" as const,
					tooltip: "在单栏富文本中根据主题与大纲流式动态创作新长文",
					onAction: async (payload?: string) => {
						if (!payload) return;
						try {
							const parsed = JSON.parse(payload);
							await onStartCreatePipelineRef.current?.(parsed);
						} catch {
							await onStartCreatePipelineRef.current?.({
								title: "新建文档",
								prompt: payload,
							});
						}
					},
				},
				{
					id: "stream_spin_rewrite",
					label: "二创洗稿重构",
					icon: Shuffle,
					variant: "accent" as const,
					tooltip:
						"基于原文事实进行深度二创与去重洗稿，彻底打破原有句式和篇章结构（保留多媒体）",
					onAction: async (aiContent?: string) => {
						const trimmed = aiContent?.trim();
						const customRequirement = trimmed
							? `\n补充要求：${trimmed.slice(0, 300)}`
							: "";
						const prompt = `你是一名资深内容二创与去重改写专家。请基于当前正文事实进行深度二创（洗稿重构）：
1. 彻底打破原有句式结构、段落组织与表达习惯，重构叙事逻辑与切入视角；
2. 完整保留原文的核心观点、关键数据与客观事实，严禁凭空捏造；
3. 换用全新的表达风格和生动修辞，最大限度去重，使其成为一篇立意相同但表达截然不同的全新独立稿件；
4. 正文中若包含图片或多媒体标记请原样保留位置；直接输出重构后的正文，严禁任何说明前缀。${customRequirement}`;
						await onStartRewritePipelineRef.current?.(prompt, "二创洗稿");
					},
				},
				{
					id: "stream_full_rewrite",
					label: "逐段流式改写",
					icon: Sparkles,
					variant: "default" as const,
					tooltip:
						"在正文中逐段流式优化改写（绝不丢失任何图片视频，实时对照审阅）",
					onAction: async (aiContent: string) => {
						const trimmed = aiContent?.trim();
						const prompt = trimmed
							? trimmed.startsWith("参考以下要求")
								? trimmed
								: `参考以下要求对段落润色：${trimmed.slice(0, 400)}`
							: undefined;
						await onStartRewritePipelineRef.current?.(prompt, "全文润色");
					},
				},
			],
		});

		return () => {
			registerPageBridge(null);
		};
	}, [activeDocId, activeDocTitle, registerPageBridge]);

	// 2. Sync when AI tools execute backend mutations
	useEffect(() => {
		registerDataChangedHandler(async () => {
			const currentDocId = activeDoc?.id;
			const docs = await reloadDocuments();
			if (docs.length === 0) return;

			// If current doc was mutated externally, reload its editor content
			if (currentDocId) {
				const current = docs.find((d) => d.id === currentDocId);
				if (current && editorRef.current) {
					try {
						editorRef.current.commands.setContent(JSON.parse(current.content));
					} catch {
						editorRef.current.commands.setContent(current.contentText || "");
					}
				}
			}
		});

		return () => {
			registerDataChangedHandler(null);
		};
	}, [activeDoc?.id, editorRef, reloadDocuments, registerDataChangedHandler]);
}
