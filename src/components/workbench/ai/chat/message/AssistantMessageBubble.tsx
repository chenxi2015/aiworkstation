import { Sparkles } from "lucide-react";
import { memo } from "react";
import type { ChatItem } from "../../../../../hooks/ai/useAiChat";
import type { PageBridge } from "../../../../../types/pageBridge";
import type { Category, Folder, SearchResultItem } from "../../../types";
import { AiMarkdownRenderer } from "../../shared/AiMarkdownRenderer";
import { AgentStepTimeline } from "../AgentStepTimeline";
import { AssistantActionBar } from "./AssistantActionBar";
import { MessageReferencesPanel } from "./MessageReferencesPanel";

export interface AssistantMessageBubbleProps {
	msg: ChatItem;
	index: number;
	isLoading: boolean;
	pageBridge?: PageBridge | null;
	folders?: Folder[];
	selectedRefKeys: Set<string | number>;
	onResend: (index: number) => void;
	onDelete: (index: number) => void;
	onStartSelectDelete?: (index: number) => void;
	onToggleRefCheck: (refKey: string | number) => void;
	onToggleSelectGroup?: (items: SearchResultItem[]) => void;
	onOpenAssignSingle: (item: SearchResultItem, e?: React.MouseEvent) => void;
	onOpenAssignMultiple: (
		items: SearchResultItem[],
		createMode?: boolean,
	) => void;
	onNavigateToFolder?: (
		folderId: number | null,
		category?: Category,
		targetItemId?: string | number,
	) => void;
}

/**
 * Assistant message bubble rendering AI response, process steps timeline,
 * action toolbar, and matched reference cards
 */
export const AssistantMessageBubble = memo(function AssistantMessageBubble({
	msg,
	index,
	isLoading,
	pageBridge,
	folders,
	selectedRefKeys,
	onResend,
	onDelete,
	onStartSelectDelete,
	onToggleRefCheck,
	onToggleSelectGroup,
	onOpenAssignSingle,
	onOpenAssignMultiple,
	onNavigateToFolder,
}: AssistantMessageBubbleProps) {
	const currentReferences = msg.references || [];

	return (
		<div className="w-full flex flex-col gap-1.5 group relative pt-1 pb-4 my-2">
			{/* Assistant brand header */}
			<div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 select-none pb-0.5">
				<div className="w-4 h-4 rounded-full bg-gradient-to-tr from-accent to-primary flex items-center justify-center text-white text-[9px] shadow-2xs shrink-0">
					<Sparkles className="w-2.5 h-2.5 text-white" />
				</div>
				<span>AI 助手</span>
				{msg.timestamp && (
					<span className="text-[10.5px] text-neutral-400 font-normal">
						· {msg.timestamp}
					</span>
				)}
			</div>

			{/* Inline reasoning & tool process timeline */}
			{msg.steps && msg.steps.length > 0 && (
				<div className="mb-3">
					<AgentStepTimeline steps={msg.steps} isStreaming={msg.isStreaming} />
				</div>
			)}

			{/* Main markdown response body flowing freely without card borders */}
			{msg.content ? (
				<div className="text-foreground leading-relaxed">
					<AiMarkdownRenderer
						content={msg.content}
						compact={false}
						folders={folders}
						onNavigateToFolder={onNavigateToFolder}
					/>
				</div>
			) : msg.isStreaming && (!msg.steps || msg.steps.length === 0) ? (
				/* Only show initial planning status if no steps timeline is present yet */
				<div className="flex items-center gap-2 text-muted py-2">
					<span className="inline-block w-2 h-2 rounded-full bg-accent animate-ping" />
					<span className="text-xs">Agent 正在思考规划...</span>
				</div>
			) : null}

			{/* Bottom Action Bar (Modular page actions, copy, regenerate, delete) */}
			{!msg.isStreaming && (
				<AssistantActionBar
					content={msg.content}
					index={index}
					isLoading={isLoading}
					pageBridge={pageBridge}
					onResend={onResend}
					onDelete={onDelete}
					onStartSelectDelete={onStartSelectDelete}
				/>
			)}

			{/* Collapsible references panel */}
			{!msg.isStreaming && currentReferences.length > 0 && (
				<MessageReferencesPanel
					references={currentReferences}
					selectedRefKeys={selectedRefKeys}
					onToggleRefCheck={onToggleRefCheck}
					onToggleSelectGroup={onToggleSelectGroup}
					onOpenAssignSingle={onOpenAssignSingle}
					onOpenAssignMultiple={onOpenAssignMultiple}
					onNavigateToFolder={onNavigateToFolder}
				/>
			)}
		</div>
	);
});
