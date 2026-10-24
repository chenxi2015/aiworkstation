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
import {
	type ChatContextItem,
	MAX_CHAT_ATTACHMENTS,
} from "../../../../types/chatContext";
import { SlashSkillMenu } from "../../../common/slash/SlashSkillMenu";
import {
	type SlashItem,
	useSlashSkills,
} from "../../../common/slash/useSlashSkills";
import { CHAT_INPUT_DROP_ID } from "../../dnd/dndUtils";
import type { Category, Folder } from "../../types";
import { ChatContextBar } from "./ChatContextBar";
import { ChatContextSensorBar } from "./ChatContextSensorBar";
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
	onAttachContextItems?: (items: ChatContextItem[]) => void;
	onNavigateToFolder?: (
		folderId: number | null,
		category?: Category,
		targetItemId?: string | number,
	) => void;
}

/** scope 类型 → chip 类型映射（模块级常量，避免被 useMemo 捕获触发依赖告警） */
const SCOPE_TYPE_TO_CHIP: Record<string, ChatContextItem["type"]> = {
	document: "document",
	note: "note",
	material: "material",
	folder: "folder",
	bookmark: "bookmark",
};
const SCOPE_CHIP_LABEL: Record<string, string> = {
	document: "当前文档",
	note: "当前笔记",
	material: "当前素材",
	folder: "当前文件夹",
	bookmark: "当前书签",
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
	onToggleScope: _onToggleScope,
	folders: _folders = [],
	contextItems = [],
	onRemoveContextItem,
	onAttachContextItem,
	onAttachContextItems,
	onNavigateToFolder,
}: ChatInputAreaProps) {
	// Unified attachment helper ensuring batch handling and limits
	const attachItems = useCallback(
		(items: ChatContextItem[]) => {
			if (!items || items.length === 0) return;
			if (onAttachContextItems) {
				onAttachContextItems(items);
			} else if (onAttachContextItem) {
				for (const item of items) {
					onAttachContextItem(item);
				}
			}
		},
		[onAttachContextItems, onAttachContextItem],
	);

	const attachSingleItem = useCallback(
		(item: ChatContextItem) => {
			attachItems([item]);
		},
		[attachItems],
	);

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

	// Ambient Sensor Bar dismiss state (reset on scope change)
	const [isSensorDismissed, setIsSensorDismissed] = useState(false);
	const currentScopeId =
		activeScope?.notePath || activeScope?.documentId || activeScope?.name;
	const prevScopeIdRef = useRef(currentScopeId);
	useEffect(() => {
		if (prevScopeIdRef.current !== currentScopeId) {
			prevScopeIdRef.current = currentScopeId;
			setIsSensorDismissed(false);
		}
	}, [currentScopeId]);

	// Check if active scope is already in input context items
	const isScopeAlreadyAttached = useMemo(() => {
		if (!activeScope) return false;
		return contextItems.some((ci) => {
			if (
				activeScope.type === "note" &&
				ci.type === "note" &&
				ci.notePath === activeScope.notePath
			)
				return true;
			if (
				activeScope.type === "document" &&
				ci.type === "document" &&
				ci.documentId === activeScope.documentId
			)
				return true;
			if (
				activeScope.type === "material" &&
				ci.type === "material" &&
				ci.materialId === activeScope.materialId
			)
				return true;
			if (
				activeScope.type === "folder" &&
				ci.type === "folder" &&
				ci.folderId === activeScope.folderId
			)
				return true;
			if (
				activeScope.type === "bookmark" &&
				ci.type === "bookmark" &&
				(ci.id === `bookmark_${activeScope.bookmarkId}` ||
					(activeScope.url && ci.url === activeScope.url))
			)
				return true;
			return false;
		});
	}, [activeScope, contextItems]);

	// Attach current document/bookmark/material into one-shot chat input context
	const handleAttachScopeToContext = useCallback(() => {
		if (!activeScope) return;
		const chipType = SCOPE_TYPE_TO_CHIP[activeScope.type] ?? "document";
		let subtitle = SCOPE_CHIP_LABEL[activeScope.type] ?? "当前上下文";
		if (activeScope.type === "note") {
			const isCanvas = activeScope.notePath?.toLowerCase().endsWith(".canvas");
			const isExcalidraw = activeScope.notePath
				?.toLowerCase()
				.endsWith(".excalidraw");
			subtitle = isCanvas ? "白板画布" : isExcalidraw ? "手绘草图" : "当前笔记";
		} else if (activeScope.type === "bookmark" && activeScope.url) {
			try {
				subtitle = new URL(activeScope.url).hostname;
			} catch {}
		}

		const scopeItem: ChatContextItem = {
			id:
				activeScope.type === "bookmark"
					? `bookmark_${activeScope.bookmarkId ?? Date.now()}`
					: `scope_${Date.now()}`,
			type: chipType,
			title: activeScope.name,
			subtitle,
			notePath: activeScope.notePath,
			documentId: activeScope.documentId,
			materialId: activeScope.materialId,
			folderId: activeScope.folderId,
			url: activeScope.url,
			icon: activeScope.iconUrl,
		};
		attachSingleItem(scopeItem);
	}, [activeScope, attachSingleItem]);

	// Directly trigger summarization prompt for active scope
	const handleSummarizeScope = useCallback(() => {
		if (!activeScope) return;
		const chipType = SCOPE_TYPE_TO_CHIP[activeScope.type] ?? "document";
		let subtitle = SCOPE_CHIP_LABEL[activeScope.type] ?? "当前上下文";
		if (activeScope.type === "note") {
			const isCanvas = activeScope.notePath?.toLowerCase().endsWith(".canvas");
			const isExcalidraw = activeScope.notePath
				?.toLowerCase()
				.endsWith(".excalidraw");
			subtitle = isCanvas ? "白板画布" : isExcalidraw ? "手绘草图" : "当前笔记";
		} else if (activeScope.type === "bookmark" && activeScope.url) {
			try {
				subtitle = new URL(activeScope.url).hostname;
			} catch {}
		}

		const scopeItem: ChatContextItem = {
			id:
				activeScope.type === "bookmark"
					? `bookmark_${activeScope.bookmarkId ?? Date.now()}`
					: `scope_sum_${Date.now()}`,
			type: chipType,
			title: activeScope.name,
			subtitle,
			notePath: activeScope.notePath,
			documentId: activeScope.documentId,
			materialId: activeScope.materialId,
			folderId: activeScope.folderId,
			url: activeScope.url,
			icon: activeScope.iconUrl,
		};

		let prompt = `请帮我全面梳理并总结当前${subtitle}《${activeScope.name}》的核心要点、结构与关键内容。`;
		if (activeScope.type === "bookmark") {
			prompt = `请深度总结与分析书签《${activeScope.name}》${activeScope.url ? `（链接: ${activeScope.url}）` : ""}的核心内容、亮点特性与适用场景。`;
		} else if (activeScope.type === "folder") {
			prompt = `请深度盘点并总结「${activeScope.name}」文件夹中的书签资源，梳理分类亮点、推荐工具与使用建议。`;
		} else if (activeScope.type === "material") {
			prompt = `请分析并提炼素材《${activeScope.name}》的内容特征、适用场景与二创/剪辑应用建议。`;
		}

		onSend([scopeItem], prompt);
	}, [activeScope, onSend]);

	const canSend =
		(hasEditorContent ||
			input.trim().length > 0 ||
			contextItems.length > 0) &&
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

			if (!onAttachContextItem && !onAttachContextItems) return;

			if (contextItems.length >= MAX_CHAT_ATTACHMENTS) {
				toast.warning(`最多只能添加 ${MAX_CHAT_ATTACHMENTS} 个附件`);
				return;
			}

			// 1. Check native files (dragged from OS desktop or file manager)
			const files = e.dataTransfer.files;
			if (files && files.length > 0) {
				const parsedItems: ChatContextItem[] = [];
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
							parsedItems.push(item);
						}
					} catch (err) {
						toast.danger(
							err instanceof Error ? err.message : `「${file.name}」解析失败`,
						);
					}
				}
				if (parsedItems.length > 0) {
					attachItems(parsedItems);
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
						attachSingleItem({
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
							attachSingleItem({
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
						attachSingleItem({
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
						attachSingleItem({
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
					attachSingleItem({
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
						attachSingleItem({
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
					attachSingleItem({
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
		[attachSingleItem, attachItems, onAttachContextItem, onAttachContextItems, contextItems.length],
	);

	// Handle paste events (e.g. clipboard images)
	const handlePaste = useCallback(
		async (e: ClipboardEvent<HTMLDivElement>) => {
			if (contextItems.length >= MAX_CHAT_ATTACHMENTS) {
				toast.warning(`最多只能添加 ${MAX_CHAT_ATTACHMENTS} 个附件`);
				return;
			}
			const items = e.clipboardData.items;
			for (let i = 0; i < items.length; i++) {
				if (items[i].type.indexOf("image") !== -1) {
					const file = items[i].getAsFile();
					if (file && (onAttachContextItem || onAttachContextItems)) {
						e.preventDefault();
						try {
							const item = await createChatImageContextItem(file, i);
							attachSingleItem({
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
		[attachSingleItem, onAttachContextItem, onAttachContextItems, contextItems.length],
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

		// Collect inline mentions and skills as extra context items
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
		return "发消息、拖入文件，输入 / 载入 Skills...";
	}, [contextItems.length]);

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

			{/* Context Sensor Bar (Ambient sensing: senses active note/doc without forcefully hijacking input area) */}
			{activeScope && !isSensorDismissed && (
				<ChatContextSensorBar
					scope={activeScope}
					isAlreadyAttached={isScopeAlreadyAttached}
					onAttach={handleAttachScopeToContext}
					onSummarize={handleSummarizeScope}
					onDismiss={() => setIsSensorDismissed(true)}
				/>
			)}

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
				className={`relative flex flex-col bg-surface border rounded-2xl p-2 transition-all shadow-xs group ${
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

				{/* Injected Context Attachment Chips（用户主动拖拽/加入的附件卡片） */}
				{contextItems.length > 0 && (
					<div className="mb-1 pb-1">
						<ChatContextBar
							items={contextItems}
							onRemove={onRemoveContextItem}
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
					onAttachContextItem={attachSingleItem}
					onAttachContextItems={attachItems}
					contextItemsCount={contextItems.length}
				/>
			</section>

			{/* Footer Hints */}
			<div className="flex items-center justify-between px-1 text-[10px] text-muted/70">
				<span>
					{contextItems.length > 0
						? `已添加 ${contextItems.length}/${MAX_CHAT_ATTACHMENTS} 个附件 · Enter 发送`
						: "可直接拖入书签、文件夹、笔记或文件 · Enter 发送"}
				</span>
				<span className="hidden sm:inline truncate max-w-[200px]">
					RAG 本地知识库驱动
				</span>
			</div>
		</div>
	);
});
