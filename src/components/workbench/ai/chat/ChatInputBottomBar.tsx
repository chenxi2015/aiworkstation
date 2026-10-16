import { Button, Dropdown, toast, Tooltip } from "@heroui/react";
import {
	ArrowUp,
	FileUp,
	ImagePlus,
	LibraryBig,
	Plus,
	Square,
} from "lucide-react";
import { memo, useRef, useState } from "react";
import type { ChatContextItem } from "../../../../types/chatContext";
import { MaterialLibraryPicker } from "./MaterialLibraryPicker";
import { importChatFile, isImportableChatFile } from "./utils/chatFileImport";

export interface ChatInputBottomBarProps {
	isLoading: boolean;
	canSend: boolean;
	onSend: () => void;
	onStop?: () => void;
	/** 图片/附件选好后作为 context item 注入 */
	onAttachContextItem?: (item: ChatContextItem) => void;
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
}: ChatInputBottomBarProps) {
	// 隐藏的文件选择器（仅图片）
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	// 本地文档上传选择器（Word/PDF/Excel/TXT，提取纯文本进对话）
	const docInputRef = useRef<HTMLInputElement | null>(null);
	// 创作素材库选择对话框（从素材库导入已有素材）
	const [materialPickerOpen, setMaterialPickerOpen] = useState(false);

	const handlePickImages = () => {
		fileInputRef.current?.click();
	};

	const handlePickDocs = () => {
		docInputRef.current?.click();
	};

	const handleFilesChosen = (files: FileList | null) => {
		if (!files || !onAttachContextItem) return;
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (!file.type.startsWith("image/")) continue;
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
		}
		// 重置以便连续选同一文件也能触发 change
		if (fileInputRef.current) fileInputRef.current.value = "";
	};

	/**
	 * 本地文档上传：提取纯文本注入对话上下文。
	 * 音频/视频刻意不支持——当前 AI 走 OpenAI 兼容 chat 协议，消息体没有音/视频输入段，
	 * 且本地无 ASR 转写流水线，模型无法读取其内容；选择时明确 toast 告知原因。
	 */
	const handleDocsChosen = async (files: FileList | null) => {
		if (!files || !onAttachContextItem) return;
		let rejectedMedia = 0;
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (!isImportableChatFile(file)) {
				if (file.type.startsWith("audio/") || file.type.startsWith("video/")) {
					rejectedMedia++;
				} else {
					toast.warning(`「${file.name}」格式暂不支持（仅支持图片与文档）`);
				}
				continue;
			}
			try {
				const item = await importChatFile(file, i);
				if (item) onAttachContextItem(item);
			} catch (err) {
				toast.danger(
					err instanceof Error ? err.message : `「${file.name}」导入失败`,
				);
			}
		}
		if (rejectedMedia > 0) {
			toast.warning(
				`已跳过 ${rejectedMedia} 个音视频文件：当前模型接口不支持读取音视频内容（需 ASR 转写能力，后续版本支持）`,
			);
		}
		if (docInputRef.current) docInputRef.current.value = "";
	};

	return (
		<div className="flex items-center justify-between pt-2 px-0.5">
			{/* Left: + Attachment Menu（向上弹出） */}
			<div className="flex items-center gap-1.5">
				{onAttachContextItem && (
					<>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							multiple
							className="hidden"
							onChange={(e) => handleFilesChosen(e.target.files)}
						/>
						{/* 本地文档上传：Word/PDF/Excel/TXT 提取纯文本进对话（音视频因模型接口限制不支持，选中时 toast 说明） */}
						<input
							ref={docInputRef}
							type="file"
							accept="image/*,.txt,.md,.markdown,.csv,.json,.log,.docx,.pdf,.xlsx,.xls"
							multiple
							className="hidden"
							onChange={(e) => void handleDocsChosen(e.target.files)}
						/>
						{/* 素材库导入：从创作模块素材库挑选已有素材（SQLite 托管，服务端按 id 取全文注入） */}
						<MaterialLibraryPicker
							isOpen={materialPickerOpen}
							onClose={() => setMaterialPickerOpen(false)}
							onPick={(item) => onAttachContextItem(item)}
						/>
						<Dropdown>
							<Dropdown.Trigger
								aria-label="添加附件"
								className="h-7 w-7 p-0 flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-secondary/80 rounded-full cursor-pointer transition-colors border border-border/50"
							>
								<Plus className="w-4 h-4" />
							</Dropdown.Trigger>
							<Dropdown.Popover
								placement="top start"
								className="min-w-[200px] p-1 shadow-lg border border-border/80 rounded-xl bg-surface"
							>
								<Dropdown.Menu aria-label="添加附件">
									<Dropdown.Item
										id="upload-image"
										textValue="上传图片"
										onAction={handlePickImages}
									>
										<div className="flex items-center gap-2.5 py-1">
											<ImagePlus className="w-4 h-4 text-blue-500 shrink-0" />
											<span className="text-xs font-medium">上传图片</span>
										</div>
									</Dropdown.Item>
									<Dropdown.Item
										id="upload-doc"
										textValue="上传文档"
										onAction={handlePickDocs}
									>
										<div className="flex items-center gap-2.5 py-1">
											<FileUp className="w-4 h-4 text-emerald-500 shrink-0" />
											<div className="flex flex-col min-w-0">
												<span className="text-xs font-medium">上传文档</span>
												<span className="text-[10px] text-muted/70">
													Word / PDF / Excel / TXT 提取正文
												</span>
											</div>
										</div>
									</Dropdown.Item>
									<Dropdown.Item
										id="import-material"
										textValue="素材库导入"
										onAction={() => setMaterialPickerOpen(true)}
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
								className="h-7 w-7 rounded-xl border border-danger/30 bg-danger/10 hover:bg-danger/20 text-danger flex items-center justify-center cursor-pointer shadow-2xs group transition-all"
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
