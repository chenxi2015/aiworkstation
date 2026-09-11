import { Check } from "lucide-react";
import { memo } from "react";
import type { ChatItem } from "../../../../hooks/ai/useAiChat";
import type { PageBridge } from "../../../../types/pageBridge";
import type { Category, Folder, SearchResultItem } from "../../types";
import { UrlLinkifiedText } from "../shared/UrlLinkifiedText";
import { AssistantMessageBubble } from "./message/AssistantMessageBubble";
import { UserMessageBubble } from "./message/UserMessageBubble";

export interface ChatMessageItemProps {
	msg: ChatItem;
	index: number;
	isLoading: boolean;
	/** Module-specific page bridge providing contextual callback actions */
	pageBridge?: PageBridge | null;
	isSelectMode?: boolean;
	isSelected?: boolean;
	onToggleSelect?: (index: number) => void;
	onStartSelectDelete?: (index: number) => void;
	selectedRefKeys: Set<string | number>;
	onEditAndResend: (index: number, newContent: string) => void;
	onEditOnly: (index: number, newContent: string) => void;
	onResend: (index: number) => void;
	onDelete: (index: number) => void;
	onToggleRefCheck: (refKey: string | number) => void;
	onToggleSelectGroup?: (items: SearchResultItem[]) => void;
	onOpenAssignSingle: (item: SearchResultItem, e?: React.MouseEvent) => void;
	onOpenAssignMultiple: (
		items: SearchResultItem[],
		createMode?: boolean,
	) => void;
	folders?: Folder[];
	onNavigateToFolder?: (
		folderId: number | null,
		category?: Category,
		targetItemId?: string | number,
	) => void;
}

/**
 * Lightweight message item dispatcher.
 * Delegates rendering to specialized sub-components based on role and selection state.
 */
export const ChatMessageItem = memo(function ChatMessageItem({
	msg,
	index,
	isLoading,
	pageBridge,
	isSelectMode = false,
	isSelected = false,
	onToggleSelect,
	onStartSelectDelete,
	selectedRefKeys,
	onEditAndResend,
	onResend,
	onDelete,
	onToggleRefCheck,
	onToggleSelectGroup,
	onOpenAssignSingle,
	onOpenAssignMultiple,
	folders,
	onNavigateToFolder,
}: ChatMessageItemProps) {
	// 1. Bulk selection deletion mode item
	if (isSelectMode) {
		const refCount = msg.references?.length ?? 0;
		return (
			<button
				type="button"
				onClick={() => onToggleSelect?.(index)}
				className={`w-full flex items-start gap-3 p-3 rounded-2xl border transition-all cursor-pointer select-none text-left ${
					isSelected
						? "bg-accent-soft/30 border-accent/60 shadow-xs"
						: "bg-surface/80 border-border/70 hover:bg-surface-secondary/60 hover:border-border"
				}`}
			>
				<div className="pt-0.5 shrink-0">
					<div
						className={`w-4 h-4 rounded-[4px] flex items-center justify-center transition-colors ${
							isSelected
								? "bg-accent text-accent-foreground"
								: "border border-border/90 bg-surface hover:border-accent/60"
						}`}
					>
						{isSelected && <Check className="w-3 h-3 stroke-[3]" />}
					</div>
				</div>

				<div className="flex-1 min-w-0 flex flex-col gap-1">
					<div className="flex items-center gap-1.5 text-[10px] text-muted">
						<span className="font-medium">
							{msg.role === "user" ? "你" : "AI 助手"}
						</span>
						{msg.timestamp && <span>· {msg.timestamp}</span>}
					</div>

					<div className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
						<UrlLinkifiedText text={msg.content} />
					</div>

					{refCount > 0 && (
						<div className="text-[10px] text-muted">
							（包含 {refCount} 个书签参考）
						</div>
					)}
				</div>
			</button>
		);
	}

	// 2. User message bubble
	if (msg.role === "user") {
		return (
			<UserMessageBubble
				msg={msg}
				index={index}
				isLoading={isLoading}
				onEditAndResend={onEditAndResend}
				onDelete={onDelete}
				onStartSelectDelete={onStartSelectDelete}
				onNavigateToFolder={onNavigateToFolder}
			/>
		);
	}

	// 3. Assistant response bubble
	return (
		<AssistantMessageBubble
			msg={msg}
			index={index}
			isLoading={isLoading}
			pageBridge={pageBridge}
			folders={folders}
			selectedRefKeys={selectedRefKeys}
			onResend={onResend}
			onDelete={onDelete}
			onStartSelectDelete={onStartSelectDelete}
			onToggleRefCheck={onToggleRefCheck}
			onToggleSelectGroup={onToggleSelectGroup}
			onOpenAssignSingle={onOpenAssignSingle}
			onOpenAssignMultiple={onOpenAssignMultiple}
			onNavigateToFolder={onNavigateToFolder}
		/>
	);
});
