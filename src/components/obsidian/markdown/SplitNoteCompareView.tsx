import { useCallback, useEffect, useMemo, useRef } from "react";
import { markdownToHtml } from "../../editor/markdown";
import { SplitNoteCompareHeader } from "./SplitNoteCompareHeader";
import { useNoteSplitDiff } from "./useNoteSplitDiff";

export interface SplitNoteCompareViewProps {
	originalContent: string;
	docTitle?: string;
	instruction?: string;
	modeLabel?: string;
	onAccept: (newContent: string) => void;
	onCancel: () => void;
	onSaveAsNewNote?: (newContent: string) => void;
}

/**
 * Dual-column Markdown Split View with Diff & Review:
 * - Top header: Clean vs Diff toggle, delta badge, streaming control, Accept / Save as New
 * - Left column: Original base note (clean markdown or red-highlighted diff)
 * - Right column: AI revision draft (clean editable markdown or green-highlighted diff)
 * - Synchronized scroll between left and right columns
 */
export function SplitNoteCompareView({
	originalContent,
	docTitle,
	instruction,
	modeLabel,
	onAccept,
	onCancel,
	onSaveAsNewNote,
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
	const isSyncingScrollRef = useRef<boolean>(false);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	// Auto adjust textarea height so that outer scroll container handles overflow
	// biome-ignore lint/correctness/useExhaustiveDependencies: layout needs recalculation on content/mode change
	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.max(el.scrollHeight, 300)}px`;
	}, [draftContent, diffViewMode]);

	const handleLeftScroll = useCallback(() => {
		if (isSyncingScrollRef.current) return;
		const left = leftScrollRef.current;
		const right = rightScrollRef.current;
		if (!left || !right) return;

		const maxLeft = left.scrollHeight - left.clientHeight;
		if (maxLeft <= 0) return;
		const ratio = left.scrollTop / maxLeft;

		const maxRight = right.scrollHeight - right.clientHeight;
		if (maxRight > 0) {
			isSyncingScrollRef.current = true;
			right.scrollTop = ratio * maxRight;
			requestAnimationFrame(() => {
				isSyncingScrollRef.current = false;
			});
		}
	}, []);

	const handleRightScroll = useCallback(() => {
		if (isSyncingScrollRef.current) return;
		const left = leftScrollRef.current;
		const right = rightScrollRef.current;
		if (!left || !right) return;

		const maxRight = right.scrollHeight - right.clientHeight;
		if (maxRight <= 0) return;
		const ratio = right.scrollTop / maxRight;

		const maxLeft = left.scrollHeight - left.clientHeight;
		if (maxLeft > 0) {
			isSyncingScrollRef.current = true;
			left.scrollTop = ratio * maxLeft;
			requestAnimationFrame(() => {
				isSyncingScrollRef.current = false;
			});
		}
	}, []);

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

	const handleAcceptAction = useCallback(() => {
		const target = draftContent.trim() ? draftContent : originalContent;
		onAccept(target);
	}, [draftContent, originalContent, onAccept]);

	const handleSaveAsNewAction = useCallback(() => {
		if (!onSaveAsNewNote) return;
		const target = draftContent.trim() ? draftContent : originalContent;
		onSaveAsNewNote(target);
	}, [draftContent, originalContent, onSaveAsNewNote]);

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

					<div
						ref={leftScrollRef}
						onScroll={handleLeftScroll}
						className="flex-1 min-h-0 overflow-y-auto px-6 py-6 pb-24 select-text overscroll-contain"
					>
						<div className="max-w-2xl mx-auto">
							{diffViewMode === "diff" && leftDiffHtml ? (
								<div
									className="prose prose-neutral dark:prose-invert max-w-none text-sm leading-relaxed"
									// biome-ignore lint/security/noDangerouslySetInnerHtml: Sanitized markdown with diff highlights
									dangerouslySetInnerHTML={{ __html: leftDiffHtml }}
								/>
							) : (
								<div
									className="prose prose-neutral dark:prose-invert max-w-none text-sm leading-relaxed"
									// biome-ignore lint/security/noDangerouslySetInnerHtml: Base markdown rendered to html
									dangerouslySetInnerHTML={{ __html: leftOriginalHtml }}
								/>
							)}
						</div>
					</div>
				</section>

				{/* Right Column: AI Revision Draft */}
				<section className="flex-1 flex flex-col min-w-0 min-h-0 h-full bg-surface dark:bg-background">
					<div className="h-8 px-4 border-b border-border/60 bg-surface-secondary/40 flex items-center justify-between text-xs text-muted font-medium shrink-0 select-none">
						<span className="flex items-center gap-1.5 text-accent">
							<span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
							右栏 · AI 改写草稿
						</span>
						<span className="text-[11px] opacity-75 font-mono">
							{rightWordCount} 字
						</span>
					</div>

					<div
						ref={rightScrollRef}
						onScroll={handleRightScroll}
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
									<div className="text-xs text-muted py-8 text-center">
										暂无草稿内容
									</div>
								)
							) : (
								/* Clean Mode: allows editing the draft */
								<div className="flex-1 flex flex-col min-h-[300px]">
									{isStreaming ? (
										<pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
											{draftContent}
										</pre>
									) : (
										<textarea
											ref={textareaRef}
											value={draftContent}
											onChange={(e) => setDraftContent(e.target.value)}
											placeholder="AI 改写草稿将显示在此处，您也可以在此直接修改微调…"
											className="w-full resize-none overflow-hidden bg-transparent font-sans text-sm leading-relaxed text-foreground focus:outline-none placeholder:text-muted/50"
										/>
									)}
								</div>
							)}
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
