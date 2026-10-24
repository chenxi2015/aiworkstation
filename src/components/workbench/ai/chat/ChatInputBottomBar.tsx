import { Button, Dropdown, Tooltip, toast } from "@heroui/react";
import {
	ArrowUp,
	BookOpen,
	FileUp,
	LibraryBig,
	PenSquare,
	Plus,
	Square,
} from "lucide-react";
import { memo, useRef, useState } from "react";
import {
	type ChatContextItem,
	MAX_CHAT_ATTACHMENTS,
} from "../../../../types/chatContext";
import { MaterialLibraryPicker } from "./MaterialLibraryPicker";
import { StudioDocumentPicker } from "./StudioDocumentPicker";
import {
	getUnsupportedFileReason,
	importChatFile,
	isImportableChatFile,
} from "./utils/chatFileImport";
import { VaultNotePicker } from "./VaultNotePicker";

export interface ChatInputBottomBarProps {
	isLoading: boolean;
	canSend: boolean;
	onSend: () => void;
	onStop?: () => void;
	/** 图片/附件选好后作为 context item 注入 */
	onAttachContextItem?: (item: ChatContextItem) => void;
	/** 批量注入 context items */
	onAttachContextItems?: (items: ChatContextItem[]) => void;
	/** 当前已附加的附件数量 */
	contextItemsCount?: number;
}

/**
 * Bottom action toolbar inside the chat input card:
 * 左侧 + 附件菜单（向上弹出的浮层，当前仅上传图片），右侧发送/停止按钮。
 */
