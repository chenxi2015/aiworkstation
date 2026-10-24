import { Button } from "@heroui/react";
import {
	Eye,
	FileText,
	LayoutGrid,
	Loader2,
	NotebookPen,
	Palette,
	Trash2,
} from "lucide-react";
import { memo } from "react";
import type { ChatDraftPayload } from "../../../../../hooks/ai/useChatMessages";
import { getDraftKindMeta } from "./draftMeta";

export interface DraftPendingCardProps {
	draft: ChatDraftPayload;
	actionLoading: boolean;
	onOpenPreview: () => void;
	onSaveAsDocument: () => void;
	onOpenFolderPicker: () => void;
	onDiscard: () => void;
}

/**
 * Modern AI agent style interactive delivery card for pending drafts.
 */
export const DraftPendingCard = memo(function DraftPendingCard({
	draft,
	actionLoading,
	onOpenPreview,
	onSaveAsDocument,
	onOpenFolderPicker,
	onDiscard,
}: DraftPendingCardProps) {
	const meta = getDraftKindMeta(draft);

	return (
		<div className="w-full rounded-xl border border-border/70 bg-surface/70 dark:bg-surface-secondary/30 backdrop-blur-xs p-3.5 space-y-3 shadow-xs hover:border-border transition-all">
			{/* Top header row */}
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2.5 min-w-0">
					<div
						className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.iconBgClass} ${meta.iconColorClass}`}
					>
						<meta.icon className="w-4 h-4" />
					</div>
					<div className="min-w-0">
						<p className="text-xs font-semibold text-foreground truncate">
							{meta.displayTitle}
						</p>
						<p className="text-[11px] text-muted flex items-center gap-1.5 mt-0.5">
							<span>{meta.summaryDesc}</span>
							<span>·</span>
							<span className="text-muted/80">暂存草稿区</span>
						</p>
					</div>
				</div>

				{/* Agent deliverable status pill */}
				<div className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-[10px] font-medium">
					<span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
					<span>待选落点</span>
				</div>
			</div>

			{/* Action toolbar */}
			<div className="flex items-center flex-wrap gap-2 pt-0.5">
				<Button
					size="sm"
					variant="secondary"
					className="h-7.5 px-3 text-xs font-medium rounded-lg bg-surface-secondary/60 hover:bg-surface-secondary text-foreground border border-border/50 cursor-pointer transition-colors"
					onPress={onOpenPreview}
					isDisabled={actionLoading}
				>
					<Eye className="w-3.5 h-3.5 text-muted" />
					预览
				</Button>

				{meta.isArticle && (
					<Button
						size="sm"
						className="h-7.5 px-3 text-xs font-semibold rounded-lg bg-accent text-white hover:opacity-90 cursor-pointer shadow-xs transition-opacity"
						onPress={onSaveAsDocument}
						isDisabled={actionLoading}
					>
						{actionLoading ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<FileText className="w-3.5 h-3.5" />
						)}
						存为创作文档
					</Button>
				)}

				<Button
					size="sm"
					variant={meta.isArticle ? "secondary" : "primary"}
					className={`h-7.5 px-3 text-xs font-semibold rounded-lg cursor-pointer transition-all ${
						meta.isArticle
							? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20"
							: "bg-accent text-white hover:opacity-90 shadow-xs"
					}`}
					onPress={onOpenFolderPicker}
					isDisabled={actionLoading}
				>
					{actionLoading ? (
						<Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
					) : meta.isJsonKind ? (
						draft.kind === "excalidraw" ? (
							<Palette className="w-3.5 h-3.5" />
						) : (
							<LayoutGrid className="w-3.5 h-3.5" />
						)
					) : (
						<NotebookPen className="w-3.5 h-3.5" />
					)}
					{draft.kind === "excalidraw"
						? "存为画板"
						: draft.kind === "canvas"
							? "存为白板"
							: "存为笔记"}
				</Button>

				<Button
					size="sm"
					variant="ghost"
					className="h-7.5 px-2 text-xs rounded-lg text-muted hover:text-danger hover:bg-danger/10 cursor-pointer ml-auto transition-colors"
					onPress={onDiscard}
					isDisabled={actionLoading}
				>
					<Trash2 className="w-3.5 h-3.5" />
					丢弃
				</Button>
			</div>
		</div>
	);
});
