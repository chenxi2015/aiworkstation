import type { EditorView } from "@codemirror/view";
import { BookOpen, FileText, PenLine } from "lucide-react";
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { markdownToHtml } from "../../editor/markdown";
import { ImagePreviewProvider } from "../../workbench/ai/shared/ImagePreviewModal";
import { MarkdownEditor } from "./MarkdownEditor";
import { SplitNoteCompareHeader } from "./SplitNoteCompareHeader";
import { useNoteSplitDiff } from "./useNoteSplitDiff";

export interface SplitNoteCompareViewProps {
	originalContent: string;
	docTitle?: string;
	instruction?: string;
	modeLabel?: string;
	noteRelPath?: string;
	onAccept: (newContent: string) => void;
	onCancel: () => void;
	onSaveAsNewNote?: (newContent: string) => void;
	onNavigateNote?: (relPath: string) => void;
	onCreateNote?: (name: string) => void;
}

/**
 * Dual-column Markdown Split View with Diff & Review:
 * - Top header: Clean vs Diff toggle, delta badge, streaming control, Accept / Save as New
 * - Left column: Original base note (clean markdown or red-highlighted diff)
 * - Right column: Draft practice & AI revision (CodeMirror live preview with reading view toggle or diff)
 * - Synchronized scroll between left and right columns
 */
