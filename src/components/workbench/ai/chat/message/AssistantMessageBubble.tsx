import { Sparkles } from "lucide-react";
import { memo } from "react";
import type { ChatItem } from "../../../../../hooks/ai/useAiChat";
import type { ChatDraftPayload } from "../../../../../hooks/ai/useChatMessages";
import type { PageBridge } from "../../../../../types/pageBridge";
import type { Category, Folder, SearchResultItem } from "../../../types";
import { AiMarkdownRenderer } from "../../shared/AiMarkdownRenderer";
import { AgentStepTimeline } from "../AgentStepTimeline";
import { DraftDeliveryCard } from "../draft/DraftDeliveryCard";
import { ArtifactCardList } from "./ArtifactCardList";
import { AssistantActionBar } from "./AssistantActionBar";
import { AssistantThinkingIndicator } from "./AssistantThinkingIndicator";
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
	onDraftStatusChange?: (updated: ChatDraftPayload) => void;
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
	onDraftStatusChange,
}: AssistantMessageBubbleProps) {
	const currentReferences = msg.references || [];
	const isActivelyStreaming = Boolean(msg.isStreaming);
	const hasContent = Boolean(
		msg.content ||
			(msg.parts && msg.parts.length > 0) ||
			(msg.steps && msg.steps.length > 0),
	);
	const hasRunningStep = Boolean(
		msg.steps?.some((s) => s.status === "running") ||
			msg.parts?.some(
				(p) =>
					p.type === "step_group" &&
					p.steps.some((s) => s.status === "running"),
			),
	);

	return (
		<div className="w-full flex flex-col gap-1.5 group relative pt-1 my-2">
			{/* Assistant brand header */}
			<div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 select-none pb-0.5">
				<span className="w-4 h-4 rounded-full bg-gradient-to-tr from-violet-500 via-indigo-500 to-fuchsia-500 flex items-center justify-center text-white shrink-0 shadow-2xs">
					<Sparkles className="w-2.5 h-2.5" />
				</span>
				<span>AI 助手</span>
				{msg.timestamp && (
					<span className="text-[10.5px] text-neutral-400 font-normal">
						· {msg.timestamp}
					</span>
				)}
			</div>

			{/* Interleaved message parts (flowing text and step groups in real-time execution order) */}
			{msg.parts && msg.parts.length > 0 ? (
				<div className="space-y-2">
					{msg.parts.map((part, partIndex) => {
						if (part.type === "step_group") {
							const groupKey = part.steps[0]?.id
								? `step-group-${partIndex}-${part.steps[0].id}`
								: `step-group-${msg.timestamp || "stream"}-${partIndex}`;
							return (
								<div key={groupKey} className="my-1.5">
									<AgentStepTimeline
										steps={part.steps}
										isStreaming={
											Boolean(msg.isStreaming) &&
											partIndex === (msg.parts?.length ?? 0) - 1
										}
									/>
								</div>
							);
						}
						if (part.type === "text" && part.text) {
							const textKey = `text-${msg.timestamp || "stream"}-${partIndex}`;
							return (
								<div key={textKey} className="text-foreground leading-relaxed">
									<AiMarkdownRenderer
										content={part.text}
										compact={false}
										folders={folders}
										onNavigateToFolder={onNavigateToFolder}
									/>
								</div>
							);
						}
						return null;
					})}
				</div>
			) : (
				/* Fallback for legacy messages or when parts are not populated */
				<>
					{msg.steps && msg.steps.length > 0 && (
						<div className="mb-3">
							<AgentStepTimeline
								steps={msg.steps}
								isStreaming={msg.isStreaming}
							/>
						</div>
					)}

					{msg.content ? (
						<div className="text-foreground leading-relaxed">
							<AiMarkdownRenderer
								content={msg.content}
								compact={false}
								folders={folders}
								onNavigateToFolder={onNavigateToFolder}
							/>
						</div>
					) : null}
				</>
			)}

			{/* Active thinking or loading indicator during ongoing streaming execution */}
			{isActivelyStreaming && (
				<AssistantThinkingIndicator
					hasContent={hasContent}
					hasRunningStep={hasRunningStep}
				/>
			)}

			{/* Artifact result cards (headless creations) — prominent entry at message level */}
			{!msg.isStreaming && <ArtifactCardList steps={msg.steps} />}

			{/* Draft delivery card — shown after streaming completes, as part of assistant reply */}
			{!msg.isStreaming && msg.draft && (
				<DraftDeliveryCard
					draft={msg.draft}
					onDraftStatusChange={onDraftStatusChange}
				/>
			)}

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
