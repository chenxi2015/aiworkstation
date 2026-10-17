import { Tooltip, toast } from "@heroui/react";
import {
	Box,
	FileText,
	Folder as FolderIcon,
	Globe,
	LayoutDashboard,
	PenSquare,
	Sparkles,
	Tag,
	X,
} from "lucide-react";
import { memo, useState } from "react";
import { fetchMaterials } from "../../../../services/api/creatorClient";
import type { ChatContextItem } from "../../../../types/chatContext";
import { MaterialAudioModal } from "../../../creator/materials/MaterialAudioModal";
import { MaterialDocModal } from "../../../creator/materials/MaterialDocModal";
import { MaterialImageModal } from "../../../creator/materials/MaterialImageModal";
import { MaterialVideoModal } from "../../../creator/materials/MaterialVideoModal";
import { KIND_CONFIG } from "../../../creator/materials/types";
import {
	getAudioAssets,
	getImageAssets,
	getMaterialKind,
	getVideoAssets,
} from "../../../creator/materials/utils";
import type { Material } from "../../../creator/types";
import {
	isImageFile,
	vaultAssetUrl,
} from "../../../obsidian/utils/vaultFileUtils";
import type { Category } from "../../types";
import { useImagePreview } from "../shared/ImagePreviewModal";

export interface ChatContextBarProps {
	items: ChatContextItem[];
	onRemove?: (id: string) => void;
	onNavigateToFolder?: (
		folderId: number | null,
		category?: Category,
		targetItemId?: string | number,
	) => void;
	className?: string;
	layout?: "scroll" | "wrap";
	align?: "left" | "right";
}

/** Resolves preview image source and whether the context item is an image */
export function resolveAttachmentImage(item: ChatContextItem): {
	imgSrc: string;
	isImage: boolean;
} {
	const noteImgSrc =
		item.notePath && isImageFile(item.notePath)
			? vaultAssetUrl(item.notePath)
			: "";
	const titleImgSrc =
		!noteImgSrc && isImageFile(item.title) ? vaultAssetUrl(item.title) : "";
	const imgSrc = item.thumbnail || item.url || noteImgSrc || titleImgSrc || "";
	const isImage = Boolean(
		imgSrc &&
			(item.type === "image" ||
				(item.type === "material" && item.data?.materialKind === "image") ||
				(item.notePath && isImageFile(item.notePath)) ||
				isImageFile(item.title) ||
				Boolean(item.thumbnail)),
	);
	return { imgSrc, isImage };
}

