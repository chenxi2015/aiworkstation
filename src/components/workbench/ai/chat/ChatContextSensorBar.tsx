import {
	Brush,
	Check,
	FileCode,
	FileText,
	LayoutGrid,
	Plus,
	Sparkles,
	X,
} from "lucide-react";
import { memo } from "react";
import type { ActiveChatScope } from "./chatScopeTypes";

export interface ChatContextSensorBarProps {
	/** Active environment scope detected from current view/document */
	scope: ActiveChatScope;
	/** Whether this item is already attached in the current chat input attachments */
	isAlreadyAttached?: boolean;
	/** Callback to attach the current scope item into the input context */
	onAttach: () => void;
	/** Callback to directly trigger a summarization prompt for this document */
	onSummarize: () => void;
	/** Optional callback to temporarily dismiss this sensor bar */
	onDismiss?: () => void;
	className?: string;
}

/**
 * Determine suitable icon for the detected document scope.
 */
function getScopeIcon(scope: ActiveChatScope) {
	if (scope.type === "note") {
		const path = (scope.notePath || "").toLowerCase();
		if (path.endsWith(".canvas")) {
			return LayoutGrid;
		}
		if (path.endsWith(".excalidraw")) {
			return Brush;
		}
		return FileText;
	}
	if (scope.type === "document") {
		return FileCode;
	}
	return FileText;
}

/**
 * Ambient Context Sensor Bar (inspired by Cursor/Copilot/Perplexity).
 * Passively senses the active document/note in view without forcefully hijacking
 * the chat input area. Provides one-click "Summarize" or "Attach to Chat" actions.
 */
export const ChatContextSensorBar = memo(function ChatContextSensorBar({
	scope,
	isAlreadyAttached = false,
	onAttach,
	onSummarize,
	onDismiss,
	className = "",
}: ChatContextSensorBarProps) {
	const IconComponent = scope.icon || getScopeIcon(scope);

	return (
		<div
			className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border border-border/70 bg-surface/90 hover:bg-surface backdrop-blur-md shadow-2xs transition-all text-xs text-foreground/80 ${className}`}
		>
			{/* Left: Document Icon & Title */}
			<div className="flex items-center gap-2 min-w-0 flex-1">
				<IconComponent className="w-3.5 h-3.5 shrink-0 text-primary/80" />
				<span
					className="truncate font-medium text-foreground/90 max-w-[150px] sm:max-w-[200px]"
					title={scope.notePath || scope.name}
				>
					{scope.name}
				</span>
			</div>

			{/* Right: Actions Group */}
			<div className="flex items-center gap-1 shrink-0">
				{/* Summarize Action Button */}
				<button
					type="button"
					onClick={onSummarize}
					className="flex items-center gap-1 px-2 py-0.5 rounded-md font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-500/10 transition-colors"
					title="一键总结此文档"
				>
					<Sparkles className="w-3 h-3" />
					<span>总结</span>
				</button>

				{/* Divider */}
				<div className="h-3 w-[1px] bg-border/80 mx-0.5" />

				{/* Attach to Chat Button */}
				<button
					type="button"
					disabled={isAlreadyAttached}
					onClick={onAttach}
					className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-medium transition-colors ${
						isAlreadyAttached
							? "text-muted-foreground/60 cursor-default"
							: "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-500/10"
					}`}
					title={isAlreadyAttached ? "已加入对话上下文" : "将此文档加入当前提问上下文"}
				>
					{isAlreadyAttached ? (
						<>
							<Check className="w-3 h-3" />
							<span>已加入</span>
						</>
					) : (
						<>
							<Plus className="w-3 h-3" />
							<span>加入对话</span>
						</>
					)}
				</button>

				{/* Optional Dismiss button */}
				{onDismiss && (
					<button
						type="button"
						onClick={onDismiss}
						className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 transition-colors ml-0.5"
						title="忽略感应"
					>
						<X className="w-3 h-3" />
					</button>
				)}
			</div>
		</div>
	);
});

