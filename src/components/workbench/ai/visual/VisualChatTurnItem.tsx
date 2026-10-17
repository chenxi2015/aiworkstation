import { Tooltip, toast } from "@heroui/react";
import {
	Check,
	Copy,
	Download,
	FileText,
	Maximize2,
	Pencil,
	Sparkles,
	Trash2,
} from "lucide-react";
import { memo, useState } from "react";
import type { PageBridge } from "../../../../types/pageBridge.ts";
import type { VisualGenerationItem } from "../../../../types/visualGeneration.ts";
import { MessageEditInlineInput } from "../chat/inline/MessageEditInlineInput.tsx";
import { useImagePreview } from "../shared/ImagePreviewModal.tsx";

export interface VisualChatTurnItemProps {
	item: VisualGenerationItem;
	pageBridge?: PageBridge | null;
	isSelectMode?: boolean;
	isSelected?: boolean;
	onToggleSelect?: (id: string) => void;
	onDeleteItem?: (id: string) => void;
	onStartSelectDelete?: (id: string) => void;
	onEditAndResend?: (item: VisualGenerationItem, newPrompt: string) => void;
	isGenerating?: boolean;
}

/** Helper to map ratio string (16:9, 1:1, etc.) to valid CSS aspect-ratio */
export function getAspectRatioCss(ratio?: string): string {
	if (!ratio || ratio === "auto") return "16 / 9";
	const parts = ratio.split(":");
	if (parts.length === 2) {
		return `${parts[0]} / ${parts[1]}`;
	}
	return "16 / 9";
}

/**
 * Single turn in the visual chat stream:
 * - Top-right: User prompt bubble matching UserMessageBubble style and hover actions.
 * - Bottom-left: Assistant generated image/video card with brand header, hover action bar and metadata.
 */
