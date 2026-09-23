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
 * - Right column: Draft practice & AI revision (editable Markdown with preview toggle or green-highlighted diff)
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
	// 右栏草稿：若无指令自动启动（用户手动开启双栏对照），默认进入编辑态；流式期间强制预览
	const [isEditingDraft, setIsEditingDraft] = useState<boolean>(
		!instruction && !modeLabel,
	);

	// 记录切换模式前的草稿栏滚动位置，避免在草稿编辑/预览切换时跳跃或置顶
	const draftScrollTopRef = useRef<number>(0);

	const updateEditingDraft = useCallback(
		(next: boolean | ((prev: boolean) => boolean)) => {
			if (rightScrollRef.current) {
				draftScrollTopRef.current = rightScrollRef.current.scrollTop;
			}
			setIsEditingDraft(next);
		},
		[],
	);

	// Auto adjust textarea height so that outer scroll container handles overflow
	// biome-ignore lint/correctness/useExhaustiveDependencies: layout needs recalculation on content/mode change
	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.max(el.scrollHeight, 350)}px`;
	}, [draftContent, diffViewMode, isEditingDraft]);

	// 保持草稿栏滚动位置，并安全聚焦（避免浏览器原生滚动导致置底或跳跃）
	useEffect(() => {
		if (rightScrollRef.current) {
			rightScrollRef.current.scrollTop = draftScrollTopRef.current;
		}
		if (isEditingDraft) {
			const el = textareaRef.current;
			if (el) {
				// Prevent automatic scroll jump upon focusing
				el.focus({ preventScroll: true });
			}
		}
		requestAnimationFrame(() => {
			if (rightScrollRef.current) {
				rightScrollRef.current.scrollTop = draftScrollTopRef.current;
			}
		});
	}, [isEditingDraft]);

	// 支持 Markdown 常用编辑交互（Tab 缩进、⌘B 粗体、⌘I 斜体）
	const handleTextareaKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Tab") {
				e.preventDefault();
				const textarea = e.currentTarget;
				const start = textarea.selectionStart;
				const end = textarea.selectionEnd;
				const value = textarea.value;
				const updated = `${value.substring(0, start)}  ${value.substring(end)}`;
				setDraftContent(updated);
				requestAnimationFrame(() => {
					textarea.selectionStart = textarea.selectionEnd = start + 2;
				});
			} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
				e.preventDefault();
				const textarea = e.currentTarget;
				const start = textarea.selectionStart;
				const end = textarea.selectionEnd;
				const value = textarea.value;
				const selected = value.substring(start, end);
				const replacement = `**${selected || "粗体文本"}**`;
				const updated = `${value.substring(0, start)}${replacement}${value.substring(end)}`;
				setDraftContent(updated);
				requestAnimationFrame(() => {
					if (selected) {
						textarea.selectionStart = start;
						textarea.selectionEnd = start + replacement.length;
					} else {
						textarea.selectionStart = start + 2;
						textarea.selectionEnd = start + 2 + 4;
					}
				});
			} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
				e.preventDefault();
				const textarea = e.currentTarget;
				const start = textarea.selectionStart;
				const end = textarea.selectionEnd;
				const value = textarea.value;
				const selected = value.substring(start, end);
				const replacement = `*${selected || "斜体文本"}*`;
				const updated = `${value.substring(0, start)}${replacement}${value.substring(end)}`;
				setDraftContent(updated);
				requestAnimationFrame(() => {
					if (selected) {
						textarea.selectionStart = start;
						textarea.selectionEnd = start + replacement.length;
					} else {
						textarea.selectionStart = start + 1;
						textarea.selectionEnd = start + 1 + 4;
					}
				});
			}
		},
		[setDraftContent],
	);

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
											? "切换为 Markdown 渲染预览"
											: "切换为源码编辑"
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
							) : (
								/* Clean Mode: 渲染 Markdown 预览；「编辑」切换为源码编辑（流式期间强制预览） */
								// biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: Click empty area in clean mode to focus editing
								<div
									className="flex-1 flex flex-col min-h-[350px] cursor-text"
									onClick={(e) => {
										if (!isStreaming && !isEditingDraft) {
											updateEditingDraft(true);
										} else if (e.target === e.currentTarget) {
											textareaRef.current?.focus();
										}
									}}
								>
									{!isStreaming && isEditingDraft ? (
										<div className="flex-1 flex flex-col">
											<textarea
												ref={textareaRef}
												value={draftContent}
												onChange={(e) => setDraftContent(e.target.value)}
												onKeyDown={handleTextareaKeyDown}
												placeholder="在此编写或修改 Markdown 草稿（支持 Tab 缩进及 ⌘B / ⌘I 快捷键）…"
												className="w-full resize-none overflow-hidden bg-transparent font-sans text-sm leading-relaxed text-foreground focus:outline-none placeholder:text-muted/50"
											/>
											{!draftContent.trim() && (
												<div className="mt-6 p-4 rounded-xl border border-dashed border-border/80 bg-surface-secondary/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-muted">
													<div className="flex items-center gap-2">
														<FileText className="w-4 h-4 text-accent/80 shrink-0" />
														<span>
															草稿为空，您可以直接在上方打字，或一键导入原文对照修改
														</span>
													</div>
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
									) : draftContent ? (
										// biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: 点击预览进入编辑是便捷增强，键盘用户可走栏头「编辑」按钮
										<div
											className={`prose prose-neutral dark:prose-invert max-w-none text-sm leading-relaxed ${isStreaming ? "" : "cursor-text"}`}
											onClick={() => {
												if (!isStreaming) updateEditingDraft(true);
											}}
											title={isStreaming ? undefined : "点击可直接编辑草稿"}
											// biome-ignore lint/security/noDangerouslySetInnerHtml: Draft markdown rendered to sanitized html
											dangerouslySetInnerHTML={{ __html: rightCleanHtml }}
										/>
									) : isStreaming ? (
										<div className="text-xs text-muted/80 animate-pulse py-8 text-center">
											正在构思并生成改写内容…
										</div>
									) : (
										/* Clean 模式空状态：提供清晰指引与一键操作 */
										<div className="flex flex-col items-center justify-center py-16 text-center select-none">
											<div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center mb-3">
												<PenLine className="w-5 h-5" />
											</div>
											<p className="text-sm font-medium text-foreground mb-1">
												暂无草稿内容
											</p>
											<p className="text-xs text-muted mb-4 max-w-xs">
												右栏支持直接编写 Markdown
												或对照原文修改，采纳后可覆写笔记或另存新文件
											</p>
											<div className="flex items-center gap-2">
												<button
													type="button"
													onClick={() => updateEditingDraft(true)}
													className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:opacity-90 transition-opacity shadow-2xs cursor-pointer"
												>
													开始编写草稿
												</button>
												{originalContent.trim() && (
													<button
														type="button"
														onClick={handleLoadOriginalToDraft}
														className="px-3 py-1.5 rounded-lg bg-surface-secondary text-foreground text-xs font-medium hover:bg-surface-secondary/80 border border-border/80 transition-colors cursor-pointer"
													>
														载入原文为草稿
													</button>
												)}
											</div>
										</div>
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
