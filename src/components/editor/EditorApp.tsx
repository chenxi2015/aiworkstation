import type { Editor } from "@tiptap/react";
import { FileText } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { NavLayoutEntry } from "../../modules/registry";
import { useWorkbenchQuickActions } from "../workbench/layout/useWorkbenchQuickActions";
import { WorkbenchHeader } from "../workbench/layout/WorkbenchHeader";
import type { Folder } from "../workbench/types";
import { DocumentHeader } from "./components/DocumentHeader";
import { DocumentSidebar } from "./components/DocumentSidebar";
import { EditorActionBar } from "./components/EditorActionBar";
import { DistributionModal } from "./DistributionModal";
import { useDocumentExport } from "./hooks/useDocumentExport";
import { useDocumentManager } from "./hooks/useDocumentManager";
import { useEditorAiBridge } from "./hooks/useEditorAiBridge";
import { ImportModal } from "./ImportModal";
import { RichTextEditor } from "./RichTextEditor";
import { StylePresetModal } from "./StylePresetModal";

export interface EditorAppProps {
	unclassifiedCount: number;
	navLayout?: NavLayoutEntry[];
	folders: Folder[];
}

/**
 * Creation workbench module entry (docs/editor-plan.md Editor-α).
 * Left: Documents sidebar (drafts);
 * Center: Title + TipTap canvas;
 * Bottom: Word count / Save state / Export actions.
 */
export function EditorApp({
	unclassifiedCount,
	navLayout,
	folders,
}: EditorAppProps) {
	const { actionProps, modals } = useWorkbenchQuickActions({ folders });
	const docManager = useDocumentManager();
	const {
		documents,
		loading,
		activeId,
		activeDoc,
		saveState,
		savedAt,
		contentText,
		stylePresets,
		setStylePresets,
		switchDocument,
		handleCreate,
		handleDelete,
		handleEditorChange,
		handleTitleChange,
		handleStylePresetChange,
		handleStatusChange,
		handleSnapshot,
		handleBeforeAiApply,
		handleAiGenerate,
		handleInsertNewDocument,
		reloadDocuments,
	} = docManager;

	const {
		currentMarkdown,
		currentHtml,
		copyText,
		handleExportWord,
		handleExportMarkdown,
		handleExportHtml,
		handleExportPdf,
	} = useDocumentExport({ activeDoc, contentText });

	const [isImportModalOpen, setIsImportModalOpen] = useState(false);
	const [isStylePresetModalOpen, setIsStylePresetModalOpen] = useState(false);
	const [isDistributionModalOpen, setIsDistributionModalOpen] = useState(false);

	const editorInstanceRef = useRef<Editor | null>(null);
	const pendingImportHtmlRef = useRef<{ docId: number; html: string } | null>(
		null,
	);

	// Bridge editor with the global AI side panel
	useEditorAiBridge({
		activeDoc,
		editorRef: editorInstanceRef,
		onBeforeAiApply: handleBeforeAiApply,
		reloadDocuments,
	});

	const handleEditorReady = useCallback(
		(editor: Editor | null) => {
			editorInstanceRef.current = editor;
			if (
				editor &&
				pendingImportHtmlRef.current &&
				pendingImportHtmlRef.current.docId === activeId
			) {
				const { html } = pendingImportHtmlRef.current;
				pendingImportHtmlRef.current = null;
				editor.commands.setContent(html);
			}
		},
		[activeId],
	);

	const handleImport = useCallback(
		async ({
			title,
			html,
			target,
		}: {
			title: string;
			html: string;
			target: "new" | "insert";
		}) => {
			if (target === "insert" && editorInstanceRef.current) {
				editorInstanceRef.current.commands.insertContent(html);
				return;
			}
			const doc = await handleInsertNewDocument(title);
			pendingImportHtmlRef.current = { docId: doc.id, html };
		},
		[handleInsertNewDocument],
	);

	const wordCount = contentText.length || (activeDoc?.contentText.length ?? 0);

	return (
		<div className="h-screen bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden">
			<WorkbenchHeader
				unclassifiedCount={unclassifiedCount}
				navLayout={navLayout}
				{...actionProps}
			/>
			<main className="flex-1 overflow-hidden flex min-h-0">
				{/* Left: Documents draft list */}
				<DocumentSidebar
					documents={documents}
					loading={loading}
					activeId={activeId}
					onSelect={(id) => void switchDocument(id)}
					onCreate={() => void handleCreate()}
					onDelete={handleDelete}
					onOpenImport={() => setIsImportModalOpen(true)}
				/>

				{/* Center: Title + Editor + Bottom actions */}
				<section className="flex-1 flex flex-col min-w-0 min-h-0">
					{!activeDoc && !loading && (
						<div className="flex-1 flex items-center justify-center">
							<div className="text-center">
								<FileText className="w-10 h-10 text-muted/30 mx-auto mb-3" />
								<p className="text-sm text-muted mb-1">创作台</p>
								<p className="text-xs text-muted/70">
									从左侧选择文档，或新建一篇开始
								</p>
							</div>
						</div>
					)}
					{activeDoc && (
						<>
							<DocumentHeader
								activeDoc={activeDoc}
								stylePresets={stylePresets}
								onTitleChange={handleTitleChange}
								onStylePresetChange={handleStylePresetChange}
								onOpenStylePresetModal={() => setIsStylePresetModalOpen(true)}
							/>
							<RichTextEditor
								key={activeDoc.id}
								docId={activeDoc.id}
								initialContent={activeDoc.content}
								onChange={handleEditorChange}
								onAiGenerate={handleAiGenerate}
								onBeforeAiApply={handleBeforeAiApply}
								onEditorReady={handleEditorReady}
								onOpenImport={() => setIsImportModalOpen(true)}
							/>
							<EditorActionBar
								activeDoc={activeDoc}
								wordCount={wordCount}
								saveState={saveState}
								savedAt={savedAt}
								contentText={contentText}
								currentMarkdown={currentMarkdown}
								onSnapshot={() => void handleSnapshot()}
								onToggleFinalized={() =>
									void handleStatusChange(
										activeDoc.status === "finalized" ? "editing" : "finalized",
									)
								}
								onCopyText={copyText}
								onExportWord={handleExportWord}
								onExportMarkdown={handleExportMarkdown}
								onExportHtml={handleExportHtml}
								onExportPdf={handleExportPdf}
								onOpenDistribution={() => setIsDistributionModalOpen(true)}
							/>
						</>
					)}
				</section>
			</main>
			{modals}
			<ImportModal
				isOpen={isImportModalOpen}
				onClose={() => setIsImportModalOpen(false)}
				onImport={handleImport}
			/>
			<StylePresetModal
				isOpen={isStylePresetModalOpen}
				onClose={() => setIsStylePresetModalOpen(false)}
				onPresetsUpdated={(updated) => setStylePresets(updated)}
			/>
			{activeDoc && (
				<DistributionModal
					isOpen={isDistributionModalOpen}
					onClose={() => setIsDistributionModalOpen(false)}
					title={activeDoc.title}
					contentHtml={currentHtml || activeDoc.contentText}
					contentText={contentText || activeDoc.contentText}
					markdown={currentMarkdown}
				/>
			)}
		</div>
	);
}
