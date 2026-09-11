import { toast } from "@heroui/react";
import type { Editor } from "@tiptap/react";
import { ArrowDownToLine, GitCompare, RefreshCw } from "lucide-react";
import type React from "react";
import { useEffect } from "react";
import { useAiPanel } from "../../shell/AppShell";
import { markdownToHtml } from "../importers";
import type { EditorDocument } from "../types";
import { SuggestionController } from "../utils/suggestionController";

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
					id: "suggest_selection",
					label: "建议对比",
					icon: GitCompare,
					variant: "accent",
					tooltip: "在正文中以删除线与绿色高亮进行精细对比审阅（可接受或拒绝）",
					onAction: async (aiContent: string) => {
						const editor = editorRef.current;
						if (!editor) {
							toast.warning("编辑器未准备好");
							return;
						}
						let { from, to } = editor.state.selection;
						let targetText = "";
						let isFullDoc = false;

						if (from === to || to - from < 2) {
							// No selection: automatically target entire document
							from = 0;
							to = editor.state.doc.content.size;
							targetText = editor.state.doc.textBetween(0, to, "\n\n");
							isFullDoc = true;
						} else {
							targetText = editor.state.doc.textBetween(from, to, " ");
						}

						await onBeforeAiApply();
						const cleanText = aiContent.replace(/\r\n/g, "\n");
						SuggestionController.applyFineDiff(
							editor,
							{ from, to },
							targetText,
							cleanText,
						);
						toast.success(
							isFullDoc
								? "已对整篇文档应用精细对比建议，可在正文中审阅 Accept 或 Reject"
								: "已在编辑器正文中生成精细对比建议，可查看 Accept 或 Reject",
						);
					},
				},
				{
					id: "suggest_full_doc",
					label: "全文对比建议",
					icon: GitCompare,
					variant: "accent",
					tooltip: "将 AI 优化结果与当前整篇文档进行多段落精细对比（保留未改动段落）",
					onAction: async (aiContent: string) => {
						const editor = editorRef.current;
						if (!editor) {
							toast.warning("编辑器未准备好");
							return;
						}
						await onBeforeAiApply();
						const from = 0;
						const to = editor.state.doc.content.size;
						const fullDocText = editor.state.doc.textBetween(0, to, "\n\n");
						const cleanText = aiContent.replace(/\r\n/g, "\n");
						SuggestionController.applyFineDiff(
							editor,
							{ from, to },
							fullDocText,
							cleanText,
						);
						toast.success("已将 AI 回答与全文进行段落精细对比，可在正文审阅 Accept 或 Reject");
					},
				},
				{
					id: "replace_selection",
					label: "直接替换",
					icon: RefreshCw,
					tooltip: "用回答内容直接替换当前选中的文本（自动备份快照）",
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
