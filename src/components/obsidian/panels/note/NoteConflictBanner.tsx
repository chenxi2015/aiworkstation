import { AlertTriangle } from "lucide-react";

export interface NoteConflictBannerProps {
	isSaving: boolean;
	onReload: () => void;
	onForceOverwrite: () => void;
}

/** Warning banner displayed when external file modifications conflict with local edits and cannot be auto-merged */
export function NoteConflictBanner({
	isSaving,
	onReload,
	onForceOverwrite,
}: NoteConflictBannerProps) {
	return (
		<div className="flex items-center gap-3 px-4 py-2.5 bg-warning/10 border-b border-warning/30 shrink-0">
			<AlertTriangle className="w-4 h-4 text-warning shrink-0" />
			<p className="text-[11px] text-foreground/80 flex-1">
				笔记在 Obsidian
				侧的修改与本地编辑交叠，无法自动合并：重新加载会放弃当前编辑，强制覆盖会用当前编辑覆盖对方改动。
			</p>
			<button
				type="button"
				onClick={onReload}
				className="px-2.5 py-1 rounded-lg border border-border text-[11px] text-foreground/80 hover:bg-surface-secondary/60 shrink-0"
			>
				重新加载
			</button>
			<button
				type="button"
				onClick={onForceOverwrite}
				disabled={isSaving}
				className="px-2.5 py-1 rounded-lg bg-warning text-white text-[11px] font-medium hover:opacity-90 disabled:opacity-40 shrink-0"
			>
				强制覆盖
			</button>
		</div>
	);
}