/** 获取卡片左上角的文件格式或类型徽章（自适应明亮与暗黑模式，贴合图一） */
function renderFileTypeBadge(item: ChatContextItem) {
	if (
		item.id === "__active_scope__" ||
		item.id?.startsWith("__active_scope__")
	) {
		return (
			<div className="w-4 h-4 rounded-md bg-blue-500/15 text-blue-600 dark:bg-blue-500/25 dark:text-blue-400 flex items-center justify-center">
				<Sparkles className="w-2.5 h-2.5" />
			</div>
		);
	}

	if (
		item.type === "split_practice" ||
		(item.type as string) === "split_practice"
	) {
		return (
			<div className="w-4 h-4 rounded-md bg-accent/15 text-accent flex items-center justify-center">
				<Sparkles className="w-2.5 h-2.5" />
			</div>
		);
	}

	const rawName = (item.title || item.notePath || "").toLowerCase();
	const ext = rawName.includes(".") ? rawName.split(".").pop() || "" : "";

	if (ext === "csv") {
		return (
			<span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 tracking-wider">
				CSV
			</span>
		);
	}
	if (ext === "doc" || ext === "docx") {
		return (
			<div
				className="w-[18px] h-[20px] rounded-[3px] bg-white dark:bg-zinc-900 shadow-xs border border-blue-200/80 dark:border-blue-900 flex flex-col items-center justify-center overflow-hidden shrink-0"
				title="Word 文档"
			>
				<div className="w-full h-1.5 bg-[#185abd]" />
				<span className="text-[10px] font-black text-[#185abd] leading-none my-auto">
					W
				</span>
			</div>
		);
	}
	if (ext === "xls" || ext === "xlsx") {
		return (
			<div
				className="w-[18px] h-[20px] rounded-[3px] bg-white dark:bg-zinc-900 shadow-xs border border-emerald-200/80 dark:border-emerald-900 flex flex-col items-center justify-center overflow-hidden shrink-0"
				title="Excel 表格"
			>
				<div className="w-full h-1.5 bg-[#107c41]" />
				<span className="text-[10px] font-black text-[#107c41] leading-none my-auto">
					X
				</span>
			</div>
		);
	}
	if (ext === "pdf") {
		return (
			<div
				className="w-[18px] h-[20px] rounded-[3px] bg-white dark:bg-zinc-900 shadow-xs border border-rose-200/80 dark:border-rose-900 flex flex-col items-center justify-center overflow-hidden shrink-0"
				title="PDF 文档"
			>
				<div className="w-full h-1.5 bg-[#ea4335]" />
				<span className="text-[7.5px] font-black text-[#ea4335] leading-none my-auto">
					PDF
				</span>
			</div>
		);
	}
	if (ext === "canvas" || item.notePath?.endsWith(".canvas")) {
		return (
			<div
				className="w-5 h-5 rounded-md bg-indigo-500/15 dark:bg-indigo-500/25 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0"
				title="白板画布"
			>
				<LayoutDashboard className="w-3 h-3" />
			</div>
		);
	}
	if (item.type === "note" || ext === "md" || ext === "markdown") {
		return (
			<div
				className="w-5 h-5 rounded-md bg-violet-500/15 dark:bg-violet-500/25 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0"
				title="笔记"
			>
				<FileText className="w-3 h-3" />
			</div>
		);
	}
	if (item.type === "document") {
		return (
			<div
				className="w-5 h-5 rounded-md bg-amber-500/15 dark:bg-amber-500/25 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0"
				title="创作文档"
			>
				<PenSquare className="w-3 h-3" />
			</div>
		);
	}
	if (item.type === "folder") {
		return (
			<FolderIcon className="w-4 h-4 text-amber-500 fill-amber-500/20 shrink-0" />
		);
	}
	if (item.type === "bookmark") {
		if (item.icon) {
			return (
				<img
					src={item.icon}
					alt=""
					className="w-4 h-4 rounded-xs object-contain"
					onError={(e) => {
						(e.currentTarget as HTMLElement).style.display = "none";
					}}
				/>
			);
		}
		return <Globe className="w-4 h-4 text-blue-500 shrink-0" />;
	}
	if (item.type === "tag") {
		return <Tag className="w-4 h-4 text-violet-500 shrink-0" />;
	}
	if ((item.type as string) === "skill") {
		return <Box className="w-4 h-4 text-blue-500 shrink-0" />;
	}
	if (item.type === "material") {
		const kindKey = (item.data?.materialKind ??
			"doc") as keyof typeof KIND_CONFIG;
		const MaterialKindIcon = KIND_CONFIG[kindKey]?.icon ?? FileText;
		const iconClass = KIND_CONFIG[kindKey]?.iconClass ?? "text-muted";
		return <MaterialKindIcon className={`w-4 h-4 shrink-0 ${iconClass}`} />;
	}
	if (ext.length > 0 && ext.length <= 4) {
		return (
			<span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-tight">
				{ext}
			</span>
		);
	}
	return (
		<FileText className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" />
	);
}

export interface ChatContextCardProps {
	item: ChatContextItem;
	onRemove?: (id: string) => void;
	onClick?: (item: ChatContextItem) => void;
	isClickable?: boolean;
}

/**
 * Individual context attachment card supporting both image thumbnails (with gradient title overlay)
 * and rich document/entity cards.
 */
