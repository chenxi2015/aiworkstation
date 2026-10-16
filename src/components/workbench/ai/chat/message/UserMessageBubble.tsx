import { Tooltip, toast } from "@heroui/react";
import { Check, Copy, Pencil, Sparkles, Trash2 } from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { ChatItem } from "../../../../../hooks/ai/useAiChat";
import type { Category } from "../../../types";
import { UrlLinkifiedText } from "../../shared/UrlLinkifiedText";
import { ChatContextBar } from "../ChatContextBar";
import { MessageEditInlineInput } from "../inline/MessageEditInlineInput";

/** Parses any legacy split practice prefix and duplicate skill headers from raw content */
function parseSplitMessageContent(content: string): {
	splitBadge: string | null;
	cleanContent: string;
} {
	if (!content) return { splitBadge: null, cleanContent: "" };

	let text = content;
	let splitBadge: string | null = null;

	// 1. Detect legacy 【双栏演练 · xxx】 prefix
	const splitMatch = text.match(/^\s*【双栏演练(?:\s*·\s*([^】]+))?】\s*/);
	if (splitMatch) {
		let label = (splitMatch[1] || "").trim();
		// Clean up any incomplete or broken skill tag inside label, e.g. [Skill: ai
		label = label
			.replace(/\[Skill:\s*/i, "")
			.replace(/[\]]/g, "")
			.trim();
		splitBadge = label ? `双栏演练 · ${label}` : "双栏演练";
		text = text.slice(splitMatch[0].length).trim();
	}

	// 2. Remove redundant standalone skill header lines if text already has the same inline token
	const duplicateSkillMatch = text.match(
		/^\[Skill:\s*([^\]]+)\]\s*\n+([\s\S]*)$/i,
	);
	if (duplicateSkillMatch) {
		const skillName = duplicateSkillMatch[1].trim().toLowerCase();
		const rest = duplicateSkillMatch[2].trim();
		if (rest.toLowerCase().includes(`[skill: ${skillName}]`)) {
			text = rest;
		}
	}

	return { splitBadge, cleanContent: text };
}

export interface UserMessageBubbleProps {
	msg: ChatItem;
	index: number;
	isLoading: boolean;
	onEditAndResend: (index: number, newContent: string) => void;
	onDelete: (index: number) => void;
	onStartSelectDelete?: (index: number) => void;
	onNavigateToFolder?: (
		folderId: number | null,
		category?: Category,
		targetItemId?: string | number,
	) => void;
}

/**
 * User message bubble rendering attachments chips, text, inline editing and hover actions
 */
export const UserMessageBubble = memo(function UserMessageBubble({
	msg,
	index,
	isLoading,
	onEditAndResend,
	onDelete,
	onStartSelectDelete,
	onNavigateToFolder,
}: UserMessageBubbleProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [copied, setCopied] = useState(false);

	const { splitBadge, cleanContent } = useMemo(
		() => parseSplitMessageContent(msg.content),
		[msg.content],
	);

	/** Filter out redundant skill chips if already present as inline token in message text */
	const displayContextItems = useMemo(() => {
		if (!msg.contextItems || msg.contextItems.length === 0) return [];
		const hasInlineSkill =
			msg.content && /\[Skill:\s*[^\]]+\]/i.test(msg.content);
		return msg.contextItems.filter((item) => {
			if ((item.type as string) === "skill" && hasInlineSkill) {
				return false;
			}
			return true;
		});
	}, [msg.contextItems, msg.content]);

	const handleCopy = () => {
		navigator.clipboard.writeText(cleanContent);
		setCopied(true);
		toast.success("已复制到剪贴板");
		setTimeout(() => setCopied(false), 2000);
	};

	const handleSave = (newContent: string) => {
		const trimmed = newContent.trim();
		if (!trimmed) return;
		setIsEditing(false);
		onEditAndResend(index, trimmed);
	};

	return (
		<div className="w-full flex flex-col items-end gap-1 group relative my-2">
			{/* Context attachments cards (复用 ChatContextBar，展示大圆角文件/图片卡片) */}
			{displayContextItems.length > 0 && (
				<div className="mb-0.5 max-w-[85%] sm:max-w-[75%]">
					<ChatContextBar
						items={displayContextItems}
						layout="wrap"
						align="right"
						onNavigateToFolder={onNavigateToFolder}
					/>
				</div>
			)}

			{isEditing ? (
				<MessageEditInlineInput
					initialContent={msg.content}
					onSave={handleSave}
					onCancel={() => setIsEditing(false)}
					isLoading={isLoading}
				/>
			) : (
				<div className="flex flex-col items-end gap-1 max-w-[85%] sm:max-w-[75%]">
					{/* Clean neutral rounded pill */}
					<div className="bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-2xl px-4 py-2 text-sm leading-relaxed font-normal shadow-2xs">
						{splitBadge &&
							!msg.contextItems?.some(
								(c) => (c.type as string) === "split_practice",
							) && (
								<div className="flex items-center gap-1.5 pb-1 mb-1 border-b border-border/50 text-[11px] font-medium text-accent select-none">
									<Sparkles className="w-3 h-3 text-accent shrink-0" />
									<span>{splitBadge}</span>
								</div>
							)}
						<div className="whitespace-pre-wrap leading-relaxed max-h-72 sm:max-h-80 overflow-y-auto">
							<UrlLinkifiedText text={cleanContent} />
						</div>
					</div>

					{/* Hover action toolbar */}
					<div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-0.5 text-muted text-xs px-1">
						<Tooltip>
							<Tooltip.Trigger>
								<button
									type="button"
									onClick={handleCopy}
									className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/80 transition-colors cursor-pointer"
									aria-label="复制"
								>
									{copied ? (
										<Check className="w-3.5 h-3.5 text-emerald-500" />
									) : (
										<Copy className="w-3.5 h-3.5" />
									)}
								</button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-[10px] py-0.5 px-1.5">
								{copied ? "已复制" : "复制"}
							</Tooltip.Content>
						</Tooltip>

						<Tooltip>
							<Tooltip.Trigger>
								<button
									type="button"
									onClick={() => setIsEditing(true)}
									className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/80 transition-colors cursor-pointer"
									aria-label="编辑"
								>
									<Pencil className="w-3.5 h-3.5" />
								</button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-[10px] py-0.5 px-1.5">
								编辑
							</Tooltip.Content>
						</Tooltip>

						<Tooltip>
							<Tooltip.Trigger>
								<button
									type="button"
									onClick={() =>
										onStartSelectDelete
											? onStartSelectDelete(index)
											: onDelete(index)
									}
									className="p-1 rounded-md text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
									aria-label="删除"
								>
									<Trash2 className="w-3.5 h-3.5" />
								</button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-[10px] py-0.5 px-1.5">
								删除
							</Tooltip.Content>
						</Tooltip>
					</div>
				</div>
			)}
		</div>
	);
});
