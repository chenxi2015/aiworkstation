import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	ArrowLeftRight,
	Check,
	Download,
	ExternalLink,
	HardDrive,
	Loader2,
	RefreshCw,
	Sparkles,
} from "lucide-react";
import type React from "react";
import type { ChangeEvent, FormEvent, RefObject } from "react";
import { MediaCompressPopover } from "./MediaCompressPopover";
import { MediaReplacePopover } from "./MediaReplacePopover";

interface MediaActionToolbarProps {
	toolbarRef?: RefObject<HTMLDivElement | null>;
	verticalPos?: "top" | "bottom";
	horizontalShift?: number;
	visible: boolean;
	isExternal: boolean;
	src: string;
	docId: number;
	textAlign: string;
	onSetAlignment: (
		alignment: "left" | "center" | "right",
	) => (e: React.MouseEvent) => void;
	downloading: boolean;
	downloadSuccess: boolean;
	originalSrc: string;
	downloadButtonText: string;
	downloadTooltip: string;
	onDownloadAction: (e: React.MouseEvent) => void;
	showReplaceModal: boolean;
	onOpenReplace: (e: React.MouseEvent) => void;
	showCompressModal: boolean;
	onOpenCompress: (e: React.MouseEvent) => void;
	onCloseCompress: () => void;
	onUpdateSrc: (newUrl: string) => void;
	onOpenSource: (e: React.MouseEvent) => void;

	// Replace popover props
	isVideo: boolean;
	uploading: boolean;
	uploadError: string | null;
	replaceUrlInput: string;
	fileInputRef: RefObject<HTMLInputElement | null>;
	onCloseReplace: () => void;
	onFileSelected: (e: ChangeEvent<HTMLInputElement>) => void;
	onRestoreOriginalSrc: (e: React.MouseEvent) => void;
	onConfirmUrlReplace: (e: FormEvent) => void;
	onUrlInputChange: (value: string) => void;
}

/**
 * Floating action toolbar for media elements (alignment, download/persist, compress, and replace)
 * Positioned inside the top-right corner of the media container for seamless hovering
 */
