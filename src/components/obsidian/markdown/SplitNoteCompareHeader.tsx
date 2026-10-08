import { AlertDialog, Button, Dropdown } from "@heroui/react";
import {
	ArrowLeft,
	Check,
	Columns2,
	Ellipsis,
	FilePlus,
	GitCompare,
	Loader2,
	Sparkles,
	Square,
	X,
} from "lucide-react";
import { useState } from "react";
import type { DiffViewMode } from "./useNoteSplitDiff";

export interface SplitNoteCompareHeaderProps {
	docTitle?: string;
	modeLabel?: string;
	isStreaming: boolean;
	diffViewMode: DiffViewMode;
	onChangeDiffViewMode: (mode: DiffViewMode) => void;
	leftWordCount: number;
	rightWordCount: number;
	diffDelta: number;
	onStopGenerate?: () => void;
	onAccept: () => void;
	onCancel: () => void;
	onSaveAsNewNote?: () => void;
}

/**
 * Top control header for Obsidian Note Split Compare View:
 * - Left: Back to single-column view & Title/Mode badge
 * - Center: Clean vs Diff toggle
 * - Right: Word counts, Delta badge, Streaming status, Accept & Save as New
 * Adapts gracefully to small screens with a more-actions dropdown menu.
 */
export function SplitNoteCompareHeader({
	docTitle,
	modeLabel = "全文润色",
	isStreaming,
	diffViewMode,
	onChangeDiffViewMode,
	leftWordCount,
	rightWordCount,
	diffDelta,
	onStopGenerate,
	onAccept,
	onCancel,
	onSaveAsNewNote,
}: SplitNoteCompareHeaderProps) {
	const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
	const [isAcceptConfirmOpen, setIsAcceptConfirmOpen] = useState(false);

	const hasRightContent = rightWordCount > 0;
	const isAcceptDisabled = isStreaming || !hasRightContent;

	const handleRequestExit = () => {
		if (hasRightContent && !isStreaming) {
			setIsExitConfirmOpen(true);
		} else {
			onCancel();
		}
	};

	return (
		<>
			<header className="h-11 border-b border-border bg-surface/95 dark:bg-surface-secondary/80 backdrop-blur-md px-2.5 sm:px-3 flex items-center justify-between shrink-0 z-20 shadow-xs select-none gap-2">
				{/* Left: Return & Title */}
				<div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink">
					<Button
						variant="ghost"
						size="sm"
						isIconOnly
						className="h-7 w-7 text-muted hover:text-foreground cursor-pointer rounded-lg shrink-0"
						onPress={handleRequestExit}
						aria-label="退出双栏比对"
					>
						<ArrowLeft className="w-4 h-4" />
					</Button>
					<div className="flex items-center gap-1.5 min-w-0">
						<div className="w-5 h-5 rounded bg-accent/15 text-accent flex items-center justify-center shrink-0">
							<Sparkles className="w-3.5 h-3.5" />
						</div>
						<h2 className="font-semibold text-xs text-foreground truncate max-w-[100px] sm:max-w-[140px] md:max-w-[180px]">
							AI 比对 · {modeLabel}
						</h2>
						{docTitle && (
							<span className="hidden md:inline text-[11px] text-muted truncate max-w-[100px] lg:max-w-[180px]">
								《{docTitle}》
							</span>
						)}
					</div>
				</div>

				{/* Center: Diff vs Clean Mode Toggle */}
				<div className="flex items-center bg-surface-secondary/80 p-0.5 rounded-lg border border-border/80 text-xs shrink-0">
					<button
						type="button"
						onClick={() => onChangeDiffViewMode("clean")}
						className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md transition-colors cursor-pointer text-xs ${
							diffViewMode === "clean"
								? "bg-surface shadow-xs text-foreground font-medium"
								: "text-muted hover:text-foreground"
						}`}
						title="纯净并排视图，支持查看和微调编辑"
					>
						<Columns2 className="w-3.5 h-3.5" />
						<span className="hidden sm:inline">纯净并排</span>
					</button>
					<button
						type="button"
						onClick={() => onChangeDiffViewMode("diff")}
						className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md transition-colors cursor-pointer text-xs ${
							diffViewMode === "diff"
								? "bg-accent text-accent-foreground font-medium shadow-xs"
								: "text-muted hover:text-foreground"
						}`}
						title="差异高亮视图，红删绿增直观比对"
					>
						<GitCompare className="w-3.5 h-3.5" />
						<span className="hidden sm:inline">差异高亮</span>
					</button>
				</div>

				{/* Right: Actions */}
				<div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
					{/* Streaming status / Stop button */}
					{isStreaming && (
						<div className="flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/25 text-accent text-[11px] font-medium animate-pulse">
							<Loader2 className="w-3 h-3 animate-spin shrink-0" />
							<span className="hidden sm:inline">生成中…</span>
							{onStopGenerate && (
								<button
									type="button"
									onClick={onStopGenerate}
									className="ml-1 text-muted hover:text-foreground p-0.5"
									title="停止生成"
								>
									<Square className="w-2.5 h-2.5 fill-current" />
								</button>
							)}
						</div>
					)}

					{/* Delta Word Badge */}
					{!isStreaming && hasRightContent && (
						<span
							className={`text-[11px] font-mono px-1.5 sm:px-2 py-0.5 rounded-full border ${
								diffDelta > 0
									? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800"
									: diffDelta < 0
										? "text-rose-600 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800"
										: "text-muted bg-surface-secondary border-border"
							}`}
							title={`基准 ${leftWordCount} 字 → 新版 ${rightWordCount} 字`}
						>
							{diffDelta > 0 ? `+${diffDelta}` : diffDelta} 字
						</span>
					)}

					{/* Desktop Save As New Note (visible on md and above) */}
					{onSaveAsNewNote && (
						<Button
							variant="secondary"
							size="sm"
							className="h-7 text-xs font-normal gap-1 cursor-pointer hidden md:flex"
							isDisabled={isAcceptDisabled}
							onPress={onSaveAsNewNote}
						>
							<FilePlus className="w-3.5 h-3.5 text-muted" />
							<span>另存为新笔记</span>
						</Button>
					)}

					{/* Small screen More Actions Menu (visible below md) */}
					<div className="md:hidden">
						<Dropdown>
							<Dropdown.Trigger
								aria-label="更多操作"
								className="h-7 w-7 flex items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-surface-secondary/80 border border-border/80 transition-colors cursor-pointer shrink-0"
							>
								<Ellipsis className="w-4 h-4" />
							</Dropdown.Trigger>
							<Dropdown.Popover
								placement="bottom end"
								className="min-w-[160px] p-1 shadow-lg border border-border/80 rounded-xl bg-surface"
							>
								<Dropdown.Menu aria-label="双栏比对更多操作">
									{onSaveAsNewNote && (
										<Dropdown.Item
											id="save-as-new-note"
											textValue="另存为新笔记"
											isDisabled={isAcceptDisabled}
											onAction={onSaveAsNewNote}
										>
											<div className="flex items-center gap-2 py-0.5">
												<FilePlus className="w-3.5 h-3.5 text-muted shrink-0" />
												<span className="text-xs">另存为新笔记</span>
											</div>
										</Dropdown.Item>
									)}

									{isStreaming && onStopGenerate && (
										<Dropdown.Item
											id="stop-generating"
											textValue="停止生成"
											onAction={onStopGenerate}
										>
											<div className="flex items-center gap-2 py-0.5">
												<Square className="w-3.5 h-3.5 text-amber-500 fill-current shrink-0" />
												<span className="text-xs">停止 AI 生成</span>
											</div>
										</Dropdown.Item>
									)}

									<Dropdown.Item
										id="exit-compare"
										textValue="退出比对"
										className="text-danger hover:!bg-danger/10 hover:!text-danger"
										onAction={handleRequestExit}
									>
										<div className="flex items-center gap-2 py-0.5">
											<X className="w-3.5 h-3.5 text-danger shrink-0" />
											<span className="text-xs">退出双栏比对</span>
										</div>
									</Dropdown.Item>
								</Dropdown.Menu>
							</Dropdown.Popover>
						</Dropdown>
					</div>

					{/* Primary Accept & Overwrite */}
					<Button
						variant="primary"
						size="sm"
						className="h-7 text-xs font-medium gap-1 cursor-pointer px-2.5 sm:px-3"
						isDisabled={isAcceptDisabled}
						onPress={() => setIsAcceptConfirmOpen(true)}
					>
						<Check className="w-3.5 h-3.5" />
						<span className="hidden sm:inline">采纳覆盖</span>
						<span className="sm:hidden">采纳</span>
					</Button>
				</div>
			</header>

			{/* Exit Confirmation Dialog */}
			<AlertDialog.Backdrop
				isOpen={isExitConfirmOpen}
				onOpenChange={setIsExitConfirmOpen}
			>
				<AlertDialog.Container placement="center">
					<AlertDialog.Dialog className="sm:max-w-[420px]">
						<AlertDialog.CloseTrigger />
						<AlertDialog.Header>
							<AlertDialog.Icon status="warning" />
							<AlertDialog.Heading>确认退出双栏比对？</AlertDialog.Heading>
						</AlertDialog.Header>
						<AlertDialog.Body>
							<p className="text-xs text-muted leading-relaxed">
								当前右侧草稿尚未采纳，退出后未保存的 AI 改写内容将被丢弃。
							</p>
						</AlertDialog.Body>
						<AlertDialog.Footer>
							<Button
								variant="ghost"
								size="sm"
								onPress={() => setIsExitConfirmOpen(false)}
							>
								继续编辑
							</Button>
							<Button
								variant="danger"
								size="sm"
								onPress={() => {
									setIsExitConfirmOpen(false);
									onCancel();
								}}
							>
								丢弃并退出
							</Button>
						</AlertDialog.Footer>
					</AlertDialog.Dialog>
				</AlertDialog.Container>
			</AlertDialog.Backdrop>

			{/* Accept Confirmation Dialog */}
			<AlertDialog.Backdrop
				isOpen={isAcceptConfirmOpen}
				onOpenChange={setIsAcceptConfirmOpen}
			>
				<AlertDialog.Container placement="center">
					<AlertDialog.Dialog className="sm:max-w-[420px]">
						<AlertDialog.CloseTrigger />
						<AlertDialog.Header>
							<AlertDialog.Icon status="accent" />
							<AlertDialog.Heading>确认采纳覆盖当前笔记？</AlertDialog.Heading>
						</AlertDialog.Header>
						<AlertDialog.Body>
							<p className="text-xs text-muted leading-relaxed">
								右侧 AI
								改写版本将覆写当前笔记并在本地自动保存。采纳后仍可在编辑器中使用
								Cmd+Z 撤销。
							</p>
						</AlertDialog.Body>
						<AlertDialog.Footer>
							<Button
								variant="ghost"
								size="sm"
								onPress={() => setIsAcceptConfirmOpen(false)}
							>
								取消
							</Button>
							<Button
								variant="primary"
								size="sm"
								onPress={() => {
									setIsAcceptConfirmOpen(false);
									onAccept();
								}}
							>
								确认采纳
							</Button>
						</AlertDialog.Footer>
					</AlertDialog.Dialog>
				</AlertDialog.Container>
			</AlertDialog.Backdrop>
		</>
	);
}
