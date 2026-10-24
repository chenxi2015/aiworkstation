import { Button } from "@heroui/react";
import { Check, ChevronRight, ExternalLink } from "lucide-react";
import { memo } from "react";
import type { ChatDraftPayload } from "../../../../../hooks/ai/useChatMessages";
import { getDraftKindMeta } from "./draftMeta";

export interface DraftArchivedCardProps {
	draft: ChatDraftPayload;
	archivedTo?: {
		kind: "document" | "note";
		ref: string;
	};
	onNavigate: () => void;
}

/**
 * Inert card rendered when a draft has been successfully archived.
 */
export const DraftArchivedCard = memo(function DraftArchivedCard({
	draft,
	archivedTo,
	onNavigate,
}: DraftArchivedCardProps) {
	const meta = getDraftKindMeta(draft);
	const isDoc = archivedTo?.kind === "document";
	const openLabel = isDoc ? "打开文档" : `打开${meta.kindLabel}`;
	const archiveDesc = isDoc
		? "已归档至创作台文档"
		: `已存入 Obsidian ${meta.kindLabel}：${archivedTo?.ref ?? ""}`;

	return (
		<div className="flex justify-start my-1.5 w-full">
			<div className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10 p-2.5 sm:p-3 flex items-center justify-between gap-3 shadow-xs">
				<div className="flex items-center gap-2.5 min-w-0">
					<div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
						<Check className="w-4 h-4" />
					</div>
					<div className="min-w-0">
						<p className="text-xs font-semibold text-foreground truncate">
							{meta.displayTitle}
						</p>
						<p className="text-[11px] text-muted truncate">{archiveDesc}</p>
					</div>
				</div>

				{Boolean(archivedTo?.ref) && (
					<Button
						size="sm"
						variant="secondary"
						className="h-7 px-2.5 text-xs rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 font-medium cursor-pointer shrink-0 transition-colors flex items-center gap-1"
						onPress={onNavigate}
					>
						<ExternalLink className="w-3 h-3" />
						<span>{openLabel}</span>
						<ChevronRight className="w-3 h-3 opacity-60" />
					</Button>
				)}
			</div>
		</div>
	);
});