export const ChatContextCard = memo(function ChatContextCard({
	item,
	onRemove,
	onClick,
	isClickable = true,
}: ChatContextCardProps) {
	const { imgSrc, isImage } = resolveAttachmentImage(item);

	if (isImage && imgSrc) {
		// Image thumbnail card matching user screenshot (rounded square, bottom overlay label, optional remove button)
		return (
			<Tooltip key={item.id}>
				<Tooltip.Trigger className="outline-none block">
					<div
						className={`group relative w-[76px] h-[76px] rounded-xl shrink-0 select-none transition-all ${
							isClickable ? "cursor-pointer active:scale-95" : "cursor-default"
						}`}
						onClick={() => isClickable && onClick?.(item)}
					>
						<div className="w-full h-full rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-black/[0.08] dark:border-white/[0.1] shadow-2xs group-hover:shadow-xs relative">
							<img
								src={imgSrc}
								alt={item.title}
								draggable={false}
								className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105 pointer-events-none"
							/>
							{/* Bottom gradient overlay with title label matching screenshot */}
							<div className="absolute inset-x-0 bottom-0 pt-4 pb-1.5 px-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex items-end pointer-events-none">
								<span className="text-[11px] leading-tight font-medium text-white truncate drop-shadow-xs">
									{item.title}
								</span>
							</div>
						</div>
						{/* Optional remove button (rendered only when onRemove is passed) */}
						{onRemove && (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onRemove(item.id);
								}}
								className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-black/50 hover:bg-black/75 text-white shadow-xs flex items-center justify-center transition-colors cursor-pointer z-20 backdrop-blur-[2px]"
								aria-label={`移除 ${item.title}`}
							>
								<X className="w-2.5 h-2.5 stroke-[2.2]" />
							</button>
						)}
					</div>
				</Tooltip.Trigger>
				<Tooltip.Content className="text-xs py-1 px-2.5 rounded-lg bg-black text-white dark:bg-zinc-900 dark:text-zinc-100 shadow-xl border border-white/10 max-w-[240px] truncate select-none">
					{item.title}
				</Tooltip.Content>
			</Tooltip>
		);
	}

	// Document/Table/Code/Folder/Bookmark rounded card
	return (
		<Tooltip key={item.id}>
			<Tooltip.Trigger className="outline-none block">
				<div
					onClick={() => isClickable && onClick?.(item)}
					className={`group relative w-[76px] h-[76px] rounded-xl p-2 shrink-0 flex flex-col justify-between overflow-hidden bg-neutral-100 hover:bg-neutral-200/80 dark:bg-neutral-800 dark:hover:bg-neutral-750 text-neutral-800 dark:text-neutral-100 border border-black/[0.06] dark:border-white/[0.08] shadow-2xs select-none transition-all ${
						isClickable
							? "cursor-pointer active:scale-95 hover:shadow-xs"
							: "cursor-default"
					}`}
				>
					{/* Top row: badge icon on left, optional remove button on right */}
					<div className="flex items-center justify-between w-full">
						<div className="flex items-center min-w-0">
							{renderFileTypeBadge(item)}
						</div>
						{onRemove && (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onRemove(item.id);
								}}
								className="w-4 h-4 rounded-full bg-white dark:bg-zinc-700 shadow-xs flex items-center justify-center text-zinc-500 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer shrink-0 z-10"
								aria-label={`移除 ${item.title}`}
							>
								<X className="w-2.5 h-2.5 stroke-[2.2]" />
							</button>
						)}
					</div>

					{/* Bottom title with 2-line clamp */}
					<div className="text-[11px] leading-[13px] font-normal text-neutral-800 dark:text-neutral-200 group-hover:text-neutral-950 dark:group-hover:text-white line-clamp-2 break-all">
						{item.title}
					</div>
				</div>
			</Tooltip.Trigger>
			<Tooltip.Content className="text-xs py-1 px-2.5 rounded-lg bg-black text-white dark:bg-zinc-900 dark:text-zinc-100 shadow-xl border border-white/10 max-w-[240px] truncate select-none">
				{item.title}
			</Tooltip.Content>
		</Tooltip>
	);
});

/**
 * Reusable contextual attachment bar rendering file and media cards.
 * Can be reused in both the chat input area (scroll layout with remove)
 * and message bubbles (wrap layout, read-only).
 */