export function SplitNoteCompareView({
	originalContent,
	docTitle,
	instruction,
	modeLabel,
	noteRelPath,
	onAccept,
	onCancel,
	onSaveAsNewNote,
	onNavigateNote,
	onCreateNote,
}: SplitNoteCompareViewProps) {
	const {
		diffViewMode,
		setDiffViewMode,
		draftContent,
		setDraftContent,
		isStreaming,
		activeModeLabel,
		diffStrings,
		leftWordCount,
		rightWordCount,
		stopGenerate,
	} = useNoteSplitDiff({
		originalContent,
		docTitle,
		initialInstruction: instruction,
		initialModeLabel: modeLabel,
	});

	// Synchronized Scrolling
	const leftScrollRef = useRef<HTMLDivElement | null>(null);
	const rightScrollRef = useRef<HTMLDivElement | null>(null);
	const [leftEditorView, setLeftEditorView] = useState<EditorView | null>(null);
	const [rightEditorView, setRightEditorView] = useState<EditorView | null>(null);
	const isSyncingScrollRef = useRef<boolean>(false);

	// Right column draft mode: defaults to rendered reading view (clean, no line numbers/carets); toggleable to live preview editing
	const [isEditingDraft, setIsEditingDraft] = useState<boolean>(false);

	// Persist scroll position across mode toggles
	const draftScrollTopRef = useRef<number>(0);

	const updateEditingDraft = useCallback(
		(next: boolean | ((prev: boolean) => boolean)) => {
			setIsEditingDraft(next);
		},
		[],
	);

	// Resolve the active left scroll container element depending on view mode
	const getLeftScrollElement = useCallback((): HTMLElement | null => {
		if (diffViewMode === "diff") {
			return leftScrollRef.current;
		}
		return leftEditorView?.scrollDOM ?? null;
	}, [diffViewMode, leftEditorView]);

	// Resolve the active right scroll container element depending on view mode
	const getRightScrollElement = useCallback((): HTMLElement | null => {
		if (diffViewMode === "diff" || isStreaming) {
			return rightScrollRef.current;
		}
		return rightEditorView?.scrollDOM ?? null;
	}, [diffViewMode, isStreaming, rightEditorView]);

	// Sync scroll offset from right container to left container
	const syncRightToLeft = useCallback((rightEl: HTMLElement | null) => {
		if (isSyncingScrollRef.current || !rightEl) return;
		const left = getLeftScrollElement();
		if (!left) return;

		const maxRight = rightEl.scrollHeight - rightEl.clientHeight;
		if (maxRight <= 0) return;
		const ratio = rightEl.scrollTop / maxRight;

		const maxLeft = left.scrollHeight - left.clientHeight;
		if (maxLeft > 0) {
			isSyncingScrollRef.current = true;
			left.scrollTop = ratio * maxLeft;
			requestAnimationFrame(() => {
				isSyncingScrollRef.current = false;
			});
		}
	}, [getLeftScrollElement]);

	// Sync scroll offset from left container to right container
	const syncLeftToRight = useCallback((leftEl: HTMLElement | null) => {
		if (isSyncingScrollRef.current || !leftEl) return;
		const right = getRightScrollElement();
		if (!right) return;

		const maxLeft = leftEl.scrollHeight - leftEl.clientHeight;
		if (maxLeft <= 0) return;
		const ratio = leftEl.scrollTop / maxLeft;

		const maxRight = right.scrollHeight - right.clientHeight;
		if (maxRight > 0) {
			isSyncingScrollRef.current = true;
			right.scrollTop = ratio * maxRight;
			requestAnimationFrame(() => {
				isSyncingScrollRef.current = false;
			});
		}
	}, [getRightScrollElement]);

	// Handle left/right EditorView mount & restore scroll position
	const handleLeftEditorReady = useCallback((view: EditorView | null) => {
		setLeftEditorView(view);
	}, []);

	const handleRightEditorReady = useCallback((view: EditorView | null) => {
		setRightEditorView(view);
		if (view && draftScrollTopRef.current > 0) {
			view.scrollDOM.scrollTop = draftScrollTopRef.current;
		}
	}, []);

	// Listen to left CodeMirror scroll events in clean mode
	useEffect(() => {
		const scrollDOM = leftEditorView?.scrollDOM;
		if (!scrollDOM || diffViewMode !== "clean") return;

		const handleEditorScroll = () => {
			syncLeftToRight(scrollDOM);
		};

		scrollDOM.addEventListener("scroll", handleEditorScroll, { passive: true });
		return () => {
			scrollDOM.removeEventListener("scroll", handleEditorScroll);
		};
	}, [diffViewMode, syncLeftToRight, leftEditorView]);

	// Listen to right CodeMirror scroll events in clean mode
	useEffect(() => {
		const scrollDOM = rightEditorView?.scrollDOM;
		if (!scrollDOM || diffViewMode !== "clean" || isStreaming) return;

		const handleEditorScroll = () => {
			draftScrollTopRef.current = scrollDOM.scrollTop;
			syncRightToLeft(scrollDOM);
		};

		scrollDOM.addEventListener("scroll", handleEditorScroll, { passive: true });
		return () => {
			scrollDOM.removeEventListener("scroll", handleEditorScroll);
		};
	}, [diffViewMode, isStreaming, syncRightToLeft, rightEditorView]);

	// Clean rendered HTML of the original content (used in Clean mode or as Diff fallback)
	const leftOriginalHtml = useMemo(() => {
		return markdownToHtml(originalContent);
	}, [originalContent]);

	const leftDiffHtml = useMemo(() => {
		if (diffViewMode !== "diff" || !diffStrings.leftHighlighted) return "";
		return markdownToHtml(diffStrings.leftHighlighted);
	}, [diffViewMode, diffStrings.leftHighlighted]);

	const rightDiffHtml = useMemo(() => {
		if (diffViewMode !== "diff" || !diffStrings.rightHighlighted) return "";
		return markdownToHtml(diffStrings.rightHighlighted);
	}, [diffViewMode, diffStrings.rightHighlighted]);

	// Clean 模式的右栏渲染：流式期间 chunks 高频到达，用 deferred 值降低
	// Markdown→HTML 重算频率，避免每个 chunk 都全量解析阻塞输入
	const deferredDraftContent = useDeferredValue(draftContent);
	const rightCleanHtml = useMemo(() => {
		if (!deferredDraftContent) return "";
		return markdownToHtml(deferredDraftContent);
	}, [deferredDraftContent]);

	const handleAcceptAction = useCallback(() => {
		const target = draftContent.trim() ? draftContent : originalContent;
		onAccept(target);
	}, [draftContent, originalContent, onAccept]);

	const handleSaveAsNewAction = useCallback(() => {
		if (!onSaveAsNewNote) return;
		const target = draftContent.trim() ? draftContent : originalContent;
		onSaveAsNewNote(target);
	}, [draftContent, originalContent, onSaveAsNewNote]);

	// 一键载入原文为初始草稿
	const handleLoadOriginalToDraft = useCallback(() => {
		setDraftContent(originalContent);
		setIsEditingDraft(true);
	}, [originalContent, setDraftContent]);

	return (
		<div className="absolute inset-0 flex flex-col min-h-0 bg-surface dark:bg-background overflow-hidden select-text">
			{/* Top Control Header */}
			<SplitNoteCompareHeader
				docTitle={docTitle}
				modeLabel={activeModeLabel}
				isStreaming={isStreaming}
				diffViewMode={diffViewMode}
				onChangeDiffViewMode={setDiffViewMode}
				leftWordCount={leftWordCount}
				rightWordCount={rightWordCount}
				diffDelta={diffStrings.diffDelta}
				onStopGenerate={stopGenerate}
				onAccept={handleAcceptAction}
				onCancel={onCancel}
				onSaveAsNewNote={onSaveAsNewNote ? handleSaveAsNewAction : undefined}
			/>

			{/* Main Split Body: Left 50% vs Right 50% */}
			<div className="flex-1 min-h-0 flex overflow-hidden relative">
				{/* Left Column: Base Version */}
				<section className="flex-1 flex flex-col min-w-0 min-h-0 h-full border-r border-border/80 bg-surface/50 dark:bg-background/50">
					<div className="h-8 px-4 border-b border-border/60 bg-surface-secondary/40 flex items-center justify-between text-xs text-muted font-medium shrink-0 select-none">
						<span className="flex items-center gap-1.5">
							<span className="w-1.5 h-1.5 rounded-full bg-muted/60" />
							左栏 · 原文基准
						</span>
						<span className="text-[11px] opacity-75 font-mono">
							{leftWordCount} 字
						</span>
					</div>

					{diffViewMode === "diff" ? (
						<div
							ref={leftScrollRef}
							onScroll={(e) => syncLeftToRight(e.currentTarget)}
							className="flex-1 min-h-0 overflow-y-auto px-6 py-6 pb-24 select-text overscroll-contain"
						>
							<div className="max-w-2xl mx-auto">
								<div
									className="prose prose-neutral dark:prose-invert max-w-none text-sm leading-relaxed"
									// biome-ignore lint/security/noDangerouslySetInnerHtml: Sanitized markdown with diff highlights
									dangerouslySetInnerHTML={{ __html: leftDiffHtml || leftOriginalHtml }}
								/>
							</div>
						</div>
					) : (
						/* Clean Mode: Full rendered reading view matching right column */
						<div className="flex-1 min-h-0 relative h-full flex flex-col">
							<ImagePreviewProvider>
								<MarkdownEditor
									value={originalContent}
									onChange={() => {}}
									readOnly={true}
									reading={true}
									onReady={handleLeftEditorReady}
									noteRelPath={noteRelPath}
									onNavigateNote={onNavigateNote}
									onCreateNote={onCreateNote}
								/>
							</ImagePreviewProvider>
						</div>
					)}
				</section>

				{/* Right Column: AI Revision Draft / Practice Canvas */}
				<section className="flex-1 flex flex-col min-w-0 min-h-0 h-full bg-surface dark:bg-background">
					<div className="h-8 px-4 border-b border-border/60 bg-surface-secondary/40 flex items-center justify-between text-xs text-muted font-medium shrink-0 select-none">
						<span className="flex items-center gap-1.5 text-accent">
							<span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
							{instruction || modeLabel
								? `右栏 · ${activeModeLabel || modeLabel || "AI 改写草稿"}`
								: "右栏 · 草稿演练"}
						</span>
						<span className="flex items-center gap-2">
							{!isStreaming && diffViewMode === "clean" && (
								<button
									type="button"
									onClick={() => updateEditingDraft((v) => !v)}
									className={`text-[11px] px-2 py-0.5 rounded border transition-colors flex items-center gap-1 cursor-pointer ${
										isEditingDraft
											? "border-accent/40 bg-accent/10 text-accent font-medium"
											: "border-border/70 text-muted hover:text-foreground hover:bg-surface-secondary/80"
									}`}
									title={
										isEditingDraft
											? "切换为阅读预览模式"
											: "切换为编辑即预览模式"
									}
								>
									{isEditingDraft ? (
										<>
											<BookOpen className="w-3 h-3" />
											<span>预览</span>
										</>
									) : (
										<>
											<PenLine className="w-3 h-3" />
											<span>编辑</span>
										</>
									)}
								</button>
							)}
							<span className="text-[11px] opacity-75 font-mono">
								{rightWordCount} 字
							</span>
						</span>
					</div>

					{diffViewMode === "diff" || isStreaming ? (
						<div
							ref={rightScrollRef}
							onScroll={(e) => syncRightToLeft(e.currentTarget)}
							className="flex-1 min-h-0 overflow-y-auto px-6 py-6 pb-24 select-text overscroll-contain"
						>
							<div className="max-w-2xl mx-auto min-h-full flex flex-col">
								{diffViewMode === "diff" ? (
									rightDiffHtml ? (
										<div
											className="prose prose-neutral dark:prose-invert max-w-none text-sm leading-relaxed"
											// biome-ignore lint/security/noDangerouslySetInnerHtml: Sanitized markdown with diff highlights
											dangerouslySetInnerHTML={{ __html: rightDiffHtml }}
										/>
									) : isStreaming ? (
										<div className="text-xs text-muted/80 animate-pulse py-8 text-center">
											正在构思并生成改写内容…
										</div>
									) : (
										<div className="flex flex-col items-center justify-center py-16 text-center">
											<p className="text-xs text-muted mb-3">
												暂无差异内容（草稿与原文一致或草稿为空）
											</p>
											<button
												type="button"
												onClick={() => {
													setDiffViewMode("clean");
													updateEditingDraft(true);
												}}
												className="text-xs px-2.5 py-1 rounded bg-surface-secondary text-foreground hover:bg-surface-secondary/80 border border-border/80 transition-colors cursor-pointer"
											>
												切换至纯净并排编辑
											</button>
										</div>
									)
								) : draftContent ? (
									<div
										className="prose prose-neutral dark:prose-invert max-w-none text-sm leading-relaxed"
										// biome-ignore lint/security/noDangerouslySetInnerHtml: Streaming markdown rendered to sanitized html
										dangerouslySetInnerHTML={{ __html: rightCleanHtml }}
									/>
								) : (
									<div className="text-xs text-muted/80 animate-pulse py-8 text-center">
										正在构思并生成改写内容…
									</div>
								)}
							</div>
						</div>
					) : (
						/* Clean Mode: CodeMirror Live Preview with reading view toggle */
						<div className="flex-1 min-h-0 relative h-full flex flex-col">
							<ImagePreviewProvider>
								<MarkdownEditor
									value={draftContent}
									onChange={setDraftContent}
									reading={!isEditingDraft}
									onReady={handleRightEditorReady}
									placeholderText="在此编写或修改 Markdown 草稿（支持 md 语法与编辑即预览）…"
									noteRelPath={noteRelPath}
									onNavigateNote={onNavigateNote}
									onCreateNote={onCreateNote}
								/>
							</ImagePreviewProvider>
							{!draftContent.trim() && (
								<div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 px-4 py-2.5 rounded-xl border border-dashed border-border/80 bg-surface/95 dark:bg-background/95 backdrop-blur-sm flex items-center gap-3 text-xs text-muted shadow-sm max-w-[90%] select-none">
									<FileText className="w-4 h-4 text-accent/80 shrink-0" />
									<span>草稿为空，支持直接输入 Markdown 或一键载入原文对照</span>
									{originalContent.trim() && (
										<button
											type="button"
											onClick={handleLoadOriginalToDraft}
											className="px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-secondary border border-border text-foreground text-xs font-medium transition-colors shadow-2xs cursor-pointer shrink-0"
										>
											载入原文为草稿
										</button>
									)}
								</div>
							)}
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
