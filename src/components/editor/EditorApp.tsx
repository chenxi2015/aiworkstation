import {
	DragDropProvider,
	type DragEndEvent,
	type DragMoveEvent,
} from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { toast } from "@heroui/react";
import type { Editor, JSONContent } from "@tiptap/react";
import { FileText, Sparkles, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NavLayoutEntry } from "../../modules/registry";
import { updateDocumentRpc } from "../../services/api/editorClient";
import { arrayMove } from "../workbench/dnd/dndUtils";
import { EditorCanvasSkeleton } from "../workbench/skeletons";
import type { Folder } from "../workbench/types";
import { DocumentEditorCanvas } from "./components/DocumentEditorCanvas";
import { DocumentSidebar } from "./components/DocumentSidebar";
import { EditorDragChip } from "./components/EditorDragChip";
import { FolderSidebar } from "./components/FolderSidebar";
import { DistributionModal } from "./DistributionModal";
import { useArticleCreationPipeline } from "./hooks/useArticleCreationPipeline";
import { useDocumentExport } from "./hooks/useDocumentExport";
import { useDocumentManager } from "./hooks/useDocumentManager";
import { useEditorAiBridge } from "./hooks/useEditorAiBridge";
import { ImportModal } from "./ImportModal";
import { markdownToTiptapDoc } from "./markdown";
import { AudioStudioCanvas } from "./media/AudioStudioCanvas";
import { VideoStudioCanvas } from "./media/VideoStudioCanvas";
import { normalizeCodeCardHtml } from "./utils/codeCardNormalizer";
import { detectDocumentMediaInfo } from "./utils/documentMediaKind";
import type { EditorDragData } from "./utils/editorDnd";
import { useNavigate } from "@tanstack/react-router";

const FOLDER_SIDEBAR_COLLAPSED_KEY = "editor.folderSidebar.collapsed";

/** 指针命中的文件夹行（拖拽中的元素 pointer-events:none，会被自然跳过） */
function hitTestFolderRow(point: {
	x: number;
	y: number;
}): number | "all" | null {
	const el = document.elementFromPoint(point.x, point.y);
	const row = el instanceof Element ? el.closest("[data-edfolder]") : null;
	if (!row) return null;
	const raw = row.getAttribute("data-edfolder");
	if (raw === "all") return "all";
	const folderId = Number(raw);
	return Number.isFinite(folderId) ? folderId : null;
}

export interface EditorAppProps {
	unclassifiedCount: number;
	navLayout?: NavLayoutEntry[];
	folders: Folder[];
	/** 深链：文档就绪后直接打开指定文档 */
	initialDocId?: number;
	/** 嵌入自媒体「创作台」时隐藏全局头部与快捷动作弹窗（由宿主 CreatorApp 渲染） */
	embedded?: boolean;
}

/**
 * Creation workbench module entry (docs/editor-plan.md Editor-α).
 * Left: Documents sidebar (drafts);
 * Center: Title + TipTap canvas;
 * Bottom: Word count / Save state / Export actions.
 */
