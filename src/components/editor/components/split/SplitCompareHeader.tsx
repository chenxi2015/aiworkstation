import { Button } from "@heroui/react";
import {
	ArrowLeft,
	BookmarkCheck,
	Check,
	Columns2,
	FilePlus,
	GitCompare,
	Save,
	Sparkles,
	X,
} from "lucide-react";
import type { ViewMode } from "./types";

export interface SplitCompareHeaderProps {
	docTitle?: string;
	modeLabel?: string;
	isStreaming: boolean;
	diffViewMode?: ViewMode;
	onChangeDiffViewMode?: (mode: ViewMode) => void;
	onSaveVersionToDb?: () => void;
	isSavingVersion?: boolean;
	canAccept?: boolean;
	canSaveAsNew?: boolean;
	onAccept: () => void;
	onCancel: () => void;
	onSaveAsNewDocument?: () => void;
}

/**
 * Top control header for dual-editor AI Creation Mode:
 * Includes Diff vs Clean view switcher, Save version to DB, Exit and Accept actions.
 */
export function SplitCompareHeader({
	docTitle,
	modeLabel,
	isStreaming,
	diffViewMode = "clean",
	onChangeDiffViewMode,
	onSaveVersionToDb,
	isSavingVersion = false,
	canAccept = true,
	canSaveAsNew = true,
	onAccept,
	onCancel,
	onSaveAsNewDocument,
}: SplitCompareHeaderProps) {
	return (
		<header className="h-11 border-b border-border bg-surface/95 dark:bg-surface-secondary/80 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-20 shadow-xs">
			{/* Left: Return & Title */}
			<div className="flex items-center gap-2.5 min-w-0">
				<Button
					variant="ghost"
					size="sm"
					isIconOnly
					className="h-7 w-7 text-muted hover:text-foreground cursor-pointer rounded-lg"
					onPress={onCancel}
					aria-label="返回常规写作"
				>
					<ArrowLeft className="w-4 h-4" />
				</Button>
				<div className="flex items-center gap-2 min-w-0">
					<div className="w-5 h-5 rounded bg-accent/15 text-accent flex items-center justify-center shrink-0">
						<Sparkles className="w-3.5 h-3.5" />
					</div>
					<h2 className="font-semibold text-xs text-foreground truncate max-w-[140px] md:max-w-[200px]">
						AI 创作模式{modeLabel ? ` · ${modeLabel}` : ""}
					</h2>
					{docTitle && (
						<span className="hidden sm:inline text-[11px] text-muted truncate max-w-[120px] md:max-w-[180px]">
							《{docTitle}》
						</span>
					)}
				</div>
			</div>

			{/* Center: Diff vs Clean Mode Toggle */}
			{onChangeDiffViewMode && (
				<div className="flex items-center bg-surface-secondary/80 p-0.5 rounded-lg border border-border/80 text-xs">
					<button
						type="button"
						onClick={() => onChangeDiffViewMode("clean")}
						className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors cursor-pointer text-xs ${
							diffViewMode === "clean"
								? "bg-surface shadow-xs text-foreground font-medium"
								: "text-muted hover:text-foreground"
						}`}
						title="纯净并排视图，无高亮标记，支持打字编辑"
					>
						<Columns2 className="w-3.5 h-3.5" />
						<span>纯净并排</span>
					</button>
					<button
						type="button"
						onClick={() => onChangeDiffViewMode("diff")}
						className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors cursor-pointer text-xs ${
							diffViewMode === "diff"
								? "bg-accent text-accent-foreground font-medium shadow-xs"
								: "text-muted hover:text-foreground"
						}`}
						title="差异高亮视图，红删绿增实时比对"
					>
						<GitCompare className="w-3.5 h-3.5" />
						<span>差异高亮</span>
					</button>
				</div>
			)}

			{/* Right: Save to DB, Save as new, Exit, Accept to main */}
			<div className="flex items-center gap-2 shrink-0">
				{onSaveVersionToDb && (
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs text-muted hover:text-foreground cursor-pointer px-2.5"
						onPress={onSaveVersionToDb}
						isDisabled={isStreaming || isSavingVersion}
						aria-label="保存当前版本到数据库"
					>
						{isSavingVersion ? (
							<BookmarkCheck className="w-3.5 h-3.5 mr-1 text-emerald-500 animate-pulse" />
						) : (
							<Save className="w-3.5 h-3.5 mr-1" />
						)}
						<span>保存版本</span>
					</Button>
				)}

				{onSaveAsNewDocument && (
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs text-muted hover:text-foreground cursor-pointer px-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
						onPress={onSaveAsNewDocument}
						isDisabled={isStreaming || !canSaveAsNew}
						aria-label={
							!canSaveAsNew ? "右侧内容为空，无法另存" : "将右侧另存为新文档"
						}
					>
						<FilePlus className="w-3.5 h-3.5 mr-1" />
						<span>另存为新文档</span>
					</Button>
				)}

				<Button
					variant="ghost"
					size="sm"
					className="h-7 text-xs text-muted hover:text-foreground cursor-pointer px-2.5"
					onPress={onCancel}
				>
					<X className="w-3.5 h-3.5 mr-1" />
					<span>退出创作</span>
				</Button>

				<Button
					variant="primary"
					size="sm"
					className={`h-7 text-xs font-medium text-white shadow-xs px-3.5 rounded-lg transition-all ${
						!canAccept || isStreaming
							? "bg-emerald-600/40 cursor-not-allowed opacity-50 shadow-none"
							: "bg-emerald-600 hover:bg-emerald-700 cursor-pointer active:scale-95"
					}`}
					onPress={onAccept}
					isDisabled={isStreaming || !canAccept}
					aria-label={
						!canAccept
							? "右侧内容与正文一致或为空，无需采纳"
							: "采纳右侧内容覆盖正文"
					}
				>
					<Check className="w-3.5 h-3.5 mr-1 stroke-[2.5]" />
					<span>采纳右侧至正文</span>
				</Button>
			</div>
		</header>
	);
}
