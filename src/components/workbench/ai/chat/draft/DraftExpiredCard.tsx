import { Clock } from "lucide-react";
import { memo } from "react";
import type { ChatDraftPayload } from "../../../../../hooks/ai/useChatMessages";

export interface DraftExpiredCardProps {
	draft: ChatDraftPayload;
}

/**
 * Inert card rendered when a draft has expired or has been discarded.
 */
export const DraftExpiredCard = memo(function DraftExpiredCard({
	draft,
}: DraftExpiredCardProps) {
	return (
		<div className="flex justify-start my-1.5 w-full">
			<div className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border/40 bg-surface/30 dark:bg-surface/20 text-muted opacity-70">
				<Clock className="w-3.5 h-3.5 shrink-0 text-muted" />
				<span className="text-xs font-medium line-through truncate max-w-[240px]">
					{draft.title}
				</span>
				<span className="text-[11px] text-muted shrink-0">
					（草稿已过期或已丢弃）
				</span>
			</div>
		</div>
	);
});

