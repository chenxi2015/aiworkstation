import { ArrowDownToLine, CheckCircle2, Copy, Loader2 } from "lucide-react";
import type { ActionState, AiBarAction } from "./types";

export interface AiResultPanelProps {
	state: ActionState;
	result: string;
	activeAction: AiBarAction | null;
	onReplace: () => void;
	onInsertAfter: () => void;
	onCopy: () => void;
	onClose: () => void;
}

/**
 * Loading indicator and result feedback panel for AI actions
 */
export function AiResultPanel({
	state,
	result,
	activeAction,
	onReplace,
	onInsertAfter,
	onCopy,
	onClose,
}: AiResultPanelProps) {
	if (state === "loading") {
		return (
			<div className="flex items-center gap-2.5 px-3 py-2 text-muted min-w-[240px]">
				<Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
				<span className="text-foreground font-medium text-xs">
					正在{activeAction?.label || "处理"}中…
				</span>
				<button
					type="button"
					onClick={onClose}
					className="ml-auto text-xs text-muted hover:text-foreground cursor-pointer px-2 py-0.5 rounded hover:bg-muted/15 transition-colors"
				>
					取消
				</button>
			</div>
		);
	}

	if (state === "result" || state === "error") {
		return (
			<div className="min-w-[340px] max-w-[520px]">
				<div
					className={`px-3.5 py-2.5 max-h-52 overflow-y-auto whitespace-pre-wrap leading-relaxed ${
						state === "error"
							? "text-danger text-xs font-medium"
							: "text-foreground text-xs bg-muted/5"
					}`}
				>
					{result}
				</div>
				<div className="flex items-center gap-1.5 px-3 py-2 border-t border-border/80 bg-surface">
					{state === "result" && (
						<>
							<button
								type="button"
								onClick={onReplace}
								className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent text-accent-foreground text-[11px] font-medium hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
							>
								<CheckCircle2 className="w-3.5 h-3.5" />
								替换选区
							</button>
							<button
								type="button"
								onClick={onInsertAfter}
								className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-muted hover:text-foreground hover:bg-muted/15 transition-colors cursor-pointer border border-border/60"
							>
								<ArrowDownToLine className="w-3.5 h-3.5" />
								插入下方
							</button>
							<button
								type="button"
								onClick={onCopy}
								className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-muted hover:text-foreground hover:bg-muted/15 transition-colors cursor-pointer"
							>
								<Copy className="w-3.5 h-3.5" />
								复制
							</button>
						</>
					)}
					<button
						type="button"
						onClick={onClose}
						className="ml-auto px-2 py-1 text-[11px] text-muted hover:text-foreground cursor-pointer rounded hover:bg-muted/15 transition-colors"
					>
						关闭
					</button>
				</div>
			</div>
		);
	}

	return null;
}