export const ChatInputBottomBar = memo(function ChatInputBottomBar({
	isLoading,
	canSend,
	onSend,
	onStop,
	onAttachContextItem,
	onAttachContextItems,
	contextItemsCount = 0,
}: ChatInputBottomBarProps) {
	// 统一的文件选择器（支持图片、Word/PDF/Excel/TXT/CSV 等文档）
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	// 创作素材库选择对话框（从素材库导入已有素材）
	const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
	// 创作台文档选择对话框（从创作台导入已有文档）
	const [documentPickerOpen, setDocumentPickerOpen] = useState(false);
	// 笔记库选择对话框（从本地知识库导入已有笔记）
	const [notePickerOpen, setNotePickerOpen] = useState(false);

	const isMaxReached = contextItemsCount >= MAX_CHAT_ATTACHMENTS;
	const remainingQuota = Math.max(0, MAX_CHAT_ATTACHMENTS - contextItemsCount);

	const handleBatchAttach = (items: ChatContextItem[]) => {
		if (!items || items.length === 0) return;
		if (onAttachContextItems) {
			onAttachContextItems(items);
		} else if (onAttachContextItem) {
			for (const item of items) {
				onAttachContextItem(item);
			}
		}
	};

	const handlePickFile = () => {
		if (isMaxReached) {
			toast.warning(`最多只能添加 ${MAX_CHAT_ATTACHMENTS} 个附件`);
			return;
		}
		fileInputRef.current?.click();
	};

	const handleOpenMaterialPicker = () => {
		if (isMaxReached) {
			toast.warning(
				`最多只能添加 ${MAX_CHAT_ATTACHMENTS} 个附件，请先移除部分附件`,
			);
			return;
		}
		setMaterialPickerOpen(true);
	};

	const handleOpenDocumentPicker = () => {
		if (isMaxReached) {
			toast.warning(
				`最多只能添加 ${MAX_CHAT_ATTACHMENTS} 个附件，请先移除部分附件`,
			);
			return;
		}
		setDocumentPickerOpen(true);
	};

	const handleOpenNotePicker = () => {
		if (isMaxReached) {
			toast.warning(
				`最多只能添加 ${MAX_CHAT_ATTACHMENTS} 个附件，请先移除部分附件`,
			);
			return;
		}
		setNotePickerOpen(true);
	};

	const handleFilesChosen = async (files: FileList | null) => {
		if (!files || (!onAttachContextItem && !onAttachContextItems)) return;
		if (isMaxReached) {
			toast.warning(`最多只能添加 ${MAX_CHAT_ATTACHMENTS} 个附件`);
			if (fileInputRef.current) fileInputRef.current.value = "";
			return;
		}

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
				if (item) parsedItems.push(item);
			} catch (err) {
				toast.danger(
					err instanceof Error ? err.message : `「${file.name}」导入失败`,
				);
			}
		}

		if (parsedItems.length > 0) {
			handleBatchAttach(parsedItems);
		}
		if (fileInputRef.current) fileInputRef.current.value = "";
	};

	return (
		<div className="flex items-center justify-between pt-2 px-0.5">
			{/* Left: + Attachment Menu（向上弹出） */}
			<div className="flex items-center gap-1.5">
				{(onAttachContextItem || onAttachContextItems) && (
					<>
						{/* 统一上传文件：图片 / 办公文档 / 笔记与画板 / 纯文本代码 */}
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*,.txt,.md,.markdown,.csv,.json,.log,.yaml,.yml,.xml,.html,.css,.ts,.tsx,.js,.jsx,.py,.sql,.docx,.pdf,.xlsx,.xls,.canvas,.excalidraw"
							multiple
							className="hidden"
							onChange={(e) => void handleFilesChosen(e.target.files)}
						/>
						{/* 素材库导入：从创作模块素材库挑选已有素材（SQLite 托管，服务端按 id 取全文注入） */}
						<MaterialLibraryPicker
							isOpen={materialPickerOpen}
							onClose={() => setMaterialPickerOpen(false)}
							onPick={(item) => onAttachContextItem?.(item)}
							onPickBatch={handleBatchAttach}
							maxSelectable={remainingQuota}
						/>
						{/* 创作台导入：从创作台挑选已有文档 */}
						<StudioDocumentPicker
							isOpen={documentPickerOpen}
							onClose={() => setDocumentPickerOpen(false)}
							onPick={(item) => onAttachContextItem?.(item)}
							onPickBatch={handleBatchAttach}
							maxSelectable={remainingQuota}
						/>
						{/* 笔记导入：从本地知识库挑选已有笔记 */}
						<VaultNotePicker
							isOpen={notePickerOpen}
							onClose={() => setNotePickerOpen(false)}
							onPick={(item) => onAttachContextItem?.(item)}
							onPickBatch={handleBatchAttach}
							maxSelectable={remainingQuota}
						/>
						<Dropdown>
							<Tooltip>
								<Tooltip.Trigger>
									<Dropdown.Trigger
										aria-label="添加附件"
										className={`h-7 w-7 p-0 flex items-center justify-center rounded-full cursor-pointer transition-colors border ${
											isMaxReached
												? "text-amber-500 hover:text-amber-600 bg-amber-500/10 border-amber-500/30"
												: "text-muted hover:text-foreground hover:bg-surface-secondary/80 border-border/50"
										}`}
									>
										<Plus className="w-4 h-4" />
									</Dropdown.Trigger>
								</Tooltip.Trigger>
								<Tooltip.Content className="text-xs py-1 px-2">
									{isMaxReached
										? `已达附件上限 (${contextItemsCount}/${MAX_CHAT_ATTACHMENTS})`
										: contextItemsCount > 0
											? `添加附件 (${contextItemsCount}/${MAX_CHAT_ATTACHMENTS})`
											: `添加附件 (最多 ${MAX_CHAT_ATTACHMENTS} 个)`}
								</Tooltip.Content>
							</Tooltip>
							<Dropdown.Popover
								placement="top start"
								className="min-w-[200px] p-1 shadow-lg border border-border/80 rounded-xl bg-surface"
							>
								<Dropdown.Menu aria-label="添加附件">
									<Dropdown.Item
										id="upload-file"
										textValue="上传文件"
										onAction={handlePickFile}
									>
										<div className="flex items-center gap-2.5 py-1">
											<FileUp className="w-4 h-4 text-blue-500 shrink-0" />
											<div className="flex flex-col min-w-0">
												<span className="text-xs font-medium">上传文件</span>
												<span className="text-[10px] text-muted/70">
													图片 / 文档 / Canvas / MD / 表格 / 代码
												</span>
											</div>
										</div>
									</Dropdown.Item>
									<Dropdown.Item
										id="import-material"
										textValue="素材库导入"
										onAction={handleOpenMaterialPicker}
									>
										<div className="flex items-center gap-2.5 py-1">
											<LibraryBig className="w-4 h-4 text-violet-500 shrink-0" />
											<div className="flex flex-col min-w-0">
												<span className="text-xs font-medium">素材库导入</span>
												<span className="text-[10px] text-muted/70">
													从创作素材库挑选已有素材
												</span>
											</div>
										</div>
									</Dropdown.Item>
									<Dropdown.Item
										id="import-document"
										textValue="创作台导入"
										onAction={handleOpenDocumentPicker}
									>
										<div className="flex items-center gap-2.5 py-1">
											<PenSquare className="w-4 h-4 text-amber-500 shrink-0" />
											<div className="flex flex-col min-w-0">
												<span className="text-xs font-medium">创作台导入</span>
												<span className="text-[10px] text-muted/70">
													从创作台挑选已有文档
												</span>
											</div>
										</div>
									</Dropdown.Item>
									<Dropdown.Item
										id="import-note"
										textValue="笔记导入"
										onAction={handleOpenNotePicker}
									>
										<div className="flex items-center gap-2.5 py-1">
											<BookOpen className="w-4 h-4 text-emerald-500 shrink-0" />
											<div className="flex flex-col min-w-0">
												<span className="text-xs font-medium">笔记导入</span>
												<span className="text-[10px] text-muted/70">
													从本地知识库挑选已有笔记
												</span>
											</div>
										</div>
									</Dropdown.Item>
								</Dropdown.Menu>
							</Dropdown.Popover>
						</Dropdown>
					</>
				)}
			</div>

			{/* Right: Send / Stop Action Button */}
			<div className="flex items-center gap-1">
				{isLoading ? (
					<Tooltip>
						<Tooltip.Trigger>
							<Button
								variant="secondary"
								size="sm"
								isIconOnly
								className="h-7 w-7 rounded-full border border-danger/30 bg-danger/10 hover:bg-danger/20 text-danger flex items-center justify-center cursor-pointer shadow-2xs group transition-all"
								onPress={onStop}
								aria-label="停止回答"
							>
								<Square className="w-2.5 h-2.5 fill-current group-hover:scale-90 transition-transform" />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content className="text-xs py-1 px-2">
							停止回答
						</Tooltip.Content>
					</Tooltip>
				) : (
					<Tooltip>
						<Tooltip.Trigger>
							<Button
								variant={canSend ? "primary" : "secondary"}
								size="sm"
								isIconOnly
								className={`h-7 w-7 rounded-xl flex items-center justify-center cursor-pointer transition-all shadow-xs ${
									canSend
										? "bg-accent text-accent-foreground hover:opacity-90 shadow-accent/20"
										: "bg-surface-secondary text-muted/50 border border-border/40 cursor-not-allowed opacity-60"
								}`}
								onPress={() => {
									if (canSend) onSend();
								}}
								isDisabled={!canSend}
								aria-label="发送消息"
							>
								<ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content className="text-xs py-1 px-2">
							发送 (Enter)
						</Tooltip.Content>
					</Tooltip>
				)}
			</div>
		</div>
	);
});
