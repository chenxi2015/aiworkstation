import { Button, Tooltip, toast } from "@heroui/react";
import {
	ArrowUp,
	BookOpen,
	Check,
	CheckSquare,
	ChevronDown,
	Copy,
	ExternalLink,
	Folder as FolderIcon,
	FolderInput,
	FolderPlus,
	Globe,
	Pencil,
	RotateCw,
	Sparkles,
	Square,
	Trash2,
	X,
} from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import type { ChatItem } from "../../../../hooks/ai/useAiChat";
import type { Category, Folder, SearchResultItem } from "../../types";
import { AiMarkdownRenderer } from "../shared/AiMarkdownRenderer";
import { AgentStepTimeline } from "./AgentStepTimeline";
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
	folders?: Folder[];
	onNavigateToFolder?: (
		folderId: number | null,
		category?: Category,
		targetItemId?: string | number,
	) => void;
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
	folders,
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

	const [isRefsExpanded, setIsRefsExpanded] = useState<boolean>(false);

	const currentReferences = msg.references || [];
	const selectedRefsInThisMsg = currentReferences.filter(
		(r: SearchResultItem) => selectedRefKeys.has(r.id || r.url || ""),
	);
	const isAllInMsgChecked =
		currentReferences.length > 0 &&
		currentReferences.every((r: SearchResultItem) =>
			selectedRefKeys.has(r.id || r.url || ""),
		);
	const effectiveRefsExpanded =
		isRefsExpanded || selectedRefsInThisMsg.length > 0;

	if (isSelectMode) {
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
			</button>
		);
	}

	// User message: render as minimalist neutral rounded pill on the right
	if (msg.role === "user") {
		return (
			<div className="w-full flex flex-col items-end gap-1 group relative my-2">
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

						{/* Edit Textarea */}
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

						{/* Save Button */}
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
								保存并重新提问 (Enter)
							</Tooltip.Content>
						</Tooltip>
					</div>
				) : (
					<div className="flex flex-col items-end gap-1 max-w-[85%] sm:max-w-[75%]">
						{/* Render context attachments chips above text if any */}
						{msg.contextItems && msg.contextItems.length > 0 && (
							<div className="flex flex-wrap gap-1 mb-0.5 justify-end">
								{msg.contextItems.map((ci) => {
									const isLink = ci.type === "bookmark" || Boolean(ci.url);
									const isFolder = ci.type === "folder";

									// Bookmark / URL Context Chip: clickable to open in new tab with optional folder locator
									if (isLink && ci.url) {
										return (
											<div
												key={ci.id}
												className="inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-lg bg-surface-secondary/90 hover:bg-accent/10 border border-border/60 hover:border-accent/40 text-[10px] text-foreground/80 hover:text-accent transition-all group/chip select-none hover:scale-[1.02] active:scale-[0.98]"
											>
												<a
													href={ci.url}
													target="_blank"
													rel="noopener noreferrer"
													onClick={(e) => e.stopPropagation()}
													className="inline-flex items-center gap-1 min-w-0 max-w-[150px] cursor-pointer"
													title={`点击在新标签页打开：${ci.url}`}
												>
													{ci.icon ? (
														<img
															src={ci.icon}
															alt=""
															className="w-3 h-3 rounded-sm object-contain shrink-0"
															onError={(e) => {
																(e.currentTarget as HTMLElement).style.display =
																	"none";
															}}
														/>
													) : (
														<Globe className="w-3 h-3 text-accent shrink-0" />
													)}
													<span className="truncate font-medium group-hover/chip:underline">
														{ci.title}
													</span>
													<ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover/chip:opacity-100 shrink-0" />
												</a>

												{/* If bookmark is associated with a folder, allow locating it */}
												{typeof ci.folderId === "number" && onNavigateToFolder && (
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															e.preventDefault();
															onNavigateToFolder(
																ci.folderId ?? null,
																ci.category as Category,
															);
															toast.success("已定位到书签所在文件夹");
														}}
														className="p-0.5 rounded hover:bg-amber-500/20 text-muted hover:text-amber-600 dark:hover:text-amber-400 transition-colors shrink-0 cursor-pointer"
														title="在工作台中定位所在文件夹"
													>
														<FolderIcon className="w-2.5 h-2.5" />
													</button>
												)}
											</div>
										);
									}

									// Folder Context Chip: clickable to navigate & locate in workbench
									if (isFolder && typeof ci.folderId === "number") {
										return (
											<button
												key={ci.id}
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													if (onNavigateToFolder) {
														onNavigateToFolder(
															ci.folderId ?? null,
															ci.category as Category,
														);
														toast.success(`已定位到「${ci.title}」文件夹`);
													}
												}}
												className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-300 transition-all cursor-pointer group/chip select-none hover:scale-[1.02] active:scale-[0.98]"
												title={`点击在工作台中定位并打开「${ci.title}」文件夹`}
											>
												<span className="font-medium">📁</span>
												<span className="truncate max-w-[140px] font-medium group-hover/chip:underline">
													{ci.title}
												</span>
												<FolderIcon className="w-2.5 h-2.5 opacity-60 group-hover/chip:opacity-100 shrink-0" />
											</button>
										);
									}

									// Other context items (image, file, tag)
									return (
										<div
											key={ci.id}
											className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-secondary border border-border/60 text-[10px] text-foreground/80 select-none"
											title={ci.title}
										>
											{ci.type === "image" && ci.thumbnail ? (
												<img
													src={ci.thumbnail}
													alt=""
													className="w-3 h-3 rounded object-cover"
												/>
											) : (
												<span className="text-accent font-medium">📎</span>
											)}
											<span className="truncate max-w-[130px] font-medium">
												{ci.title}
											</span>
										</div>
									);
								})}
							</div>
						)}

						{/* Clean neutral rounded pill (Reference Fig. 1 & 2 style) */}
						<div className="bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-2xl px-4 py-2 text-sm leading-relaxed font-normal shadow-2xs">
							<div className="whitespace-pre-wrap leading-relaxed">
								{msg.content}
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
	}

	// Assistant response: completely borderless, document canvas layout (Reference Fig. 1 & 2)
	return (
		<div className="w-full flex flex-col gap-1.5 group relative pt-1 pb-4 my-2">
			{/* Assistant brand header (Fig. 1 style) */}
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

			{/* Hover Action Toolbar for Assistant: Copy, Regenerate, Delete */}
			{!msg.isStreaming && (
				<div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1 text-muted text-xs pt-1">
					<Tooltip>
						<Tooltip.Trigger>
							<button
								type="button"
								onClick={handleCopy}
								className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/80 transition-colors cursor-pointer"
								aria-label="复制回答"
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
								onClick={() => onResend(index)}
								disabled={isLoading}
								className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/80 disabled:opacity-40 transition-colors cursor-pointer"
								aria-label="重新生成"
							>
								<RotateCw className="w-3.5 h-3.5" />
							</button>
						</Tooltip.Trigger>
						<Tooltip.Content className="text-[10px] py-0.5 px-1.5">
							重新生成
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
			)}

			{/* References / Search Results Cards (collapsible by default to avoid cluttering discussion) */}
			{currentReferences.length > 0 && !msg.isStreaming && (
				<div className="mt-2 w-full flex flex-col rounded-xl bg-surface/90 border border-border animate-in fade-in duration-200 overflow-hidden">
					{/* Toggle Header Bar */}
					<div
						role="button"
						tabIndex={0}
						onClick={() => setIsRefsExpanded(!effectiveRefsExpanded)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								setIsRefsExpanded(!effectiveRefsExpanded);
							}
						}}
						className="px-2.5 py-2 flex items-center justify-between text-[11px] font-medium text-muted hover:bg-surface-secondary/50 transition-colors cursor-pointer select-none"
					>
						{/* Left: icon + title + badge counts */}
						<div className="flex items-center gap-1.5 min-w-0">
							<BookOpen className="w-3.5 h-3.5 text-accent shrink-0" />
							<span className="font-semibold text-xs text-foreground truncate">
								命中的网址列表
							</span>
							<span className="px-1.5 py-0.2 text-[10px] font-medium rounded-full bg-surface-secondary text-muted border border-border/60 shrink-0">
								{currentReferences.length}
							</span>
							{selectedRefsInThisMsg.length > 0 && (
								<span className="px-1.5 py-0.2 text-[10px] font-medium rounded-full bg-accent-soft text-accent border border-accent/30 shrink-0">
									已选 {selectedRefsInThisMsg.length} 项
								</span>
							)}
						</div>

						{/* Right: select-all button + collapse chevron */}
						<div
							className="flex items-center gap-1.5 shrink-0"
							onClick={(e) => e.stopPropagation()}
						>
							{effectiveRefsExpanded && onToggleSelectGroup && (
								<button
									type="button"
									onClick={() => onToggleSelectGroup(currentReferences)}
									className={`text-[10px] font-medium inline-flex items-center gap-1 cursor-pointer transition-colors px-1.5 py-0.5 rounded-md border ${
										isAllInMsgChecked
											? "text-accent bg-accent-soft/60 border-accent/30 hover:bg-accent-soft"
											: "text-muted hover:text-foreground bg-surface-secondary/50 hover:bg-surface-secondary border-border/40"
									}`}
									aria-label={isAllInMsgChecked ? "取消全选" : "全选全部网址"}
								>
									{isAllInMsgChecked ? (
										<CheckSquare className="w-3 h-3 text-accent" />
									) : (
										<Square className="w-3 h-3 opacity-60" />
									)}
									<span>{isAllInMsgChecked ? "取消全选" : "全选"}</span>
								</button>
							)}

							<button
								type="button"
								onClick={() => setIsRefsExpanded(!effectiveRefsExpanded)}
								className="p-0.5 rounded-md text-muted hover:text-foreground transition-colors cursor-pointer"
								aria-label={effectiveRefsExpanded ? "收起列表" : "展开列表"}
							>
								<ChevronDown
									className={`w-3.5 h-3.5 transition-transform duration-200 ${
										effectiveRefsExpanded ? "rotate-180" : ""
									}`}
								/>
							</button>
						</div>
					</div>

					{/* Collapsible Content */}
					{effectiveRefsExpanded && (
						<div className="flex flex-col border-t border-border/50">
							{/* Reference items list with symmetrical margins accounting for scrollbar */}
							<div
								className={`flex flex-col gap-1.5 max-h-72 sm:max-h-80 overflow-y-auto pl-2.5 py-2 ${
									currentReferences.length > 3 ? "pr-1" : "pr-2.5"
								}`}
							>
								{currentReferences.map(
									(ref: SearchResultItem, rIdx: number) => {
										const refKey = ref.id || ref.url || rIdx;
										const isChecked = selectedRefKeys.has(refKey);

										return (
											<ChatReferenceCard
												key={`${ref.id ?? ref.url ?? "ref"}_${rIdx}`}
												reference={ref}
												isChecked={isChecked}
												onToggleCheck={() => onToggleRefCheck(refKey)}
												onOpenAssign={(e) => onOpenAssignSingle(ref, e)}
												onNavigateToFolder={onNavigateToFolder}
											/>
										);
									},
								)}
							</div>

							{/* Batch Actions Bar for selected references */}
							{selectedRefsInThisMsg.length > 0 && (
								<div className="border-t border-border flex items-center justify-between gap-1 flex-wrap bg-surface-secondary/40 px-2.5 py-2">
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
			)}
		</div>
	);
});
