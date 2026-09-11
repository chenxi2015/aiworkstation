import { toast } from "@heroui/react";
import type { Editor } from "@tiptap/react";
import { ArrowDownToLine, RefreshCw } from "lucide-react";
import type React from "react";
import { useEffect } from "react";
import { useAiPanel } from "../../shell/AppShell";
import { markdownToHtml } from "../importers";
import type { EditorDocument } from "../types";

export interface UseEditorAiBridgeOptions {
	activeDoc: EditorDocument | null;
	editorRef: React.RefObject<Editor | null>;
	onBeforeAiApply: () => Promise<void>;
	reloadDocuments: () => Promise<EditorDocument[]>;
}

/**
 * Bridges the Editor document with the global AI Assistant panel.
 * Enables AI to insert content at the cursor or replace current selection,
 * and syncs editor content when backend AI tools mutate documents.
 */
export function useEditorAiBridge({
	activeDoc,
	editorRef,
	onBeforeAiApply,
	reloadDocuments,
}: UseEditorAiBridgeOptions) {
	const { registerPageBridge, registerDataChangedHandler } = useAiPanel();

	// 1. Register page capabilities to AI side panel
	useEffect(() => {
		if (!activeDoc) {
			registerPageBridge(null);
			return;
		}

		registerPageBridge({
			module: "editor",
			activeDocumentId: activeDoc.id,
			activeDocumentTitle: activeDoc.title,
			actions: [
				{
					id: "insert_cursor",
					label: "插入光标处",
					icon: ArrowDownToLine,
					variant: "accent",
					tooltip: "将回答内容插入到当前文档光标位置（自动备份快照）",
					onAction: async (aiContent: string) => {
						const editor = editorRef.current;
						if (!editor) {
							toast.warning("编辑器未准备好");
							return;
						}
						await onBeforeAiApply();
						const html = markdownToHtml(aiContent);
						editor.commands.insertContent(html);
						toast.success("已插入到文档，并自动保存版本快照");
					},
				},
				{
					id: "replace_selection",
					label: "替换选区",
					icon: RefreshCw,
					tooltip: "用回答内容替换当前文档选中的文本（自动备份快照）",
					onAction: async (aiContent: string) => {
						const editor = editorRef.current;
						if (!editor) {
							toast.warning("编辑器未准备好");
							return;
						}
						await onBeforeAiApply();
						const html = markdownToHtml(aiContent);
						editor.commands.insertContent(html);
						toast.success("已替换选区，并自动保存版本快照");
					},
				},
			],
		});

		return () => {
			registerPageBridge(null);
		};
	}, [activeDoc, editorRef, onBeforeAiApply, registerPageBridge]);

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
