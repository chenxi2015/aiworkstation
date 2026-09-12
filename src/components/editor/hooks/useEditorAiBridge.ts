import type { Editor } from "@tiptap/react";
import { Sparkles } from "lucide-react";
import type React from "react";
import { useEffect, useRef } from "react";
import { useAiPanel } from "../../shell/AppShell";
import type { EditorDocument } from "../types";

export interface UseEditorAiBridgeOptions {
	activeDoc: EditorDocument | null;
	editorRef: React.RefObject<Editor | null>;
	onBeforeAiApply: () => Promise<void>;
	reloadDocuments: () => Promise<EditorDocument[]>;
	onStartRewritePipeline?: (customInstruction?: string) => Promise<void>;
	flushSave?: () => Promise<void>;
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
	flushSave,
}: UseEditorAiBridgeOptions) {
	const { registerPageBridge, registerDataChangedHandler } = useAiPanel();

	const onStartRewritePipelineRef = useRef(onStartRewritePipeline);
	onStartRewritePipelineRef.current = onStartRewritePipeline;

	const flushSaveRef = useRef(flushSave);
	flushSaveRef.current = flushSave;

	const activeDocId = activeDoc?.id;
	const activeDocTitle = activeDoc?.title;

	// 1. Register page capabilities to AI side panel
	useEffect(() => {
		if (!activeDocId) {
			registerPageBridge(null);
			return;
		}

		registerPageBridge({
			module: "editor",
			activeDocumentId: activeDocId,
			activeDocumentTitle: activeDocTitle,
			flushSave: async () => {
				await flushSaveRef.current?.();
			},
			actions: [
				{
					id: "stream_full_rewrite",
					label: "逐段流式改写",
					icon: Sparkles,
					variant: "accent" as const,
					tooltip:
						"在正文中逐段流式优化改写（绝不丢失任何图片视频，实时对照审阅）",
					onAction: async (aiContent: string) => {
						const trimmed = aiContent?.trim();
						const prompt = trimmed
							? trimmed.startsWith("参考以下要求")
								? trimmed
								: `参考以下要求对段落润色：${trimmed.slice(0, 400)}`
							: undefined;
						await onStartRewritePipelineRef.current?.(prompt);
					},
				},
			],
		});

		return () => {
			registerPageBridge(null);
		};
	}, [activeDocId, activeDocTitle, registerPageBridge]);

	// 2. Sync when AI tools execute backend mutations (e.g. rewrite_document)
	useEffect(() => {
		registerDataChangedHandler(async () => {
			if (!activeDoc) return;
			const docs = await reloadDocuments();
			const current = docs.find((d) => d.id === activeDoc.id);
			if (current && editorRef.current) {
				try {
					editorRef.current.commands.setContent(JSON.parse(current.content));
				} catch {
					editorRef.current.commands.setContent(current.contentText || "");
				}
			}
		});

		return () => {
			registerDataChangedHandler(null);
		};
	}, [activeDoc, editorRef, reloadDocuments, registerDataChangedHandler]);
}
