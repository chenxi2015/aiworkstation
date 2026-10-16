import { useDroppable } from "@dnd-kit/react";
import { toast } from "@heroui/react";
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
import { ChatInputBottomBar } from "./ChatInputBottomBar";
import { ChatInputTopToolbar } from "./ChatInputTopToolbar";
import type { ActiveChatScope } from "./chatScopeTypes";
import {
	ChatRichInlineInput,
	type ChatRichInlineInputHandle,
} from "./inline/ChatRichInlineInput";
import {
	getUnsupportedFileReason,
	importChatFile,
	isImportableChatFile,
} from "./utils/chatFileImport";
import { createChatImageContextItem } from "./utils/chatImageCompress";
import {
	isImageFile,
	vaultAssetUrl,
} from "../../../obsidian/utils/vaultFileUtils";

export interface ChatInputAreaProps {
	input: string;
	isLoading: boolean;
	hasMessages: boolean;
	inputRef: RefObject<HTMLTextAreaElement | null>;
	onChangeInput: (val: string) => void;
	onSend: (extraContextItems?: ChatContextItem[], promptText?: string) => void;
	onStop?: () => void;
	onOpenHistory?: () => void;
	onNewChat?: () => void;
	onClearHistory?: () => void;
	model?: string;
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

/** scope 类型 → chip 类型映射（模块级常量，避免被 useMemo 捕获触发依赖告警） */
const SCOPE_TYPE_TO_CHIP: Record<string, ChatContextItem["type"]> = {
	document: "document",
	note: "note",
	material: "material",
	folder: "folder",
};
const SCOPE_CHIP_LABEL: Record<string, string> = {
	document: "当前文档",
	note: "当前笔记",
	material: "当前素材",
	folder: "当前文件夹",
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
	onOpenHistory,
	onNewChat,
	model,
	activeScope,
	onToggleScope,
	folders: _folders = [],
	contextItems = [],
	onRemoveContextItem,
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

	// Native drag state for desktop images, external files, and notes
	const [isNativeDragOver, setIsNativeDragOver] = useState(false);

	// Slash Command / Skill Menu (/ slash) state
	const [slashQuery, setSlashQuery] = useState<string | null>(null);
	const [slashSelectedIndex, setSlashSelectedIndex] = useState<number>(0);

	// Rich inline input handle ref
	const inlineEditorRef = useRef<ChatRichInlineInputHandle | null>(null);
	const [hasEditorContent, setHasEditorContent] = useState(false);

	const { filteredItems: slashCandidates } = useSlashSkills(slashQuery);

	// Ensure native drag state resets if drag ends outside or is cancelled
	useEffect(() => {
		const handleGlobalDragEnd = () => {
			setIsNativeDragOver(false);
		};
		window.addEventListener("dragend", handleGlobalDragEnd);
		return () => {
			window.removeEventListener("dragend", handleGlobalDragEnd);
		};
	}, []);

	const isMenuOpen = slashQuery !== null;

	// 将当前 scope（当前文档/笔记/素材/文件夹）合成为内建 chip 插入上下文栏开头；
	// × 掉即 detach（等价于原「切换到全局」）。替代旧 scope pill 的表达。
	const mergedContextItems = useMemo(() => {
		if (!activeScope?.isActive) return contextItems;
		const chipType = SCOPE_TYPE_TO_CHIP[activeScope.type] ?? "document";
		const scopeChip: ChatContextItem = {
			id: "__active_scope__",
			type: chipType,
			title: activeScope.name,
			subtitle: SCOPE_CHIP_LABEL[activeScope.type] ?? "当前上下文",
		};
		return [scopeChip, ...contextItems];
	}, [activeScope, contextItems]);

	const handleRemoveContextItem = useCallback(
		(id: string) => {
			if (id === "__active_scope__") {
				// 移除内建 scope chip = detach 当前上下文对象
				onToggleScope?.();
				return;
			}
			onRemoveContextItem?.(id);
		},
		[onToggleScope, onRemoveContextItem],
	);

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

	// Handle native file and note drop
	const handleNativeDrop = useCallback(
		async (e: DragEvent<HTMLDivElement>) => {
			e.preventDefault();
			e.stopPropagation();
			setIsNativeDragOver(false);

			if (!onAttachContextItem) return;

			// 1. Check native files (dragged from OS desktop or file manager)
			const files = e.dataTransfer.files;
			if (files && files.length > 0) {
				for (let i = 0; i < files.length; i++) {
					const file = files[i];
					if (!isImportableChatFile(file)) {
						const reason = getUnsupportedFileReason(file);
						toast.warning(reason);
						continue;
					}
					try {
						const item = await importChatFile(file, i);
						if (item) {
							onAttachContextItem(item);
						}
					} catch (err) {
						toast.danger(
							err instanceof Error ? err.message : `「${file.name}」解析失败`,
						);
					}
				}
				return;
			}

			// 2. Check dragged image directly from Obsidian editor preview
			const imageRaw = e.dataTransfer.getData("application/x-obsidian-image");
			if (imageRaw) {
				try {
					const parsed = JSON.parse(imageRaw) as {
						src: string;
						alt?: string;
						relPath?: string;
					};
					if (parsed.src) {
						const title =
							parsed.alt ||
							(parsed.relPath ? parsed.relPath.split("/").pop() : "") ||
							"笔记图片";
						onAttachContextItem({
							id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
							type: "image",
							title,
							subtitle: "笔记图片",
							thumbnail: parsed.src,
							url: parsed.src,
							notePath: parsed.relPath,
						});
						toast.success(`已添加图片「${title}」为对话上下文`);
						return;
					}
				} catch (err) {
					console.warn("[ChatInputArea] Parse dropped image error:", err);
				}
			}

			// 3. Check Obsidian note / canvas / image dragged from vault tree
			const noteRaw = e.dataTransfer.getData("application/x-obsidian-note");
			if (noteRaw) {
				try {
					const parsed = JSON.parse(noteRaw) as {
						relPath: string;
						name: string;
						kind?: "file" | "folder";
					};
					if (parsed.relPath) {
						// 3a. If dragged vault node is an image file
						if (isImageFile(parsed.relPath) || isImageFile(parsed.name || "")) {
							const assetUrl = vaultAssetUrl(parsed.relPath);
							const title =
								parsed.name || parsed.relPath.split("/").pop() || "笔记图片";
							onAttachContextItem({
								id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
								type: "image",
								title,
								subtitle: "笔记图片",
								thumbnail: assetUrl,
								url: assetUrl,
								notePath: parsed.relPath,
								data: {
									vaultRelPath: parsed.relPath,
								},
							});
							toast.success(`已添加图片「${title}」为对话上下文`);
							return;
						}

						const isCanvas = parsed.relPath.toLowerCase().endsWith(".canvas");
						const isExcalidraw = parsed.relPath.toLowerCase().endsWith(".excalidraw");
						const isFolder = parsed.kind === "folder";
						const subtitle = isFolder
							? "笔记文件夹"
							: isCanvas
								? "白板画布"
								: isExcalidraw
									? "手绘草图"
									: "笔记";
						onAttachContextItem({
							id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
							type: "note",
							title: parsed.name || parsed.relPath,
							subtitle,
							notePath: parsed.relPath,
						});
						toast.success(`已添加「${parsed.name || parsed.relPath}」为对话上下文`);
						return;
					}
				} catch (err) {
					console.warn("[ChatInputArea] Parse dropped note error:", err);
				}
			}

			// 4. Fallback check plain text or URI list (dragged links or paths)
			const uriList = e.dataTransfer.getData("text/uri-list")?.trim();
			const text = e.dataTransfer.getData("text/plain")?.trim();
			const targetUri = uriList || text || "";

			if (targetUri) {
				// 4a. Check if target is an obsidian asset API link: /api/obsidian/asset?path=...
				if (targetUri.includes("/api/obsidian/asset")) {
					try {
						const urlObj = new URL(targetUri, "http://localhost");
						const p =
							urlObj.searchParams.get("path") ||
							urlObj.searchParams.get("name") ||
							"";
						const name = p.split("/").pop() || "笔记图片";
						onAttachContextItem({
							id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
							type: "image",
							title: name,
							subtitle: "笔记图片",
							thumbnail: targetUri,
							url: targetUri,
							notePath: p,
						});
						toast.success(`已添加图片「${name}」为对话上下文`);
						return;
					} catch {}
				}

				// 4b. Check if target is a direct image file path
				if (isImageFile(targetUri)) {
					const fileName = targetUri.split("/").pop() || targetUri;
					const assetUrl = vaultAssetUrl(targetUri);
					onAttachContextItem({
						id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
						type: "image",
						title: fileName,
						subtitle: "笔记图片",
						thumbnail: assetUrl,
						url: assetUrl,
						notePath: targetUri,
					});
					toast.success(`已添加图片「${fileName}」为对话上下文`);
					return;
				}

				// 4c. Check if target is a wikilink like ![[image.png]]
				const wikilinkMatch = targetUri.match(/!?\[\[(.*?)\]\]/);
				if (wikilinkMatch) {
					const inner = wikilinkMatch[1].trim();
					if (isImageFile(inner)) {
						const fileName = inner.split("/").pop() || inner;
						const assetUrl = vaultAssetUrl(inner);
						onAttachContextItem({
							id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
							type: "image",
							title: fileName,
							subtitle: "笔记图片",
							thumbnail: assetUrl,
							url: assetUrl,
							notePath: inner,
						});
						toast.success(`已添加图片「${fileName}」为对话上下文`);
						return;
					}
				}

				// 4d. Fallback check plain text (if dropped path matches vault note)
				if (
					targetUri.endsWith(".md") ||
					targetUri.endsWith(".canvas") ||
					targetUri.endsWith(".excalidraw")
				) {
					const fileName = targetUri.split("/").pop() || targetUri;
					const isCanvas = targetUri.toLowerCase().endsWith(".canvas");
					const isExcalidraw = targetUri.toLowerCase().endsWith(".excalidraw");
					const subtitle = isCanvas ? "白板画布" : isExcalidraw ? "手绘草图" : "笔记";
					onAttachContextItem({
						id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
						type: "note",
						title: fileName,
						subtitle,
						notePath: targetUri,
					});
					toast.success(`已添加「${fileName}」为对话上下文`);
				}
			}
		},
		[onAttachContextItem],
	);

	// Handle paste events (e.g. clipboard images)
	const handlePaste = useCallback(
		async (e: ClipboardEvent<HTMLDivElement>) => {
			const items = e.clipboardData.items;
			for (let i = 0; i < items.length; i++) {
				if (items[i].type.indexOf("image") !== -1) {
					const file = items[i].getAsFile();
					if (file && onAttachContextItem) {
						e.preventDefault();
						try {
							const item = await createChatImageContextItem(file, i);
							onAttachContextItem({
								...item,
								title: item.title === "截图" ? "剪贴板截图" : item.title,
							});
						} catch (err) {
							console.warn("[ChatInputArea] Paste image error:", err);
						}
					}
				}
			}
		},
		[onAttachContextItem],
	);

	const isDropTargetActive = isDropTarget || isNativeDragOver;

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

			return false;
		},
		[slashQuery, slashCandidates, slashSelectedIndex, handleSelectSlash],
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
			onSend(extraItems.length > 0 ? extraItems : undefined, finalPrompt);
		}, 0);
	}, [canSend, input, onChangeInput, onSend]);

	const placeholder = useMemo(() => {
		if (contextItems.length > 0) {
			return "对上述引用的上下文提问，或输入要求...";
		}
		if (activeScope?.isActive) {
			return `针对当前${SCOPE_TYPE_LABELS[activeScope.type] || "内容"}提问，输入 / 载入 Skills...`;
		}
		return "发消息、拖入文件，输入 / 载入 Skills...";
	}, [contextItems.length, activeScope]);

	return (
		<div className="p-3 bg-surface/50 backdrop-blur-xs shrink-0 flex flex-col gap-2 relative z-10">
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

			{/* Top action toolbar: Model Badge & History/NewChat quick actions */}
			<ChatInputTopToolbar
				displayModel={displayModel}
				onOpenHistory={onOpenHistory}
				onNewChat={onNewChat}
			/>

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

				{/* Injected Context Attachment Chips（内建 scope chip + 书签/文件夹/图片/文件/笔记） */}
				{mergedContextItems.length > 0 && (
					<div className="mb-1 pb-1">
						<ChatContextBar
							items={mergedContextItems}
							onRemove={handleRemoveContextItem}
							onNavigateToFolder={onNavigateToFolder}
						/>
					</div>
				)}

				{/* Modern Inline Rich Input Area: Tokens flow seamlessly with typing text */}
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
						onTriggerSlash={(query) => {
							setSlashQuery(query);
							setSlashSelectedIndex(0);
						}}
						isMenuOpen={isMenuOpen}
						onMenuKeyDown={handleMenuKeyDown}
						maxHeight={120}
					/>
				</div>

				{/* Card Bottom Bar: Left + attachment menu, Right Send/Stop Button */}
				<ChatInputBottomBar
					isLoading={isLoading}
					canSend={canSend}
					onSend={handleSendMessage}
					onStop={onStop}
					onAttachContextItem={onAttachContextItem}
				/>
			</section>

			{/* Footer Hints */}
			<div className="flex items-center justify-between px-1 text-[10px] text-muted/70">
				<span>可直接拖入书签、文件夹、笔记或文件 · Enter 发送</span>
				<span className="hidden sm:inline truncate max-w-[200px]">
					RAG 本地知识库驱动
				</span>
			</div>
		</div>
	);
});