export const VisualChatTurnItem = memo(function VisualChatTurnItem({
	item,
	pageBridge,
	isSelectMode = false,
	isSelected = false,
	onToggleSelect,
	onDeleteItem,
	onStartSelectDelete,
	onEditAndResend,
	isGenerating = false,
}: VisualChatTurnItemProps) {
	const { openPreview } = useImagePreview();
	const [isImageLoaded, setIsImageLoaded] = useState(false);
	const [isEditing, setIsEditing] = useState(false);
	const [copied, setCopied] = useState(false);

	const handleCopyPrompt = async () => {
		try {
			await navigator.clipboard.writeText(item.prompt);
			setCopied(true);
			toast.success("已复制到剪贴板");
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.warning("复制失败");
		}
	};

	const handleSaveEdit = (newPrompt: string) => {
		const trimmed = newPrompt.trim();
		if (!trimmed) return;
		setIsEditing(false);
		onEditAndResend?.(item, trimmed);
	};

	const handleInsertToDoc = async () => {
		const markdownSnippet = `\n![${item.prompt.slice(0, 30)}](${item.url})\n`;
		const insertAction = pageBridge?.actions.find(
			(a) =>
				a.id === "insert_at_cursor" ||
				a.id.includes("insert") ||
				a.id === "append_text",
		);

		if (insertAction) {
			try {
				await insertAction.onAction(markdownSnippet);
				toast.success("已将生成的图像插入到当前文档中");
				return;
			} catch (err) {
				console.warn("[VisualChatTurnItem] Insert action failed:", err);
			}
		}

		try {
			await navigator.clipboard.writeText(markdownSnippet);
			toast.info("已复制 Markdown 图像语法到剪贴板，可粘贴至任意文档");
		} catch {
			toast.warning("复制到剪贴板失败，请手动复制");
		}
	};

	const handleCopyUrl = async () => {
		try {
			await navigator.clipboard.writeText(item.url);
			toast.success("已复制媒体链接到剪贴板");
		} catch {
			toast.warning("复制链接失败");
		}
	};

	const handleDownload = () => {
		const a = document.createElement("a");
		a.href = item.url;
		const ext =
			item.mediaType === "video" || item.url.endsWith(".mp4") ? "mp4" : "png";
		a.download = `visual-${item.model}-${Date.now()}.${ext}`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		toast.success(
			item.mediaType === "video" ? "已开始下载视频" : "已开始下载图像",
		);
	};

	// 1. Batch delete selection mode: render selectable item card matching ChatMessageItem
	if (isSelectMode) {
		return (
			<button
				type="button"
				onClick={() => onToggleSelect?.(item.id)}
				className={`w-full flex items-start gap-3 p-3 rounded-2xl border transition-all text-left cursor-pointer ${
					isSelected
						? "bg-accent/10 border-accent shadow-xs"
						: "bg-surface hover:bg-surface-secondary/70 border-border/60"
				}`}
			>
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

				<div className="flex-1 min-w-0 flex flex-col gap-1.5">
					<div className="flex items-center gap-1.5 text-[10px] text-muted">
						<span className="font-medium text-foreground">AI 视觉</span>
						<span>
							·{" "}
							{new Date(item.createdAt).toLocaleTimeString([], {
								hour: "2-digit",
								minute: "2-digit",
							})}
						</span>
						<span>· {item.model}</span>
					</div>

					<div className="text-xs text-foreground leading-relaxed line-clamp-2">
						{item.prompt}
					</div>

					<div className="flex items-center gap-2 pt-1">
						{item.mediaType === "video" || item.url.endsWith(".mp4") ? (
							<div className="w-14 h-14 rounded-lg bg-black/30 flex items-center justify-center text-[10px] text-muted shrink-0 overflow-hidden">
								{/* biome-ignore lint/a11y/useMediaCaption: thumbnail preview does not need captions */}
								<video src={item.url} className="w-full h-full object-cover" />
							</div>
						) : (
							<img
								src={item.url}
								alt={item.prompt}
								className="w-14 h-14 rounded-lg object-cover bg-surface-secondary shrink-0"
							/>
						)}
						<div className="text-[10px] text-muted flex flex-col gap-0.5">
							<span>
								{item.aspectRatio} · {item.resolution}
							</span>
							<span>
								{item.mediaType === "video" ? "视频生成" : "图像生成"}
							</span>
						</div>
					</div>
				</div>
			</button>
		);
	}

	return (
		<div className="flex flex-col gap-3 py-1">
			{/* 1. User Prompt Bubble (Aligned Right, matching chat message bubble) */}
			<div className="flex flex-col items-end gap-1 self-end w-full max-w-[85%] sm:max-w-[75%] group">
				{isEditing ? (
					<MessageEditInlineInput
						initialContent={item.prompt}
						onSave={handleSaveEdit}
						onCancel={() => setIsEditing(false)}
						isLoading={isGenerating}
						submitTooltip="保存并重新生成 (Enter)"
					/>
				) : (
					<>
						{/* Prompt card bubble matching UserMessageBubble */}
						<div className="bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-2xl px-4 py-2 text-sm leading-relaxed font-normal shadow-2xs select-text">
							{item.prompt}
						</div>

						{/* User Action bar below bubble (Copy, Edit, Delete) with hover opacity */}
						<div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-0.5 text-muted text-xs px-1">
							{/* Copy */}
							<Tooltip>
								<Tooltip.Trigger>
									<button
										type="button"
										onClick={handleCopyPrompt}
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

							{/* Delete */}
							<Tooltip>
								<Tooltip.Trigger>
									<button
										type="button"
										onClick={() =>
											onStartSelectDelete
												? onStartSelectDelete(item.id)
												: onDeleteItem?.(item.id)
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
			</div>

			{/* 2. Assistant Generated Media Card (Aligned Left) */}
			<div className="flex flex-col items-start gap-1.5 self-start w-full max-w-[440px]">
				{/* Assistant Brand Header matching Chat */}
				<div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 select-none pb-0.5">
					<div className="w-4 h-4 rounded-full bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-500 flex items-center justify-center text-white shrink-0 shadow-2xs">
						<Sparkles className="w-2.5 h-2.5 text-white" />
					</div>
					<span>AI 视觉</span>
				</div>
				<div className="group relative w-full rounded-2xl bg-surface transition-all overflow-hidden">
					{/* Media container */}
					<div className="relative bg-surface-secondary/30 overflow-hidden">
						{item.mediaType === "video" || item.url.endsWith(".mp4") ? (
							// biome-ignore lint/a11y/useMediaCaption: generated video does not provide captions
							<video
								src={item.url}
								controls
								playsInline
								className="w-full max-h-[380px] object-contain rounded-2xl bg-black/40"
							/>
						) : (
							<div
								className="relative w-full overflow-hidden flex items-center justify-center"
								style={{
									aspectRatio: !isImageLoaded
										? getAspectRatioCss(item.aspectRatio)
										: undefined,
								}}
							>
								{/* Animated gradient placeholder when image is loading */}
								{!isImageLoaded && (
									<div className="absolute inset-0 bg-gradient-to-r from-blue-400/25 via-purple-400/30 to-pink-400/25 animate-visual-gradient flex items-center justify-center">
										{/* Shimmer sweep effect */}
										<div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-visual-shimmer pointer-events-none" />
										<div className="relative z-10 flex items-center gap-1.5 text-xs text-muted-foreground/80 font-medium">
											<Sparkles className="w-3.5 h-3.5 animate-spin [animation-duration:8s]" />
											<span>加载中...</span>
										</div>
									</div>
								)}

								{/* biome-ignore lint/a11y/useKeyWithClickEvents: preview triggered by image click */}
								<img
									src={item.url}
									alt={item.prompt}
									loading="lazy"
									onLoad={() => setIsImageLoaded(true)}
									className={`w-full max-h-[380px] rounded-2xl object-contain transition-all duration-300 group-hover:scale-[1.01] cursor-pointer ${
										isImageLoaded ? "opacity-100" : "opacity-0"
									}`}
									onClick={() =>
										openPreview({
											src: item.url,
											title: item.prompt,
											subtitle: `${item.model} · ${item.aspectRatio} · ${item.resolution}`,
										})
									}
								/>
							</div>
						)}

						{/* Hover Quick Action Floating Pill */}
						<div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-md p-1 rounded-xl shadow-md">
							<Tooltip>
								<Tooltip.Trigger>
									<button
										type="button"
										onClick={() =>
											openPreview({
												src: item.url,
												title: item.prompt,
												subtitle: `${item.model} · ${item.aspectRatio}`,
											})
										}
										className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
										aria-label="放大预览"
									>
										<Maximize2 className="w-3.5 h-3.5" />
									</button>
								</Tooltip.Trigger>
								<Tooltip.Content className="text-xs py-1 px-2">
									放大查看
								</Tooltip.Content>
							</Tooltip>

							<Tooltip>
								<Tooltip.Trigger>
									<button
										type="button"
										onClick={handleInsertToDoc}
										className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
										aria-label="插入到当前文档"
									>
										<FileText className="w-3.5 h-3.5" />
									</button>
								</Tooltip.Trigger>
								<Tooltip.Content className="text-xs py-1 px-2">
									插入当前文档
								</Tooltip.Content>
							</Tooltip>

							<Tooltip>
								<Tooltip.Trigger>
									<button
										type="button"
										onClick={handleCopyUrl}
										className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
										aria-label="复制链接"
									>
										<Copy className="w-3.5 h-3.5" />
									</button>
								</Tooltip.Trigger>
								<Tooltip.Content className="text-xs py-1 px-2">
									复制链接
								</Tooltip.Content>
							</Tooltip>

							<Tooltip>
								<Tooltip.Trigger>
									<button
										type="button"
										onClick={handleDownload}
										className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
										aria-label="下载媒体"
									>
										<Download className="w-3.5 h-3.5" />
									</button>
								</Tooltip.Trigger>
								<Tooltip.Content className="text-xs py-1 px-2">
									下载媒体
								</Tooltip.Content>
							</Tooltip>
						</div>
					</div>

					{/* Minimalist Metadata Footer */}
					<div className="px-3 py-1.5 flex items-center justify-between text-[10px] text-muted/70 select-none border-t border-border/30">
						<div className="flex items-center gap-1.5">
							{item.mediaType === "video" && (
								<span className="text-purple-600 dark:text-purple-400 font-medium">
									视频
								</span>
							)}
							<span>{item.aspectRatio}</span>
							<span className="opacity-40">·</span>
							<span>{item.resolution}</span>
							{item.duration && (
								<>
									<span className="opacity-40">·</span>
									<span>{item.duration}s</span>
								</>
							)}
						</div>
						<span className="text-[10px] text-muted/50 shrink-0">
							{new Date(item.createdAt).toLocaleTimeString([], {
								hour: "2-digit",
								minute: "2-digit",
							})}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
});
