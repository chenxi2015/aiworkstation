import dayjs from "dayjs";
import { Loader2 } from "lucide-react";

export type NoteSaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export interface NoteStatusBarProps {
	charCount: number;
	hasConflict: boolean;
	saveState: NoteSaveState;
	savedAt: number | null;
	isTruncated?: boolean;
	onRetrySave: () => void;
}

/** Bottom status bar displaying character count, autosave states, and conflict alerts */
export function NoteStatusBar({
	charCount,
	hasConflict,
	saveState,
	savedAt,
	isTruncated,
	onRetrySave,
}: NoteStatusBarProps) {
	return (
		<div className="shrink-0 border-t border-border bg-surface px-4 py-1.5 flex items-center gap-2 text-[11px] text-muted">
			<span>{charCount} 字</span>
			<span className="flex-1" />
			{hasConflict ? (
				<span className="text-warning">检测到外部修改，自动保存已暂停</span>
			) : saveState === "dirty" ? (
				<span>未保存更改…</span>
			) : saveState === "saving" ? (
				<span className="flex items-center gap-1">
					<Loader2 className="w-3 h-3 animate-spin" />
					保存中…
				</span>
			) : saveState === "saved" ? (
				<span>
					已自动保存 {savedAt ? dayjs(savedAt).format("HH:mm:ss") : ""}
				</span>
			) : saveState === "error" ? (
				<button
					type="button"
					onClick={onRetrySave}
					className="text-danger hover:underline cursor-pointer"
				>
					保存失败，点击重试
				</button>
			) : isTruncated ? (
				<span>只读</span>
			) : (
				<span className="text-muted/50">自动保存</span>
			)}
		</div>
	);
}
