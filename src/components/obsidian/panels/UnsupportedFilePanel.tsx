import { ChevronLeft, ChevronRight, ExternalLink, FileQuestion } from "lucide-react";
import { openVaultEntryRpc } from "../../../services/api/obsidianClient";

export interface UnsupportedFilePanelProps {
	relPath: string;
	canGoBack?: boolean;
	canGoForward?: boolean;
	onBack?: () => void;
	onForward?: () => void;
}

/** Fallback panel for file types that cannot be rendered in-app; provides a button to open in OS app */
export function UnsupportedFilePanel({
	relPath,
	canGoBack,
	canGoForward,
	onBack,
	onForward,
}: UnsupportedFilePanelProps) {
	const fileName = relPath.split("/").pop() ?? relPath;
	return (
		<div className="h-full flex flex-col overflow-hidden">
			<div className="flex items-center gap-1 px-2 py-1.5 border-b border-border shrink-0">
				<button
					type="button"
					aria-label="返回"
					onClick={onBack}
					disabled={!canGoBack}
					className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors disabled:opacity-30 disabled:pointer-events-none"
				>
					<ChevronLeft className="w-4 h-4" />
				</button>
				<button
					type="button"
					aria-label="前进"
					onClick={onForward}
					disabled={!canGoForward}
					className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors disabled:opacity-30 disabled:pointer-events-none"
				>
					<ChevronRight className="w-4 h-4" />
				</button>
			</div>
			<div className="flex-1 flex flex-col items-center justify-center text-center px-8">
				<FileQuestion className="w-8 h-8 text-muted mb-3" />
				<p className="text-sm text-foreground/80">{fileName}</p>
				<p className="mt-1 text-xs text-muted">暂不支持在应用内预览该类型</p>
				<button
					type="button"
					onClick={() => void openVaultEntryRpc(relPath)}
					className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-foreground/80 hover:bg-surface-secondary/60 transition-colors"
				>
					<ExternalLink className="w-3.5 h-3.5" />
					在系统应用中打开
				</button>
			</div>
		</div>
	);
}