export function MediaActionToolbar({
	toolbarRef,
	visible,
	isExternal,
	src,
	docId,
	textAlign,
	onSetAlignment,
	downloading,
	downloadSuccess,
	originalSrc,
	downloadButtonText,
	downloadTooltip,
	onDownloadAction,
	showReplaceModal,
	onOpenReplace,
	showCompressModal,
	onOpenCompress,
	onCloseCompress,
	onUpdateSrc,
	onOpenSource,
	isVideo,
	uploading,
	uploadError,
	replaceUrlInput,
	fileInputRef,
	onCloseReplace,
	onFileSelected,
	onRestoreOriginalSrc,
	onConfirmUrlReplace,
	onUrlInputChange,
}: MediaActionToolbarProps) {
	return (
		<div
			ref={toolbarRef}
			role="toolbar"
			aria-label="媒体操作工具栏"
			onClick={(e) => e.stopPropagation()}
			onMouseDown={(e) => e.stopPropagation()}
			onKeyDown={(e) => e.stopPropagation()}
			className={`absolute top-2.5 right-2.5 z-30 media-action-toolbar flex items-center gap-1.5 p-1 bg-zinc-900/95 text-zinc-100 border border-zinc-700/80 rounded-lg shadow-xl backdrop-blur-md transition-all duration-150 whitespace-nowrap ${
				visible
					? "opacity-100 scale-100 pointer-events-auto"
					: "opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto"
			}`}
		>
			{/* Source badge: External vs Local - Clickable */}
			{isExternal ? (
				<button
					type="button"
					onClick={onOpenSource}
					title={`点击在新标签页打开原链接: ${src}`}
					className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/35 active:scale-95 text-amber-300 font-medium border border-amber-500/30 transition-all cursor-pointer"
				>
					<ExternalLink className="w-3 h-3" />
					外链
				</button>
			) : (
				<button
					type="button"
					onClick={onOpenSource}
					title={`点击在新标签页打开本地文件: ${src}`}
					className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/35 active:scale-95 text-emerald-300 font-medium border border-emerald-500/30 transition-all cursor-pointer"
				>
					<HardDrive className="w-3 h-3" />
					本地
				</button>
			)}

			{/* Alignment quick toggles */}
			<div className="flex items-center bg-zinc-800/90 rounded-md p-0.5 border border-zinc-700/60">
				<button
					type="button"
					title="居左对齐"
					onClick={onSetAlignment("left")}
					className={`p-1 rounded transition-colors cursor-pointer ${
						textAlign === "left"
							? "bg-accent text-white"
							: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50"
					}`}
				>
					<AlignLeft className="w-3.5 h-3.5" />
				</button>
				<button
					type="button"
					title="居中对齐"
					onClick={onSetAlignment("center")}
					className={`p-1 rounded transition-colors cursor-pointer ${
						textAlign === "center"
							? "bg-accent text-white"
							: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50"
					}`}
				>
					<AlignCenter className="w-3.5 h-3.5" />
				</button>
				<button
					type="button"
					title="居右对齐"
					onClick={onSetAlignment("right")}
					className={`p-1 rounded transition-colors cursor-pointer ${
						textAlign === "right"
							? "bg-accent text-white"
							: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50"
					}`}
				>
					<AlignRight className="w-3.5 h-3.5" />
				</button>
			</div>

			{/* Download / Localize / Re-fetch button */}
			<button
				type="button"
				onClick={onDownloadAction}
				disabled={downloading}
				title={downloadTooltip}
				className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md hover:bg-zinc-800 active:bg-zinc-700 text-zinc-200 hover:text-white transition-colors cursor-pointer disabled:opacity-60"
			>
				{downloading ? (
					<Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
				) : downloadSuccess ? (
					<Check className="w-3.5 h-3.5 text-emerald-400" />
				) : !isExternal && originalSrc ? (
					<RefreshCw className="w-3.5 h-3.5" />
				) : (
					<Download className="w-3.5 h-3.5" />
				)}
				<span>{downloadButtonText}</span>
			</button>

			{/* Compress & Convert to WebP button (Available for local images) */}
			{!isVideo && !isExternal && (
				<button
					type="button"
					onClick={onOpenCompress}
					title="压缩图片并可转换为 WebP、JPEG 或 PNG 格式"
					className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
						showCompressModal
							? "bg-accent text-white shadow-sm"
							: "hover:bg-zinc-800 active:bg-zinc-700 text-zinc-200 hover:text-white"
					}`}
				>
					<Sparkles className="w-3.5 h-3.5 text-amber-400" />
					<span>压缩转换</span>
				</button>
			)}

			{/* Replace button */}
			<button
				type="button"
				onClick={onOpenReplace}
				title="替换图片或视频（支持本地上传或新网络链接）"
				className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
					showReplaceModal
						? "bg-accent text-white shadow-sm"
						: "hover:bg-zinc-800 active:bg-zinc-700 text-zinc-200 hover:text-white"
				}`}
			>
				<ArrowLeftRight className="w-3.5 h-3.5" />
				<span>替换</span>
			</button>

			{/* Compress popover menu anchored to toolbar */}
			{showCompressModal && (
				<MediaCompressPopover
					src={src}
					docId={docId}
					onClose={onCloseCompress}
					onUpdateSrc={onUpdateSrc}
				/>
			)}

			{/* Replace popover menu anchored to toolbar */}
			{showReplaceModal && (
				<MediaReplacePopover
					isVideo={isVideo}
					uploading={uploading}
					uploadError={uploadError}
					originalSrc={originalSrc}
					isExternal={isExternal}
					replaceUrlInput={replaceUrlInput}
					fileInputRef={fileInputRef}
					onClose={onCloseReplace}
					onFileSelected={onFileSelected}
					onRestoreOriginalSrc={onRestoreOriginalSrc}
					onConfirmUrlReplace={onConfirmUrlReplace}
					onUrlInputChange={onUrlInputChange}
				/>
			)}
		</div>
	);
}
