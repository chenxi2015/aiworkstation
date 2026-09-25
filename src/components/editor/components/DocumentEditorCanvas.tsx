import type { Editor, JSONContent } from "@tiptap/react";
import type React from "react";
import type { SaveState } from "../hooks/useDocumentManager";
import { RichTextEditor } from "../RichTextEditor";
import type { EditorDocument } from "../types";
import { DocumentHeader } from "./DocumentHeader";
import { EditorActionBar } from "./EditorActionBar";
import { SplitCompareView } from "./SplitCompareView";

export interface DocumentEditorCanvasProps {
	activeDoc: EditorDocument;
	splitSession: {
		isOpen: boolean;
		instruction?: string;
		modeLabel?: string;
	} | null;
	editorRef: React.MutableRefObject<Editor | null>;
	wordCount: number;
	saveState: SaveState;
	savedAt: string | null;
	contentText: string;
	onTitleChange: (title: string) => void;
	onToggleSplitLayout: () => void;
	onAcceptSplitCompare: (
		cleanDocJson: Parameters<Editor["commands"]["setContent"]>[0],
	) => Promise<void>;
	onCancelSplitCompare: () => void;
	onSaveAsNewDocument: (
		title: string,
		markdown: string,
		docJson?: JSONContent,
	) => Promise<void>;
	onEditorChange: (contentJson: string, text: string) => void;
	onAiGenerate?: (prompt: string) => Promise<string>;
	onBeforeAiApply?: () => Promise<void>;
	onEditorReady: (editor: Editor | null) => void;
	onOpenImport: () => void;
	onRegisterPipeline: (
		trigger: (instruction?: string) => Promise<void>,
	) => void;
	onSnapshot: () => void;
	onStatusChange: (status: EditorDocument["status"]) => void;
	onCopyText: (text: string, label?: string) => void | Promise<void>;
	onCopyMarkdown: () => void;
	onCopyHtml: () => void;
	onExportWord: () => void;
	onExportMarkdown: () => void;
	onExportHtml: () => void;
	onExportPdf: () => void;
	onOpenDistribution: () => void;
	/** 媒体资产文档被切到富文本模式时，提供切回音视频工作室的入口 */
	mediaMode?: { kind: "audio" | "video"; onSwitch: () => void };
}

/**
 * Dedicated Rich-Text Document Canvas component.
 * Isolates TipTap editor, split compare view, document header, and action bar
 * from dedicated media studio canvases (audio/video).
 */
export function DocumentEditorCanvas({
	activeDoc,
	splitSession,
	editorRef,
	wordCount,
	saveState,
	savedAt,
	contentText,
	onTitleChange,
	onToggleSplitLayout,
	onAcceptSplitCompare,
	onCancelSplitCompare,
	onSaveAsNewDocument,
	onEditorChange,
	onAiGenerate,
	onBeforeAiApply,
	onEditorReady,
	onOpenImport,
	onRegisterPipeline,
	onSnapshot,
	onStatusChange,
	onCopyText,
	onCopyMarkdown,
	onCopyHtml,
	onExportWord,
	onExportMarkdown,
	onExportHtml,
	onExportPdf,
	onOpenDistribution,
	mediaMode,
}: DocumentEditorCanvasProps) {
	return (
		<>
			{splitSession?.isOpen && editorRef.current ? (
				<SplitCompareView
					key={`split_${activeDoc.id}`}
					leftEditor={editorRef.current}
					docTitle={activeDoc.title}
					docId={activeDoc.id}
					stylePreset={activeDoc.stylePreset}
					instruction={splitSession.instruction}
					modeLabel={splitSession.modeLabel}
					onAccept={onAcceptSplitCompare}
					onCancel={onCancelSplitCompare}
					onSaveAsNewDocument={onSaveAsNewDocument}
				/>
			) : null}
			<div
				className={
					splitSession?.isOpen ? "hidden" : "flex-1 flex flex-col min-h-0"
				}
			>
				<DocumentHeader
					activeDoc={activeDoc}
					onTitleChange={onTitleChange}
					isSplitLayout={splitSession?.isOpen}
					onToggleSplitLayout={onToggleSplitLayout}
					mediaMode={mediaMode}
				/>
				<RichTextEditor
					docId={activeDoc.id}
					docTitle={activeDoc.title}
					stylePreset={activeDoc.stylePreset}
					initialContent={activeDoc.content}
					onChange={onEditorChange}
					onAiGenerate={onAiGenerate}
					onBeforeAiApply={onBeforeAiApply}
					onEditorReady={onEditorReady}
					onOpenImport={onOpenImport}
					onRegisterPipeline={onRegisterPipeline}
				/>
				<EditorActionBar
					activeDoc={activeDoc}
					wordCount={wordCount}
					saveState={saveState}
					savedAt={savedAt}
					contentText={contentText}
					onSnapshot={onSnapshot}
					onToggleFinalized={() =>
						onStatusChange(
							activeDoc.status === "finalized" ? "editing" : "finalized",
						)
					}
					onCopyText={(text, label) => void onCopyText(text, label)}
					onCopyMarkdown={onCopyMarkdown}
					onCopyHtml={onCopyHtml}
					onExportWord={onExportWord}
					onExportMarkdown={onExportMarkdown}
					onExportHtml={onExportHtml}
					onExportPdf={onExportPdf}
					onOpenDistribution={onOpenDistribution}
				/>
			</div>
		</>
	);
}