export const ChatContextBar = memo(function ChatContextBar({
	items,
	onRemove,
	onNavigateToFolder,
	className = "",
	layout = "scroll",
	align = "left",
}: ChatContextBarProps) {
	const { openPreview } = useImagePreview();
	const [materialPreview, setMaterialPreview] = useState<{
		kind: "video" | "image" | "audio" | "doc";
		material: Material;
	} | null>(null);
	const [, setMaterialLoadingId] = useState<string | null>(null);

	if (!items || items.length === 0) return null;

	/** 素材类型点击：拉取素材详情后按内容类型分派预览弹窗 */
	const handleMaterialClick = async (item: ChatContextItem) => {
		if (typeof item.materialId !== "number") return;
		setMaterialLoadingId(item.id);
		try {
			const materials = await fetchMaterials();
			const target = materials.find((m) => m.id === item.materialId);
			if (!target) {
				toast.warning("素材不存在或已被删除");
				return;
			}
			const kind = getMaterialKind(target);
			if (kind === "video" && getVideoAssets(target).length > 0) {
				setMaterialPreview({ kind: "video", material: target });
			} else if (kind === "image" && getImageAssets(target).length > 0) {
				setMaterialPreview({ kind: "image", material: target });
			} else if (kind === "audio" && getAudioAssets(target).length > 0) {
				setMaterialPreview({ kind: "audio", material: target });
			} else {
				setMaterialPreview({ kind: "doc", material: target });
			}
		} catch (err) {
			toast.danger(
				`加载素材失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setMaterialLoadingId(null);
		}
	};

	const handleItemClick = (item: ChatContextItem) => {
		const { imgSrc, isImage } = resolveAttachmentImage(item);

		if (isImage && imgSrc) {
			openPreview({
				src: imgSrc,
				title: item.title,
				subtitle: item.subtitle,
			});
			return;
		}

		if (item.type === "material") {
			void handleMaterialClick(item);
			return;
		}
		if (item.url) {
			window.open(item.url, "_blank", "noopener,noreferrer");
		} else if (typeof item.folderId === "number" && onNavigateToFolder) {
			onNavigateToFolder(item.folderId, item.category as Category);
			toast.success(`已定位到「${item.title}」文件夹`);
		}
	};

	const isItemClickable = (item: ChatContextItem) => {
		const { imgSrc, isImage } = resolveAttachmentImage(item);
		return (
			Boolean(item.url) ||
			(typeof item.folderId === "number" && Boolean(onNavigateToFolder)) ||
			(isImage && Boolean(imgSrc)) ||
			item.type === "material"
		);
	};

	const containerClass =
		layout === "wrap"
			? `flex items-center gap-2 flex-wrap ${
					align === "right" ? "justify-end" : "justify-start"
				} select-none animate-in fade-in duration-200 ${className}`
			: `flex items-center gap-2 overflow-x-auto py-1 px-0.5 no-scrollbar select-none animate-in fade-in duration-200 ${className}`;

	const renderCards = () =>
		items.map((item) => (
			<ChatContextCard
				key={item.id}
				item={item}
				onRemove={onRemove}
				onClick={handleItemClick}
				isClickable={isItemClickable(item)}
			/>
		));

	return (
		<>
			<div className={containerClass}>
				{layout === "scroll" ? (
					<div className="flex items-center gap-2 flex-nowrap shrink-0">
						{renderCards()}
					</div>
				) : (
					renderCards()
				)}
			</div>

			{/* 素材类型预览弹窗：视频 / 图片 / 音频 / 文档 */}
			<MaterialVideoModal
				isOpen={materialPreview?.kind === "video"}
				material={
					materialPreview?.kind === "video" ? materialPreview.material : null
				}
				onClose={() => setMaterialPreview(null)}
			/>
			<MaterialImageModal
				isOpen={materialPreview?.kind === "image"}
				material={
					materialPreview?.kind === "image" ? materialPreview.material : null
				}
				materials={
					materialPreview?.kind === "image" ? [materialPreview.material] : []
				}
				onClose={() => setMaterialPreview(null)}
			/>
			<MaterialAudioModal
				isOpen={materialPreview?.kind === "audio"}
				material={
					materialPreview?.kind === "audio" ? materialPreview.material : null
				}
				onClose={() => setMaterialPreview(null)}
			/>
			<MaterialDocModal
				isOpen={materialPreview?.kind === "doc"}
				material={
					materialPreview?.kind === "doc" ? materialPreview.material : null
				}
				onClose={() => setMaterialPreview(null)}
			/>
		</>
	);
});
