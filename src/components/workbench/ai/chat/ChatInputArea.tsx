import { useDroppable } from "@dnd-kit/react";
import { Paperclip } from "lucide-react";
import {
	type ClipboardEvent,
	type DragEvent,
	memo,
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { WorkbenchStorageService } from "../../../../services/workbenchStorage";
import type { ChatContextItem } from "../../../../types/chatContext";
import { SlashSkillMenu } from "../../../common/slash/SlashSkillMenu";
import {
	type SlashItem,
	useSlashSkills,
} from "../../../common/slash/useSlashSkills";
import { CHAT_INPUT_DROP_ID } from "../../dnd/dndUtils";
import type { Category, Folder } from "../../types";
import { ChatContextBar } from "./ChatContextBar";
import { ChatContextMentionMenu } from "./ChatContextMentionMenu";
import { type ActiveChatScope, ChatInputBottomBar } from "./ChatInputBottomBar";
import { ChatInputTopToolbar } from "./ChatInputTopToolbar";
import {
	ChatRichInlineInput,
	type ChatRichInlineInputHandle,
} from "./inline/ChatRichInlineInput";
import { searchMentionCandidates } from "./utils/mentionSearch";

export interface ChatInputAreaProps {
	input: string;
	isLoading: boolean;
	hasMessages: boolean;
	inputRef: RefObject<HTMLTextAreaElement | null>;
	onChangeInput: (val: string) => void;
	onSend: (extraContextItems?: ChatContextItem[]) => void;
	onStop?: () => void;
	onOpenHistory?: () => void;
	onNewChat?: () => void;
	onClearHistory?: () => void;
	model?: string;
	scopeMode?: "global" | "folder";
	selectedFolder?: Folder | null;
	activeScope?: ActiveChatScope | null;
	onToggleScope?: () => void;
	folders?: Folder[];
	/** Contextual attachment chips displayed above input area */
	contextItems?: ChatContextItem[];
	onRemoveContextItem?: (id: string) => void;
	onClearContextItems?: () => void;
	onAttachContextItem?: (item: ChatContextItem) => void;
	onNavigateToFolder?: (
		folderId: number | null,
		category?: Category,
		targetItemId?: string | number,
	) => void;
}

/** Friendly label map for dynamic scope placeholder */
const SCOPE_TYPE_LABELS: Record<string, string> = {
	document: "文档",
	material: "素材",
	folder: "文件夹",
};

/**
 * Modern AI chat input area with inline rich token integration,
 * context injection (dnd-kit & native drops), and embedded action bar.
 */
export const ChatInputArea = memo(function ChatInputArea({
	input,
	isLoading,
	inputRef,
	onChangeInput,
	onSend,
	onStop,
	onOpenHistory: _onOpenHistory,
	onNewChat: _onNewChat,
	model,
	scopeMode = "global",
	selectedFolder,
	activeScope,
	onToggleScope,
	folders = [],
	contextItems = [],
	onRemoveContextItem,
	onClearContextItems,
	onAttachContextItem,
	onNavigateToFolder,
}: ChatInputAreaProps) {
	const currentSettings =
		typeof window !== "undefined"
			? WorkbenchStorageService.getSettings()
			: null;
	const displayModel = model || currentSettings?.model || "AI";

	// Droppable area for external drag-and-drop items
	const { isDropTarget, ref: dropRef } = useDroppable({
		id: CHAT_INPUT_DROP_ID,
	});

	// Native drag state for desktop images and external files
	const [isNativeDragOver, setIsNativeDragOver] = useState(false);

	// Context Mention Menu (@ mention) state
	const [mentionQuery, setMentionQuery] = useState<string | null>(null);
	const [mentionSelectedIndex, setMentionSelectedIndex] = useState<number>(0);

	// Slash Command / Skill Menu (/ slash) state
	const [slashQuery, setSlashQuery] = useState<string | null>(null);
	const [slashSelectedIndex, setSlashSelectedIndex] = useState<number>(0);

	// Rich inline input handle ref
	const inlineEditorRef = useRef<ChatRichInlineInputHandle | null>(null);
	const [hasEditorContent, setHasEditorContent] = useState(false);

	const { filteredItems: slashCandidates } = useSlashSkills(slashQuery);

	// Compute active mention candidates
	const activeCandidates = useMemo(() => {
		if (mentionQuery === null) return [];
		return searchMentionCandidates(folders, mentionQuery);
	}, [mentionQuery, folders]);

	const isMenuOpen = mentionQuery !== null || slashQuery !== null;

	const canSend =
		(hasEditorContent || input.trim().length > 0 || contextItems.length > 0) &&
		!isLoading;

	// Bridge inputRef for parent components calling inputRef.current?.focus()
	useEffect(() => {
		if (inputRef) {
			// biome-ignore lint/suspicious/noExplicitAny: bridging proxy for parent inputRef.focus()
			(inputRef as any).current = {
				focus: () => inlineEditorRef.current?.focus(),
			};
		}
	}, [inputRef]);

	// Sync external input string if parent updates it while editor is empty
	useEffect(() => {
		if (input && inlineEditorRef.current?.isEmpty()) {
			inlineEditorRef.current.setContent(input);
			setHasEditorContent(true);
		}
	}, [input]);

	// Handle native file drop (e.g. dragging images/files from desktop)
	const handleNativeDrop = useCallback(
		(e: DragEvent<HTMLDivElement>) => {
			if (!onAttachContextItem) return;
			const files = e.dataTransfer.files;
			if (!files || files.length === 0) return;

			e.preventDefault();
			e.stopPropagation();
			setIsNativeDragOver(false);

			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				if (file.type.startsWith("image/")) {
					const reader = new FileReader();
					reader.onload = () => {
						onAttachContextItem({
							id: `img_${Date.now()}_${i}`,
							type: "image",
							title: file.name,
							subtitle: `${Math.round(file.size / 1024)} KB`,
							thumbnail: reader.result as string,
						});
					};
					reader.readAsDataURL(file);
				} else {
					onAttachContextItem({
						id: `file_${Date.now()}_${i}`,
						type: "document",
						title: file.name,
						subtitle: `${(file.size / 1024).toFixed(1)} KB`,
					});
				}
			}
		},
		[onAttachContextItem],
	);

	// Handle paste events (e.g. clipboard images)
	const handlePaste = useCallback(
		(e: ClipboardEvent<HTMLDivElement>) => {
			const items = e.clipboardData.items;
			for (let i = 0; i < items.length; i++) {
				if (items[i].type.indexOf("image") !== -1) {
					const file = items[i].getAsFile();
					if (file && onAttachContextItem) {
						e.preventDefault();
						const reader = new FileReader();
						reader.onload = () => {
							onAttachContextItem({
								id: `img_${Date.now()}_${i}`,
								type: "image",
								title: "剪贴板截图",
								subtitle: `${Math.round(file.size / 1024)} KB`,
								thumbnail: reader.result as string,
							});
						};
						reader.readAsDataURL(file);
					}
				}
			}
		},
		[onAttachContextItem],
	);

	const isDropTargetActive = isDropTarget || isNativeDragOver;

	// Insert chosen mention item as inline token (folders go to top context cards)
	const handleSelectMention = useCallback(
		(cand: ChatContextItem) => {
			if (cand.type === "folder") {
				// @文件夹放在上面作为上下文卡片
				onAttachContextItem?.(cand);
				inlineEditorRef.current?.removeTrigger("@");
			} else {
				inlineEditorRef.current?.insertMention(cand);
			}
			setMentionQuery(null);
			setHasEditorContent(true);
			setTimeout(() => inlineEditorRef.current?.focus(), 30);
		},
		[onAttachContextItem],
	);

	// Insert chosen slash item as inline skill badge
	const handleSelectSlash = useCallback((item: SlashItem) => {
		inlineEditorRef.current?.insertSkill(item);
		setSlashQuery(null);
		setHasEditorContent(true);
		setTimeout(() => inlineEditorRef.current?.focus(), 30);
	}, []);

	// Intercept keyboard events when dropdown menus are open
	const handleMenuKeyDown = useCallback(
		(e: React.KeyboardEvent): boolean => {
			// Slash command menu
			if (slashQuery !== null && slashCandidates.length > 0) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					setSlashSelectedIndex((prev) =>
						prev + 1 < slashCandidates.length ? prev + 1 : 0,
					);
					return true;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					setSlashSelectedIndex((prev) =>
						prev - 1 >= 0 ? prev - 1 : slashCandidates.length - 1,
					);
					return true;
				}
				if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
					e.preventDefault();
					const target = slashCandidates[slashSelectedIndex];
					if (target) {
						handleSelectSlash(target);
					}
					return true;
				}
				if (e.key === "Escape") {
					e.preventDefault();
					setSlashQuery(null);
					return true;
				}
			}

			// Mention menu
			if (mentionQuery !== null && activeCandidates.length > 0) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					setMentionSelectedIndex((prev) =>
						prev + 1 < activeCandidates.length ? prev + 1 : 0,
					);
					return true;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					setMentionSelectedIndex((prev) =>
						prev - 1 >= 0 ? prev - 1 : activeCandidates.length - 1,
					);
					return true;
				}
				if (e.key === "Enter" && !e.shiftKey) {
					e.preventDefault();
					const target = activeCandidates[mentionSelectedIndex];
					if (target) {
						handleSelectMention({
							id: target.id,
							type: target.type,
							title: target.title,
							subtitle: target.subtitle,
							url: target.url,
							folderId: target.folderId,
							icon: target.icon,
						});
					}
					return true;
				}
				if (e.key === "Escape") {
					e.preventDefault();
					setMentionQuery(null);
					return true;
				}
			}

			return false;
		},
		[
			slashQuery,
			slashCandidates,
			slashSelectedIndex,
			handleSelectSlash,
			mentionQuery,
			activeCandidates,
			mentionSelectedIndex,
			handleSelectMention,
		],
	);

	// Send message handler: serializes inline tokens, collects skills/mentions, passes them directly to onSend
	const handleSendMessage = useCallback(() => {
		if (!canSend) return;

		const data = inlineEditorRef.current?.getSerializedData();
		const finalPrompt = data?.fullPrompt ?? input;

		// Collect inline mentions and skills as extra context items to pass directly to sendPrompt
		// (avoids React setState async race condition with onAttachContextItem)
		const extraItems: ChatContextItem[] = [];

		if (data?.mentions && data.mentions.length > 0) {
			for (const m of data.mentions) {
				extraItems.push(m);
			}
		}

		if (data?.skills && data.skills.length > 0) {
			for (const s of data.skills) {
				extraItems.push({
					id: `skill_${s.id}`,
					type: "skill",
					title: s.name,
					subtitle: s.dirPath || "",
					data: {
						skillName: s.name,
						dirPath: s.dirPath,
					},
				});
			}
		}

		onChangeInput(finalPrompt);
		inlineEditorRef.current?.clear();
		setHasEditorContent(false);

		// Pass extra items directly so they are available synchronously in sendPrompt
		setTimeout(() => {
			onSend(extraItems.length > 0 ? extraItems : undefined);
		}, 0);
	}, [canSend, input, onChangeInput, onSend]);

	const placeholder = useMemo(() => {
		if (contextItems.length > 0) {
			return "对上述引用的上下文提问，或输入要求...";
		}
		if (activeScope?.isActive) {
			return `针对当前${SCOPE_TYPE_LABELS[activeScope.type] || "内容"}提问，或输入 @ 引用...`;
		}
		return "发消息、输入 @ 引用，输入 / 载入 Skills...";
	}, [contextItems.length, activeScope]);

	return (
		<div className="p-3 bg-surface/50 backdrop-blur-xs shrink-0 flex flex-col gap-2 relative z-10">
			{/* Dropdown Mention Menu for @ mentions */}
			<ChatContextMentionMenu
				isOpen={mentionQuery !== null}
				query={mentionQuery || ""}
				folders={folders}
				candidates={activeCandidates}
				selectedIndex={mentionSelectedIndex}
				onSelectIndexChange={setMentionSelectedIndex}
				onSelect={handleSelectMention}
				onClose={() => setMentionQuery(null)}
			/>

			{/* Dropdown Slash Menu for / skills & commands */}
			<SlashSkillMenu
				isOpen={slashQuery !== null}
				query={slashQuery || ""}
				items={slashCandidates}
				selectedIndex={slashSelectedIndex}
				onSelectIndexChange={setSlashSelectedIndex}
				onSelect={handleSelectSlash}
				onClose={() => setSlashQuery(null)}
			/>

			{/* Top action toolbar: Model Badge & Active Context Indicator */}
			<ChatInputTopToolbar displayModel={displayModel} />

			{/* Main Input Card: Droppable Zone with Context Bar, Rich Inline Editor, and Bottom Bar */}
			<section
				ref={dropRef}
				aria-label="AI 对话输入与上下文拖放区域"
				onDragOver={(e) => {
					e.preventDefault();
					setIsNativeDragOver(true);
				}}
				onDragLeave={() => setIsNativeDragOver(false)}
				onDrop={handleNativeDrop}
				onPaste={handlePaste}
				className={`relative flex flex-col bg-surface border rounded-2xl px-3 py-2 transition-all shadow-xs group ${
					isDropTargetActive
						? "border-dashed border-blue-500 ring-2 ring-blue-500/30 bg-blue-500/5 scale-[1.005]"
						: "border-border/80 focus-within:border-blue-500/50 focus-within:ring-2 focus-within:ring-blue-500/15"
				}`}
			>
				{/* Visual drop indicator overlay when hovering */}
				{isDropTargetActive && (
					<div className="absolute inset-0 z-20 pointer-events-none rounded-2xl bg-blue-500/10 backdrop-blur-[1px] flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400 font-medium text-xs animate-in fade-in duration-150">
						<Paperclip className="w-4 h-4 animate-bounce" />
						<span>释放以添加为对话上下文</span>
					</div>
				)}

				{/* Injected Context Attachment Chips (Bookmarks, Folders, Files) */}
				{contextItems.length > 0 && (
					<div className="mb-1 pb-1 border-b border-border/50">
						<ChatContextBar
							items={contextItems}
							onRemove={(id) => onRemoveContextItem?.(id)}
							onClearAll={onClearContextItems}
							onNavigateToFolder={onNavigateToFolder}
						/>
					</div>
				)}

				{/* Modern Inline Rich Input Area: Tokens flow seamlessly with typing text (图一) */}
				<div className="px-0.5 py-0.5 min-h-[24px] flex items-start">
					<ChatRichInlineInput
						ref={inlineEditorRef}
						placeholder={placeholder}
						onSend={handleSendMessage}
						onChangeText={(text) => {
							const hasTokens = !inlineEditorRef.current?.isEmpty();
							setHasEditorContent(hasTokens);
							onChangeInput(text);
						}}
						onTriggerMention={(query) => {
							setMentionQuery(query);
							setMentionSelectedIndex(0);
						}}
						onTriggerSlash={(query) => {
							setSlashQuery(query);
							setSlashSelectedIndex(0);
						}}
						isMenuOpen={isMenuOpen}
						onMenuKeyDown={handleMenuKeyDown}
						maxHeight={120}
					/>
				</div>

				{/* Card Bottom Bar: Left scope switch, Right Send/Stop Button */}
				<ChatInputBottomBar
					scopeMode={scopeMode}
					selectedFolder={selectedFolder}
					activeScope={activeScope}
					onToggleScope={onToggleScope}
					isLoading={isLoading}
					canSend={canSend}
					onSend={handleSendMessage}
					onStop={onStop}
				/>
			</section>

			{/* Footer Hints */}
			<div className="flex items-center justify-between px-1 text-[10px] text-muted/70">
				<span>可直接拖入书签、文件夹或图片 · Enter 发送</span>
				<span className="hidden sm:inline truncate max-w-[200px]">
					RAG 本地知识库驱动
				</span>
			</div>
		</div>
	);
});