export function EditorApp({
	unclassifiedCount: _unclassifiedCount,
	navLayout: _navLayout,
	folders: _folders,
	initialDocId,
	embedded: _embedded = false,
}: EditorAppProps) {
	const docManager = useDocumentManager();
	const {
		documents,
		loading,
		docFolders,
		activeFolderId,
		setActiveFolderId,
		handleCreateFolder,
		handleRenameFolder,
		handleDeleteFolder,
		handleReorderFolders,
		handleMoveDocument,
		handleTogglePinned,
		handleReorderDocuments,
		activeId,
		activeDoc,
		saveState,
		savedAt,
		contentText,
		switchDocument,
		handleCreate,
		handleDelete,
		handleEditorChange,
		handleTitleChange,
		handleStylePresetChange,
		handleStatusChange,
		handleArchive,
		handleSnapshot,
		handleBeforeAiApply,
		handleAiGenerate,
		handleInsertNewDocument,
		reloadDocuments,
	} = docManager;

	// 文件夹栏折叠态（持久化到 localStorage）
	const [folderCollapsed, setFolderCollapsed] = useState(
		() =>
			typeof window !== "undefined" &&
			window.localStorage.getItem(FOLDER_SIDEBAR_COLLAPSED_KEY) === "1",
	);
	const toggleFolderCollapsed = useCallback(() => {
		setFolderCollapsed((prev) => {
			const next = !prev;
			try {
				window.localStorage.setItem(
					FOLDER_SIDEBAR_COLLAPSED_KEY,
					next ? "1" : "0",
				);
			} catch {
				// localStorage 不可用时静默忽略
			}
			return next;
		});
	}, []);

	// 文档拖到文件夹行的悬停高亮目标
	const [docDropTarget, setDocDropTarget] = useState<number | "all" | null>(
		null,
	);
	// Cache last value to skip identical setState calls entirely
	const docDropTargetRef = useRef<number | "all" | null>(null);

	const handleEditorDragMove = useCallback((event: DragMoveEvent) => {
		const { operation } = event;
		const data = operation.source?.data as EditorDragData | undefined;
		if (data?.kind !== "editor-doc") {
			if (docDropTargetRef.current !== null) {
				docDropTargetRef.current = null;
				setDocDropTarget(null);
			}
			return;
		}
		// sortable 插件会把 target 重置为拖拽源，文件夹命中改用指针探测
		const hit = hitTestFolderRow(operation.position.current);
		const next = hit !== null && hit !== (data.folderId ?? "all") ? hit : null;
		if (docDropTargetRef.current !== next) {
			docDropTargetRef.current = next;
			setDocDropTarget(next);
		}
	}, []);

	const handleEditorDragEnd = useCallback(
		(event: DragEndEvent) => {
			docDropTargetRef.current = null;
			setDocDropTarget(null);
			const { operation } = event;
			const { source } = operation;
			const data = source?.data as EditorDragData | undefined;
			if (!data || !source) return;

			// 文件夹行拖拽：sortable 重排
			if (data.kind === "editor-folder") {
				if (isSortable(source)) {
					const { initialIndex, index } = source.sortable;
					if (
						initialIndex !== index &&
						initialIndex >= 0 &&
						index >= 0 &&
						index < docFolders.length
					) {
						void handleReorderFolders(
							arrayMove(
								docFolders.map((f) => f.id),
								initialIndex,
								index,
							),
						);
					}
				}
				return;
			}

			// 文档拖拽：优先判定「移动到文件夹」（指针命中文件夹行）
			const hit = hitTestFolderRow(operation.position.current);
			if (hit !== null) {
				const targetFolderId = hit === "all" ? null : hit;
				if (targetFolderId !== data.folderId) {
					void handleMoveDocument(data.docId, targetFolderId);
					return;
				}
			}

			// 否则按文档组内排序处理（仅未置顶组可排序）
			if (isSortable(source)) {
				const { initialIndex, index } = source.sortable;
				if (initialIndex === index || initialIndex < 0 || index < 0) return;
				const scoped =
					activeFolderId === "all"
						? documents
						: documents.filter((d) => d.folderId === activeFolderId);
				const unpinnedIds = scoped.filter((d) => !d.pinned).map((d) => d.id);
				if (index < unpinnedIds.length) {
					void handleReorderDocuments(
						arrayMove(unpinnedIds, initialIndex, index),
					);
				}
			}
		},
		[
			docFolders,
			documents,
			activeFolderId,
			handleReorderFolders,
			handleMoveDocument,
			handleReorderDocuments,
		],
	);

	const navigate = useNavigate({ from: "/creator/studio" });

	// 响应外部 URL 深链或浏览器前进/后退（popstate）变更
	useEffect(() => {
		if (!initialDocId || loading) return;
		if (
			initialDocId !== activeId &&
			documents.some((d) => d.id === initialDocId)
		) {
			void switchDocument(initialDocId);
		}
	}, [initialDocId, activeId, loading, documents, switchDocument]);

	// Support switching an audio/video asset to rich-text document editing mode
	const [forceDocModeId, setForceDocModeId] = useState<number | null>(null);

	const activeMediaInfo = useMemo(
		() => detectDocumentMediaInfo(activeDoc),
		[activeDoc],
	);

	const effectiveMediaKind = useMemo(() => {
		if (forceDocModeId != null && activeDoc?.id === forceDocModeId) {
			return "doc";
		}
		return activeMediaInfo.kind;
	}, [forceDocModeId, activeDoc?.id, activeMediaInfo.kind]);

	// 即时选择文档并静态联动 URL（通过 TanStack Router replace 静态更新 search 参数，不触发全路由跳转）
	const handleSelectDoc = useCallback(
		(id: number, overrideMode?: "doc" | "audio" | "video") => {
			setSplitSession(null);
			void switchDocument(id);

			const targetDoc = documents.find((d) => d.id === id);
			const mediaKind = targetDoc
				? detectDocumentMediaInfo(targetDoc).kind
				: "doc";
			const expectedMode =
				overrideMode ??
				(forceDocModeId != null && targetDoc?.id === forceDocModeId
					? "doc"
					: mediaKind);

			void navigate({
				search: (prev) => ({
					...prev,
					doc: id,
					mode: expectedMode,
				}),
				replace: true,
				resetScroll: false,
			});
		},
		[switchDocument, documents, forceDocModeId, navigate],
	);

	// 初始加载完成后，若地址栏尚未包含 doc 参数，进行一次静默补全
	const initialUrlSyncedRef = useRef(false);
	useEffect(() => {
		if (initialUrlSyncedRef.current || loading || !activeDoc) return;
		initialUrlSyncedRef.current = true;
		if (!initialDocId) {
			void navigate({
				search: (prev) => ({
					...prev,
					doc: activeDoc.id,
					mode: effectiveMediaKind,
				}),
				replace: true,
				resetScroll: false,
			});
		}
	}, [loading, activeDoc, effectiveMediaKind, initialDocId, navigate]);

	const {
		currentMarkdown,
		currentHtml,
		copyText,
		copyHtml,
		copyMarkdown,
		handleExportWord,
		handleExportMarkdown,
		handleExportHtml,
		handleExportPdf,
	} = useDocumentExport({ activeDoc, contentText });

	const [isImportModalOpen, setIsImportModalOpen] = useState(false);
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

	const handleToggleSplitLayout = useCallback(() => {
		if (!editorInstanceRef.current) return;
		if (splitSession?.isOpen) {
			setSplitSession(null);
			toast.info("已切回单栏专注写作");
		} else {
			setSplitSession({
				isOpen: true,
			});
		}
	}, [splitSession]);

	const handleSaveAsNewDocument = useCallback(
		async (title: string, markdown: string, docJson?: JSONContent) => {
			try {
				// 双栏另存时直接携带右栏 TipTap JSON，避免 Markdown 往返丢失
				// HTML 样式（styledContainer / textStyle 等）；无 JSON 时回退 Markdown 解析
				const finalDocJson = docJson
					? {
							...docJson,
							type: "doc",
							content:
								docJson.content && docJson.content.length > 0
									? docJson.content
									: [{ type: "paragraph" }],
						}
					: (() => {
							const { nodes } = markdownToTiptapDoc(markdown);
							return {
								type: "doc",
								content: nodes.length > 0 ? nodes : [{ type: "paragraph" }],
							};
						})();
				// 先建文档但不激活：避免编辑器以空 initialContent 挂载
				// （useEditor 仅在创建时读取一次 initialContent，之后 prop 更新无效）
				const newDoc = await handleInsertNewDocument(title, {
					activate: false,
				});
				pendingImportHtmlRef.current = null;
				await updateDocumentRpc({
					id: newDoc.id,
					title,
					content: JSON.stringify(finalDocJson),
					contentText: markdown,
				});
				// 先把含正文的新文档同步进本地 state，再切换激活，
				// 保证 RichTextEditor 首次挂载即拿到完整内容
				await reloadDocuments();
				await switchDocument(newDoc.id);
				setSplitSession(null);
				toast.success(`已成功将该版本另存为新文档《${title}》！`);
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				toast.danger(`另存为新文档失败: ${msg}`);
			}
		},
		[handleInsertNewDocument, reloadDocuments, switchDocument],
	);

	const handleAcceptSplitCompare = useCallback(
		async (cleanDocJson: Parameters<Editor["commands"]["setContent"]>[0]) => {
			if (!editorInstanceRef.current) return;
			await handleBeforeAiApply();
			editorInstanceRef.current.commands.setContent(cleanDocJson, {
				emitUpdate: true,
			});
			handleEditorChange(
				JSON.stringify(cleanDocJson),
				editorInstanceRef.current.getText(),
			);
			// 保持双栏打开：SplitCompareView 内部将草稿固化为新版本并切到左栏，可继续叠加优化
			toast.success("已采纳至正文并生成新版本，可继续叠加优化！");
		},
		[handleBeforeAiApply, handleEditorChange],
	);

	const handleCancelSplitCompare = useCallback(() => {
		setSplitSession(null);
		toast.info("已退出双栏演练");
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
				editor.commands.setContent(normalizeCodeCardHtml(html));
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
			const normalizedHtml = normalizeCodeCardHtml(html);
			if (target === "insert" && editorInstanceRef.current) {
				editorInstanceRef.current.commands.insertContent(normalizedHtml);
				return;
			}
			const doc = await handleInsertNewDocument(title);
			pendingImportHtmlRef.current = { docId: doc.id, html: normalizedHtml };
		},
		[handleInsertNewDocument],
	);

	const wordCount = contentText.length || (activeDoc?.contentText.length ?? 0);

	return (
		<div className="h-full bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden">
			<main className="flex-1 overflow-hidden flex min-h-0">
				{/* Left: Folders + Documents（Notes 式三栏，跨栏拖拽共用一个 provider） */}
				<DragDropProvider
					onDragMove={handleEditorDragMove}
					onDragEnd={handleEditorDragEnd}
				>
					<FolderSidebar
						folders={docFolders}
						totalCount={documents.length}
						activeFolderId={activeFolderId}
						docDropTarget={docDropTarget}
						collapsed={folderCollapsed}
						onToggleCollapsed={toggleFolderCollapsed}
						onSelectFolder={setActiveFolderId}
						onCreateFolder={handleCreateFolder}
						onRenameFolder={handleRenameFolder}
						onDeleteFolder={handleDeleteFolder}
					/>
					<DocumentSidebar
						documents={documents}
						loading={loading}
						activeId={activeId}
						activeFolderId={activeFolderId}
						folders={docFolders}
						onSelect={handleSelectDoc}
						onCreate={async () => {
							setSplitSession(null);
							const newDoc = await handleCreate();
							if (newDoc) {
								handleSelectDoc(newDoc.id);
							}
						}}
						onDelete={async (id, deleteLocalAssets) => {
							await handleDelete(id, deleteLocalAssets);
							const remaining = documents.filter((d) => d.id !== id);
							if (activeId === id && remaining[0]) {
								handleSelectDoc(remaining[0].id);
							}
						}}
						onOpenImport={() => setIsImportModalOpen(true)}
						onTogglePin={handleTogglePinned}
						onMoveDocument={handleMoveDocument}
						onArchive={handleArchive}
					/>
					{/* 拖拽跟随物：Notes 式纯图标芯片，紧贴指针左侧（自绘，不用 DragOverlay 避免继承源卡片宽度） */}
					<EditorDragChip />
				</DragDropProvider>

				{/* Center: Title + Editor + Bottom actions or Dedicated Media Canvases */}
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
					{activeDoc &&
						(effectiveMediaKind === "audio" ? (
							<AudioStudioCanvas
								key={`audio_${activeDoc.id}`}
								doc={activeDoc}
								mediaInfo={activeMediaInfo}
								onTitleChange={handleTitleChange}
								onOpenAsDoc={() => {
									setForceDocModeId(activeDoc.id);
									handleSelectDoc(activeDoc.id, "doc");
								}}
							/>
						) : effectiveMediaKind === "video" ? (
							<VideoStudioCanvas
								key={`video_${activeDoc.id}`}
								doc={activeDoc}
								mediaInfo={activeMediaInfo}
								onTitleChange={handleTitleChange}
								onOpenAsDoc={() => {
									setForceDocModeId(activeDoc.id);
									handleSelectDoc(activeDoc.id, "doc");
								}}
							/>
						) : (
							<DocumentEditorCanvas
								activeDoc={activeDoc}
								splitSession={splitSession}
								editorRef={editorInstanceRef}
								wordCount={wordCount}
								saveState={saveState}
								savedAt={savedAt}
								contentText={contentText}
								onTitleChange={handleTitleChange}
								onToggleSplitLayout={handleToggleSplitLayout}
								onAcceptSplitCompare={handleAcceptSplitCompare}
								onCancelSplitCompare={handleCancelSplitCompare}
								onSaveAsNewDocument={handleSaveAsNewDocument}
								onEditorChange={handleEditorChange}
								onAiGenerate={handleAiGenerate}
								onBeforeAiApply={handleBeforeAiApply}
								onEditorReady={handleEditorReady}
								onOpenImport={() => setIsImportModalOpen(true)}
								onRegisterPipeline={(trigger) => {
									pipelineTriggerRef.current = trigger;
								}}
								onSnapshot={() => void handleSnapshot()}
								onStatusChange={(status) => void handleStatusChange(status)}
								onCopyText={copyText}
								onCopyMarkdown={copyMarkdown}
								onCopyHtml={copyHtml}
								onExportWord={handleExportWord}
								onExportMarkdown={handleExportMarkdown}
								onExportHtml={handleExportHtml}
								onExportPdf={handleExportPdf}
								onOpenDistribution={() => setIsDistributionModalOpen(true)}
								mediaMode={
									forceDocModeId === activeDoc.id &&
									activeMediaInfo.kind !== "doc"
										? {
												kind: activeMediaInfo.kind,
												onSwitch: () => {
													// 清除强制富文本模式，切回音视频工作室
													setForceDocModeId(null);
													handleSelectDoc(activeDoc.id, activeMediaInfo.kind);
												},
											}
										: undefined
								}
							/>
						))}
				</section>
			</main>
			<ImportModal
				isOpen={isImportModalOpen}
				onClose={() => setIsImportModalOpen(false)}
				onImport={handleImport}
			/>
			{activeDoc && effectiveMediaKind === "doc" && (
				<DistributionModal
					isOpen={isDistributionModalOpen}
					onClose={() => setIsDistributionModalOpen(false)}
					title={activeDoc.title}
					contentHtml={currentHtml || activeDoc.contentText}
					contentText={contentText || activeDoc.contentText}
					markdown={currentMarkdown}
				/>
			)}
			{effectiveMediaKind === "doc" && creationPipeline.isStreaming && (
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
