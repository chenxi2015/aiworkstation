import { Button, Tooltip, toast } from "@heroui/react";
import {
	ArrowUp,
	BookOpen,
	Check,
	CheckSquare,
	Copy,
	FolderInput,
	FolderPlus,
	Pencil,
	RotateCw,
	Square,
	Trash2,
	X,
} from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import type { ChatItem } from "../../../../hooks/ai/useAiChat";
import type { Category, SearchResultItem } from "../../types";
import { AiMarkdownRenderer } from "../shared/AiMarkdownRenderer";
import { ChatReferenceCard } from "./ChatReferenceCard";

export interface ChatMessageItemProps {
	msg: ChatItem;
	index: number;
	isLoading: boolean;
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
	onNavigateToFolder?: (folderId: number | null, category?: Category) => void;
}

/**
 * Single chat message item with inline hover actions, in-place editing, and selectable deletion
 */
export const ChatMessageItem = memo(function ChatMessageItem({
	msg,
	index,
	isLoading,
	isSelectMode = false,
	isSelected = false,
	onToggleSelect,
	onStartSelectDelete,
	selectedRefKeys,
	onEditAndResend,
	onEditOnly,
	onResend,
	onDelete,
	onToggleRefCheck,
	onToggleSelectGroup,
	onOpenAssignSingle,
	onOpenAssignMultiple,
	onNavigateToFolder,
}: ChatMessageItemProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [draftContent, setDraftContent] = useState(msg.content);
	const [copied, setCopied] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	// Synchronize draft when msg content updates externally
	useEffect(() => {
		setDraftContent(msg.content);
	}, [msg.content]);

	// Auto-focus and resize when entering edit mode
	useEffect(() => {
		if (isEditing && textareaRef.current) {
			textareaRef.current.focus();
			textareaRef.current.setSelectionRange(
				textareaRef.current.value.length,
				textareaRef.current.value.length,
			);
			textareaRef.current.style.height = "auto";
			textareaRef.current.style.height = `${Math.min(
				textareaRef.current.scrollHeight,
				140,
			)}px`;
		}
	}, [isEditing]);

	// Copy message content to clipboard
	const handleCopy = () => {
		navigator.clipboard.writeText(msg.content);
		setCopied(true);
		toast.success("已复制到剪贴板");
		setTimeout(() => setCopied(false), 2000);
	};

	// Save and submit edited message
	const handleSave = () => {
		const trimmed = draftContent.trim();
		if (!trimmed) return;
		setIsEditing(false);
		if (msg.role === "user") {
			onEditAndResend(index, trimmed);
		} else {
			onEditOnly(index, trimmed);
		}
	};

	// Cancel editing and restore original content
	const handleCancelEdit = () => {
		setDraftContent(msg.content);
		setIsEditing(false);
	};

	const currentReferences = msg.references || [];
	const selectedRefsInThisMsg = currentReferences.filter(
		(r: SearchResultItem) => selectedRefKeys.has(r.id || r.url || ""),
	);
	const isAllInMsgChecked =
		currentReferences.length > 0 &&
		currentReferences.every((r: SearchResultItem) =>
			selectedRefKeys.has(r.id || r.url || ""),
		);

	if (isSelectMode) {
		return (
			<div
				onClick={() => onToggleSelect?.(index)}
				className={`w-full flex items-start gap-3 p-3 rounded-2xl border transition-all cursor-pointer select-none ${
					isSelected
						? "bg-accent-soft/30 border-accent/60 shadow-xs"
						: "bg-surface/80 border-border/70 hover:bg-surface-secondary/60 hover:border-border"
				}`}
			>
				{/* Checkbox (like Figure 1) */}
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

				{/* Message Content & Info */}
				<div className="flex-1 min-w-0 flex flex-col gap-1">
					<div className="flex items-center gap-1.5 text-[10px] text-muted">
						<span className="font-medium">
							{msg.role === "user" ? "你" : "AI 助手"}
						</span>
						{msg.timestamp && <span>· {msg.timestamp}</span>}
					</div>

					<div className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
						{msg.content}
					</div>

					{currentReferences.length > 0 && (
						<div className="text-[10px] text-muted">
							（包含 {currentReferences.length} 个书签参考）
						</div>
					)}
				</div>
			</div>
		);
	}

	return (
		<div
			className={`flex flex-col gap-1 group relative ${
				msg.role === "user" ? "items-end" : "items-start"
			}`}
		>
			{/* Sender Info & Timestamp */}
			<div className="flex items-center gap-1.5 text-[10px] text-muted px-1">
				<span className="font-medium">
					{msg.role === "user" ? "你" : "AI 助手"}
				</span>
				{msg.timestamp && <span>· {msg.timestamp}</span>}
			</div>

			{/* Inline Edit View or Bubble Display View */}
			{isEditing ? (
				<div className="w-full flex items-center gap-1.5 my-1">
					{/* Cancel Button */}
					<Tooltip>
						<Tooltip.Trigger>
							<button
								type="button"
								onClick={handleCancelEdit}
								className="p-1 text-muted hover:text-foreground hover:bg-surface-secondary/80 rounded-md transition-colors cursor-pointer shrink-0"
								aria-label="取消编辑"
							>
								<X className="w-4 h-4" />
							</button>
						</Tooltip.Trigger>
						<Tooltip.Content className="text-[10px] py-0.5 px-1.5">
							取消 (Esc)
						</Tooltip.Content>
					</Tooltip>

					{/* Edit Textarea with Blue Accent Border */}
					<textarea
						ref={textareaRef}
						rows={1}
						value={draftContent}
						onChange={(e) => {
							setDraftContent(e.target.value);
							e.target.style.height = "auto";
							e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								handleSave();
							} else if (e.key === "Escape") {
								e.preventDefault();
								handleCancelEdit();
							}
						}}
						placeholder="编辑内容..."
						className="flex-1 min-w-0 bg-surface border-2 border-accent rounded-xl px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none resize-none leading-relaxed shadow-xs max-h-36 transition-all"
					/>

					{/* Send / Save Button */}
					<Tooltip>
						<Tooltip.Trigger>
							<button
								type="button"
								onClick={handleSave}
								disabled={!draftContent.trim() || isLoading}
								className="w-7 h-7 rounded-full bg-accent hover:bg-accent/90 disabled:opacity-50 text-accent-foreground flex items-center justify-center shrink-0 shadow-xs cursor-pointer transition-all"
								aria-label="保存并发送"
							>
								<ArrowUp className="w-4 h-4" />
							</button>
						</Tooltip.Trigger>
						<Tooltip.Content className="text-[10px] py-0.5 px-1.5">
							{msg.role === "user"
								? "保存并重新提问 (Enter)"
								: "保存修改 (Enter)"}
						</Tooltip.Content>
					</Tooltip>
				</div>
			) : (
				<>
					{/* Message Bubble */}
					<div
						className={`p-3 rounded-2xl max-w-full leading-relaxed text-xs shadow-2xs ${
							msg.role === "user"
								? "bg-accent text-accent-foreground rounded-tr-xs shadow-xs font-normal"
								: "bg-surface border border-border text-foreground rounded-tl-xs"
						}`}
					>
						{msg.role === "user" ? (
							<div className="whitespace-pre-wrap leading-relaxed text-xs">
								{msg.content}
							</div>
						) : (
							<AiMarkdownRenderer content={msg.content} compact={true} />
						)}
					</div>

					{/* Hover Action Toolbar: Copy, Edit, Resend, Delete */}
					<div
						className={`opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-0.5 text-muted text-xs mt-0.5 px-1 ${
							msg.role === "user" ? "justify-end" : "justify-start"
						}`}
					>
						{/* Copy */}
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

						{/* Edit */}
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

						{/* Resend / Regenerate */}
						<Tooltip>
							<Tooltip.Trigger>
								<button
									type="button"
									onClick={() => onResend(index)}
									disabled={isLoading}
									className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/80 disabled:opacity-40 transition-colors cursor-pointer"
									aria-label={msg.role === "user" ? "重新发送" : "重新生成"}
								>
									<RotateCw className="w-3.5 h-3.5" />
								</button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-[10px] py-0.5 px-1.5">
								{msg.role === "user" ? "重新发送" : "重新生成"}
							</Tooltip.Content>
						</Tooltip>

						{/* Delete - triggers multi-selection delete mode */}
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
				</>
			)}

			{/* References / Search Results Cards */}
			{currentReferences.length > 0 && (
				<div className="mt-1.5 w-full flex flex-col gap-2 p-3 rounded-xl bg-surface/90 border border-border shadow-2xs">
					<div className="text-[11px] font-medium text-muted flex items-center justify-between">
						<span className="inline-flex items-center gap-1">
							<BookOpen className="w-3.5 h-3.5 text-accent" />
							<span>命中的网址列表 ({currentReferences.length})</span>
						</span>
						<div className="flex items-center gap-2">
							{selectedRefsInThisMsg.length > 0 && (
								<span className="text-[10px] text-accent font-medium">
									已选 {selectedRefsInThisMsg.length} 项
								</span>
							)}
							{onToggleSelectGroup && (
								<button
									type="button"
									onClick={() => onToggleSelectGroup(currentReferences)}
									className={`text-[10px] font-medium inline-flex items-center gap-1 cursor-pointer transition-colors px-1.5 py-0.5 rounded-md ${
										isAllInMsgChecked
											? "text-accent bg-accent-soft/50 hover:bg-accent-soft/80"
											: "text-muted hover:text-foreground hover:bg-surface-secondary"
									}`}
									aria-label={isAllInMsgChecked ? "取消全选" : "全选全部网址"}
								>
									{isAllInMsgChecked ? (
										<CheckSquare className="w-3 h-3 text-accent" />
									) : (
										<Square className="w-3 h-3 opacity-50 hover:opacity-80" />
									)}
									<span>{isAllInMsgChecked ? "取消全选" : "全选"}</span>
								</button>
							)}
						</div>
					</div>

					{/* Reference items list */}
					<div className="flex flex-col gap-1.5">
						{currentReferences.map((ref: SearchResultItem, rIdx: number) => {
							const refKey = ref.id || ref.url || rIdx;
							const isChecked = selectedRefKeys.has(refKey);

							return (
								<ChatReferenceCard
									key={refKey}
									reference={ref}
									isChecked={isChecked}
									onToggleCheck={() => onToggleRefCheck(refKey)}
									onOpenAssign={(e) => onOpenAssignSingle(ref, e)}
									onNavigateToFolder={onNavigateToFolder}
								/>
							);
						})}
					</div>

					{/* Batch Actions Bar for selected references */}
					{selectedRefsInThisMsg.length > 0 && (
						<div className="mt-1 pt-2 border-t border-border flex items-center justify-between gap-1 flex-wrap bg-surface-secondary/40 p-1.5 rounded-lg">
							<span className="text-[10px] text-foreground font-medium">
								已选 {selectedRefsInThisMsg.length} 个书签
							</span>
							<div className="flex items-center gap-1">
								<Button
									variant="secondary"
									size="sm"
									className="h-6 px-2 text-[10px] rounded-md cursor-pointer flex items-center gap-1"
									onPress={() =>
										onOpenAssignMultiple(selectedRefsInThisMsg, false)
									}
								>
									<FolderInput className="w-2.5 h-2.5" />
									<span>归入已有</span>
								</Button>
								<Button
									variant="primary"
									size="sm"
									className="h-6 px-2 text-[10px] rounded-md cursor-pointer flex items-center gap-1"
									onPress={() =>
										onOpenAssignMultiple(selectedRefsInThisMsg, true)
									}
								>
									<FolderPlus className="w-2.5 h-2.5" />
									<span>新建归入</span>
								</Button>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
});
