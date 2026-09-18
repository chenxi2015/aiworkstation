import { toast } from "@heroui/react";
import type { Editor } from "@tiptap/core";
import { type JSONContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { snapshotVersionRpc } from "../../../../services/api/editorClient";
import { getEditorBaseExtensions } from "../../extensions/baseExtensions";
import { SlashCommands } from "../../extensions/slashCommand";
import type { SlashMenuState } from "../../hooks/useRichTextEditor";
import { tiptapJsonToMarkdown } from "../../markdown";
import { markdownToPlainText } from "../../utils/diffHelper";
import type { SlashCommandMenuRef } from "../SlashCommandMenu";
import { useSplitAiStream } from "./hooks/useSplitAiStream";
import { useSplitDiff } from "./hooks/useSplitDiff";
import { useSplitScroll } from "./hooks/useSplitScroll";
import { DRAFT_VERSION_ID, useSplitVersions } from "./hooks/useSplitVersions";

export interface UseSplitCanvasOptions {
	leftEditor: Editor;
	docTitle?: string;
	docId: number;
	stylePreset?: string;
	instruction?: string;
	modeLabel?: string;
	onAccept: (
		cleanDocJson: Parameters<Editor["commands"]["setContent"]>[0],
	) => void;
	onSaveAsNewDocument?: (
		title: string,
		markdown: string,
		docJson?: JSONContent,
	) => Promise<void>;
}

/**
 * Facade hook to manage dual-canvas state:
 * Coordinates versions, diff comparison, AI streaming, and synchronized scrolling.
 */
export function useSplitCanvas({
	leftEditor,
	docTitle,
	docId,
	stylePreset,
	instruction,
	modeLabel,
	onAccept,
	onSaveAsNewDocument,
}: UseSplitCanvasOptions) {
	// 1. Initial base markdown and JSON extracted from left TipTap editor
	const initialBaseMarkdown = useMemo(() => {
		try {
			const md = tiptapJsonToMarkdown(leftEditor.getJSON());
			return md.trim() || leftEditor.getText().trim();
		} catch {
			return leftEditor.getText().trim();
		}
	}, [leftEditor]);

	const initialBaseJson = useMemo<JSONContent>(() => {
		return leftEditor.getJSON();
	}, [leftEditor]);

	// 2. Slash Menu state for Right TipTap Editor
	const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
	const slashMenuRef = useRef<SlashCommandMenuRef>(null);

	// 3. TipTap editors
	const leftPreviewEditor = useEditor({
		extensions: getEditorBaseExtensions(),
		content: initialBaseJson,
		editable: false,
		immediatelyRender: false,
	});

	const rightEditor = useEditor({
		extensions: [
			...getEditorBaseExtensions({
				placeholder: "等待 AI 生成或直接在此输入草稿，键入 '/' 呼出格式菜单...",
			}),
			SlashCommands.configure({
				suggestion: {
					render: () => ({
						onStart: (props) => {
							setSlashMenu({
								query: props.query,
								range: props.range,
								clientRect: props.clientRect ?? null,
								command: props.command,
							});
						},
						onUpdate: (props) => {
							setSlashMenu((prev) =>
								prev
									? {
											...prev,
											query: props.query,
											range: props.range,
											clientRect: props.clientRect ?? null,
										}
									: null,
							);
						},
						onKeyDown: (props) => {
							if (slashMenuRef.current) {
								return slashMenuRef.current.onKeyDown(props.event);
							}
							return false;
						},
						onExit: () => {
							setSlashMenu(null);
						},
					}),
				},
			}),
		],
		content: "",
		editable: true,
		immediatelyRender: false,
	});

	// Word counts
	const [rightWordCount, setRightWordCount] = useState<number>(0);

	// 4. Sub-hook: Versions & Snapshot management
	const {
		versions,
		leftVersionId,
		setLeftVersionId,
		rightVersionId,
		setRightVersionId,
		setDraftContent,
		setDraftContentJson,
		draftOriginRef,
		draftActionRef,
		isSavingVersion,
		activeLeftVersion,
		activeRightVersion,
		handleSelectRightVersion,
		acceptDraftAsNewVersion,
		handleSaveCurrentVersionToDb,
	} = useSplitVersions({
		docId,
		initialBaseMarkdown,
		initialBaseJson,
		rightEditor,
		setRightWordCount,
	});

	const leftWordCount = useMemo(() => {
		return markdownToPlainText(activeLeftVersion?.content || "").length;
	}, [activeLeftVersion?.content]);

	// Keep right word count in sync when active right version switches
	useEffect(() => {
		if (activeRightVersion?.content) {
			setRightWordCount(markdownToPlainText(activeRightVersion.content).length);
		}
	}, [activeRightVersion?.content]);

	// 5. Sub-hook: Scroll Synchronization & Edge navigation
	const {
		leftScrollRef,
		rightScrollRef,
		isRightAtBottomRef,
		isRightAtTop,
		isRightAtBottom,
		handleLeftScroll,
		handleRightScroll,
		scrollRightToTop,
		scrollRightToBottom,
		trackRightScrollPosition,
	} = useSplitScroll();

	// 6. Sub-hook: AI Streaming Rewriter
	const {
		selectedMode,
		setSelectedMode,
		customPrompt,
		setCustomPrompt,
		isStreaming,
		handleStartGenerate,
		handleStopGenerate,
	} = useSplitAiStream({
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
	});

	// 7. Sub-hook: Diff Comparison & View synchronization
	const {
		diffViewMode,
		setDiffViewMode,
		diffStrings,
		canAccept,
		canSaveAsNew,
	} = useSplitDiff({
		activeLeftVersion,
		activeRightVersion,
		leftVersionId,
		rightVersionId,
		initialBaseMarkdown,
		leftPreviewEditor,
		rightEditor,
		isStreaming,
		rightWordCount,
	});

	// Re-sync arrow disabled states when editor/version/stream changes
	useEffect(() => {
		trackRightScrollPosition();
	}, [trackRightScrollPosition, rightEditor, rightVersionId, isStreaming]);

	// Listen to right editor typing updates
	useEffect(() => {
		if (!rightEditor) return;
		const updateCount = () => {
			if (diffViewMode === "diff") return;
			const text = rightEditor.getText();
			const md = tiptapJsonToMarkdown(rightEditor.getJSON()) || text;
			setRightWordCount(markdownToPlainText(md).length);
			setDraftContentJson(rightEditor.getJSON());
			if (rightVersionId !== DRAFT_VERSION_ID) {
				draftOriginRef.current = "human";
				draftActionRef.current = "手动精修";
				setRightVersionId(DRAFT_VERSION_ID);
			}
			setDraftContent(md);
		};
		rightEditor.on("update", updateCount);
		return () => {
			rightEditor.off("update", updateCount);
		};
	}, [
		rightEditor,
		rightVersionId,
		diffViewMode,
		draftOriginRef,
		draftActionRef,
		setDraftContent,
		setDraftContentJson,
		setRightVersionId,
	]);

	// Actions: Accept / Discard / Save As New
	const handleAccept = useCallback(async () => {
		if (!rightEditor) return;
		const text = rightEditor.getText().trim();
		if (!text) {
			toast.warning("右侧草稿内容为空，无法采纳覆盖正文");
			return;
		}
		const acceptedJson = rightEditor.getJSON();
		if (docId) {
			try {
				await snapshotVersionRpc({
					documentId: docId,
					content: JSON.stringify(acceptedJson),
					origin: "human",
					note: `采纳应用前快照: ${activeRightVersion.label}`,
				});
			} catch {
				// non-blocking
			}
		}
		onAccept(acceptedJson);
		// 双栏保持打开：右侧草稿固化为新版本 vN 并切到左栏，右侧清空等待下一轮叠加优化
		acceptDraftAsNewVersion(acceptedJson);
		setDraftContent("");
		setDraftContentJson(null);
		setRightVersionId(DRAFT_VERSION_ID);
		setRightWordCount(0);
		rightEditor.commands.clearContent(false);
	}, [
		rightEditor,
		onAccept,
		docId,
		activeRightVersion.label,
		acceptDraftAsNewVersion,
		setDraftContent,
		setDraftContentJson,
		setRightVersionId,
	]);

	// Retain right draft without overwriting main document or resetting right content
	const handleReject = useCallback(() => {
		toast.info("已保留右侧演练草稿，暂未采纳至正文");
	}, []);

	const handleSaveAsNew = useCallback(async () => {
		if (!rightEditor || !onSaveAsNewDocument) return;
		const text = rightEditor.getText().trim();
		if (!text) {
			toast.warning("右侧草稿内容为空，无法另存为新文档");
			return;
		}
		const docJson = rightEditor.getJSON();
		const md = tiptapJsonToMarkdown(docJson) || text;
		const newTitle = `${docTitle || "未命名文档"} · 改写篇`;
		await onSaveAsNewDocument(newTitle, md, docJson);
	}, [rightEditor, docTitle, onSaveAsNewDocument]);

	return {
		// Version pool
		versions,
		leftVersionId,
		setLeftVersionId,
		rightVersionId,
		handleSelectRightVersion,
		activeLeftVersion,
		activeRightVersion,

		// TipTap editors
		leftPreviewEditor,
		rightEditor,

		// Slash Menu
		slashMenu,
		setSlashMenu,
		slashMenuRef,

		// Diff & word count
		diffViewMode,
		setDiffViewMode,
		diffStrings,
		leftWordCount,
		rightWordCount,

		// Action handlers & flags
		isStreaming,
		isSavingVersion,
		canAccept,
		canSaveAsNew,
		handleAccept,
		handleReject,
		handleDiscard: handleReject,
		handleSaveAsNew,
		handleSaveCurrentVersionToDb,

		// AI floating dock state
		selectedMode,
		setSelectedMode,
		customPrompt,
		setCustomPrompt,
		handleStartGenerate,
		handleStopGenerate,

		// Synchronized scroll refs & handlers
		leftScrollRef,
		rightScrollRef,
		handleLeftScroll,
		handleRightScroll,

		// Right column scroll-follow UI
		isRightAtTop,
		isRightAtBottom,
		scrollRightToTop,
		scrollRightToBottom,
	};
}
