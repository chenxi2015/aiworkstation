import { toast } from "@heroui/react";
import type { Editor } from "@tiptap/react";
import { FileText, Sparkles, Square } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { NavLayoutEntry } from "../../modules/registry";
import { useWorkbenchQuickActions } from "../workbench/layout/useWorkbenchQuickActions";
import { WorkbenchHeader } from "../workbench/layout/WorkbenchHeader";
import { EditorCanvasSkeleton } from "../workbench/skeletons";
import type { Folder } from "../workbench/types";
import { DocumentHeader } from "./components/DocumentHeader";
import { DocumentSidebar } from "./components/DocumentSidebar";
import { EditorActionBar } from "./components/EditorActionBar";
import { SplitCompareView } from "./components/SplitCompareView";
import { DistributionModal } from "./DistributionModal";
import { useArticleCreationPipeline } from "./hooks/useArticleCreationPipeline";
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
	const pipelineTriggerRef = useRef<
		((instruction?: string) => Promise<void>) | null
	>(null);
	const pendingImportHtmlRef = useRef<{ docId: number; html: string } | null>(
		null,
	);

	const [splitSession, setSplitSession] = useState<{
		isOpen: boolean;
		instruction?: string;
		modeLabel?: string;
	} | null>(null);

	const creationPipeline = useArticleCreationPipeline({
		editorRef: editorInstanceRef,
		onFlushSave: docManager.flushSave,
	});

	const handleStartCreatePipeline = useCallback(
		async ({
			title,
			prompt,
			stylePreset,
		}: {
			title: string;
			prompt: string;
			stylePreset?: string;
		}) => {
			// 1. Ensure split compare view is closed so creation happens in single editor
			setSplitSession(null);

			// 2. Create new document or reset current empty one
			let targetDoc = activeDoc;
			const isCurrentEmpty = !editorInstanceRef.current?.getText().trim();

			if (!targetDoc || !isCurrentEmpty) {
				targetDoc = await handleInsertNewDocument(title || "新创作文档");
			} else if (title) {
				handleTitleChange(title);
			}

			if (stylePreset) {
				handleStylePresetChange(stylePreset);
			}

			// 3. Initiate dynamic streaming creation in the single editor
			await creationPipeline.startCreation({
				title: title || targetDoc.title,
				prompt,
				stylePreset: stylePreset || targetDoc.stylePreset,
			});
		},
		[
			activeDoc,
			handleInsertNewDocument,
			handleTitleChange,
			handleStylePresetChange,
			creationPipeline,
		],
	);

	const handleStartRewritePipeline = useCallback(
		async (instruction?: string, modeLabel?: string) => {
			if (!editorInstanceRef.current) {
				toast.warning("编辑器未准备好");
				return;
			}
			const rawText = editorInstanceRef.current.getText().trim();
			if (!rawText) {
				toast.warning(
					"当前文档内容为空，无需进行改写比对。请直接输入内容或让 AI 新建文档创作。",
				);
				return;
			}
			setSplitSession({
				isOpen: true,
				instruction,
				modeLabel,
			});
		},
		[],
	);

	const handleAcceptSplitCompare = useCallback(
		async (cleanDocJson: Parameters<Editor["commands"]["setContent"]>[0]) => {
			if (!editorInstanceRef.current) return;
			await handleBeforeAiApply();
			editorInstanceRef.current.commands.setContent(cleanDocJson);
			setSplitSession(null);
			toast.success("已成功采纳改写成果，原文已更新！");
		},
		[handleBeforeAiApply],
	);

	const handleCancelSplitCompare = useCallback(() => {
		setSplitSession(null);
		toast.info("已退出改写比对，保留原文");
	}, []);

	// Bridge editor with the global AI side panel
	useEditorAiBridge({
		activeDoc,
		editorRef: editorInstanceRef,
		onBeforeAiApply: handleBeforeAiApply,
		reloadDocuments,
		onStartRewritePipeline: handleStartRewritePipeline,
		onStartCreatePipeline: handleStartCreatePipeline,
		flushSave: docManager.flushSave,
		onSwitchDocument: docManager.switchDocument,
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
					onSelect={(id) => {
						setSplitSession(null);
						void switchDocument(id);
					}}
					onCreate={() => {
						setSplitSession(null);
						void handleCreate();
					}}
					onDelete={handleDelete}
					onOpenImport={() => setIsImportModalOpen(true)}
				/>

				{/* Center: Title + Editor + Bottom actions or Split Diff View */}
				<section className="flex-1 flex flex-col min-w-0 min-h-0">
					{loading && !activeDoc && <EditorCanvasSkeleton />}
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
							{splitSession?.isOpen && editorInstanceRef.current ? (
								<SplitCompareView
									key={`split_${activeDoc.id}`}
									leftEditor={editorInstanceRef.current}
									docTitle={activeDoc.title}
									docId={activeDoc.id}
									stylePreset={activeDoc.stylePreset}
									instruction={splitSession.instruction}
									modeLabel={splitSession.modeLabel}
									onAccept={handleAcceptSplitCompare}
									onCancel={handleCancelSplitCompare}
								/>
							) : null}
							<div
								className={
									splitSession?.isOpen
										? "hidden"
										: "flex-1 flex flex-col min-h-0"
								}
							>
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
									docTitle={activeDoc.title}
									stylePreset={activeDoc.stylePreset}
									initialContent={activeDoc.content}
									onChange={handleEditorChange}
									onAiGenerate={handleAiGenerate}
									onBeforeAiApply={handleBeforeAiApply}
									onEditorReady={handleEditorReady}
									onOpenImport={() => setIsImportModalOpen(true)}
									onOpenSplitRewrite={(instruction, modeLabel) =>
										void handleStartRewritePipeline(instruction, modeLabel)
									}
									onRegisterPipeline={(trigger) => {
										pipelineTriggerRef.current = trigger;
									}}
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
											activeDoc.status === "finalized"
												? "editing"
												: "finalized",
										)
									}
									onCopyText={copyText}
									onExportWord={handleExportWord}
									onExportMarkdown={handleExportMarkdown}
									onExportHtml={handleExportHtml}
									onExportPdf={handleExportPdf}
									onOpenDistribution={() => setIsDistributionModalOpen(true)}
								/>
							</div>
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
			{creationPipeline.isStreaming && (
				<output
					aria-label="文章流式创作中"
					className="fixed bottom-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 bg-surface/95 dark:bg-zinc-900/95 backdrop-blur-md border border-border shadow-lg rounded-2xl animate-in fade-in slide-in-from-bottom-3 duration-200 select-none max-w-md w-auto"
				>
					<Sparkles className="w-4 h-4 text-accent animate-pulse shrink-0" />
					<div className="flex flex-col">
						<span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
							<span>AI 长文动态创作中...</span>
							<span className="text-muted font-normal text-[11px]">
								({creationPipeline.streamedWordCount} 字)
							</span>
						</span>
						<span className="text-[11px] text-muted truncate max-w-[200px]">
							《{creationPipeline.creationTitle}》
						</span>
					</div>
					<button
						type="button"
						onClick={creationPipeline.stopCreation}
						className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10 rounded-lg transition-colors cursor-pointer shrink-0 ml-2"
						title="停止文章创作"
					>
						<Square className="w-3 h-3 fill-current" />
						<span>停止</span>
					</button>
				</output>
			)}
		</div>
	);
}
