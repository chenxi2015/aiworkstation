import { toast } from "@heroui/react";
import { useCallback } from "react";
import type { ChatContextItem } from "../../../../../types/chatContext";
import type { EditorDocument } from "../../../../editor/types";
import { useAiPanel } from "../../../../shell/AppShell";

/**
 * Creates a normalized ChatContextItem for an Editor document.
 */
export function createDocumentContextItem(
	doc: EditorDocument,
	folderName?: string | null,
): ChatContextItem {
	const charCount = (doc.contentText || "").length;
	const countText = charCount > 0 ? `${charCount} 字` : "空文档";
	const folderText = folderName || (doc.status === "archived" ? "已归档" : "创作台");

	return {
		id: `document_${doc.id}`,
		type: "document",
		title: doc.title || "未命名文档",
		subtitle: `${folderText} · ${countText}`,
		documentId: doc.id,
		data: {
			contentPreview: doc.contentText?.slice(0, 3000) ?? "",
		},
	};
}

/**
 * Creates a normalized ChatContextItem for an Obsidian note entry.
 */
export function createNoteContextItem(
	relPath: string,
	name?: string,
): ChatContextItem {
	const rawName = name || relPath.split("/").pop() || "";
	const bare = rawName.replace(/\.(canvas|excalidraw(\.md)?|md)$/i, "") || "未命名笔记";
	const dir = relPath.includes("/")
		? relPath.split("/").slice(0, -1).join("/")
		: "根目录";

	return {
		id: `note_${relPath}`,
		type: "note",
		title: bare,
		subtitle: dir,
		notePath: relPath,
	};
}

/**
 * Hook providing streamlined actions to inject documents, notes,
 * and text selections into the AI chat input context.
 */
export function useAddToAiChat() {
	const { addContextItem, setCollapsed, isCollapsed, focusInput, setInputText } =
		useAiPanel();

	/**
	 * Adds an Editor document as context chip into the AI chat input.
	 */
	const addDocumentToAi = useCallback(
		(doc: EditorDocument, folderName?: string | null) => {
			const item = createDocumentContextItem(doc, folderName);
			addContextItem(item);
			if (isCollapsed) {
				setCollapsed(false);
			}
			focusInput();
			toast.success(`已添加「${item.title}」到 AI 对话`);
		},
		[addContextItem, isCollapsed, setCollapsed, focusInput],
	);

	/**
	 * Adds an Obsidian note as context chip into the AI chat input.
	 */
	const addNoteToAi = useCallback(
		(relPath: string, name?: string) => {
			const item = createNoteContextItem(relPath, name);
			addContextItem(item);
			if (isCollapsed) {
				setCollapsed(false);
			}
			focusInput();
			toast.success(`已添加「${item.title}」到 AI 对话`);
		},
		[addContextItem, isCollapsed, setCollapsed, focusInput],
	);

	/**
	 * Adds selected text along with optional parent document/note context.
	 */
	const addSelectionToAi = useCallback(
		(
			selectedText: string,
			parentContext?:
				| { kind: "document"; doc: EditorDocument; folderName?: string | null }
				| { kind: "note"; relPath: string; name?: string },
		) => {
			if (parentContext) {
				if (parentContext.kind === "document") {
					addContextItem(
						createDocumentContextItem(
							parentContext.doc,
							parentContext.folderName,
						),
					);
				} else if (parentContext.kind === "note") {
					addContextItem(
						createNoteContextItem(
							parentContext.relPath,
							parentContext.name,
						),
					);
				}
			}

			if (isCollapsed) {
				setCollapsed(false);
			}

			if (setInputText && selectedText.trim()) {
				setInputText(selectedText.trim());
			} else {
				focusInput();
			}

			toast.success("已将选中文本添加到 AI 对话");
		},
		[addContextItem, isCollapsed, setCollapsed, setInputText, focusInput],
	);

	return {
		addDocumentToAi,
		addNoteToAi,
		addSelectionToAi,
	};
}

