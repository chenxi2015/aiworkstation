import { toast } from "@heroui/react";
import {
	Check,
	Download,
	FileImage,
	Loader2,
	Sliders,
	Sparkles,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { uploadAssetRpc } from "../../../../services/api/editorClient";
import {
	type CompressFormat,
	type CompressResult,
	compressImage,
	formatBytes,
	type ImageInfo,
	inspectImage,
} from "./imageCompressor";
import { downloadFileToDisk } from "./mediaUtils";

interface MediaCompressPopoverProps {
	src: string;
	docId: number;
	onClose: () => void;
	onUpdateSrc: (newUrl: string) => void;
}

const FORMAT_OPTIONS: {
	id: CompressFormat;
	name: string;
	desc: string;
	recommended?: boolean;
}[] = [
	{
		id: "image/webp",
		name: "WebP",
		desc: "体积最小，支持透明",
		recommended: true,
	},
	{
		id: "image/jpeg",
		name: "JPEG",
		desc: "通用照片格式",
	},
	{
		id: "image/png",
		name: "PNG",
		desc: "无损高保真",
	},
];

const QUALITY_PRESETS = [
	{ label: "推荐 80%", value: 0.8 },
	{ label: "强力 65%", value: 0.65 },
	{ label: "高清 90%", value: 0.9 },
];

const DIMENSION_OPTIONS = [
	{ label: "保持原尺寸", value: 0 },
	{ label: "最长 1920px", value: 1920 },
	{ label: "最长 1280px", value: 1280 },
	{ label: "最长 800px", value: 800 },
];

/**
 * Popover dialog for client-side image compression and format conversion (WebP/JPEG/PNG)
 */
export function MediaCompressPopover({
	src,
	docId,
	onClose,
	onUpdateSrc,
}: MediaCompressPopoverProps) {
	const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
	const [infoLoading, setInfoLoading] = useState(true);

	const [format, setFormat] = useState<CompressFormat>("image/webp");
	const [quality, setQuality] = useState<number>(0.8);
	const [maxDimension, setMaxDimension] = useState<number>(0);

	const [processing, setProcessing] = useState(false);
	const [lastResult, setLastResult] = useState<CompressResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Inspect image on mount
	useEffect(() => {
		let isMounted = true;
		setInfoLoading(true);
		inspectImage(src)
			.then((info) => {
				if (isMounted) {
					setImageInfo(info);
				}
			})
			.catch((err) => {
				console.warn("Failed to inspect image:", err);
			})
			.finally(() => {
				if (isMounted) setInfoLoading(false);
			});
		return () => {
			isMounted = false;
		};
	}, [src]);

	// Compress and apply to current document
	const handleCompressAndApply = async () => {
		if (processing) return;
		setProcessing(true);
		setError(null);
		try {
			const result = await compressImage(src, {
				format,
				quality,
				maxDimension,
			});
			setLastResult(result);

			if (!docId) {
				throw new Error("缺少文档 ID，无法转存并更新文档");
			}

			// Upload compressed file to document asset directory
			const { url: newUrl } = await uploadAssetRpc(docId, result.file);
			onUpdateSrc(newUrl);

			const savedPct = Math.round(result.ratio * 100);
			toast.success(
				`已压缩并转换为 ${result.filename}（${formatBytes(result.originalSize)} → ${formatBytes(result.compressedSize)}${savedPct > 0 ? `，节省 ${savedPct}%` : ""}）`,
			);
			onClose();
		} catch (err) {
			console.error("Image compression failed:", err);
			const msg = err instanceof Error ? err.message : "图片压缩失败";
			setError(msg);
			toast.danger(`压缩失败: ${msg}`);
		} finally {
			setProcessing(false);
		}
	};

	// Compress and download to computer disk without replacing document image
	const handleCompressAndDownload = async () => {
		if (processing) return;
		setProcessing(true);
		setError(null);
		try {
			const result = await compressImage(src, {
				format,
				quality,
				maxDimension,
			});
			setLastResult(result);
			const objectUrl = URL.createObjectURL(result.blob);
			downloadFileToDisk(objectUrl, result.filename);
			setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
			const savedPct = Math.round(result.ratio * 100);
			toast.success(
				`已下载 ${result.filename}（体积 ${formatBytes(result.compressedSize)}${savedPct > 0 ? `，节省 ${savedPct}%` : ""}）`,
			);
		} catch (err) {
			console.error("Image download failed:", err);
			const msg = err instanceof Error ? err.message : "压缩导出失败";
			setError(msg);
			toast.danger(`导出失败: ${msg}`);
		} finally {
			setProcessing(false);
		}
	};

	return (
		<div
			role="dialog"
			aria-label="图片压缩与格式转换"
			className="absolute top-[calc(100%+6px)] right-0 z-40 media-action-toolbar w-84 p-3.5 bg-zinc-900/98 text-zinc-100 border border-zinc-700/90 rounded-xl shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150 whitespace-normal"
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => e.stopPropagation()}
		>
			{/* Header */}
			<div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800">
				<div className="flex items-center gap-1.5">
					<Sparkles className="w-3.5 h-3.5 text-amber-400" />
					<span className="text-xs font-semibold text-zinc-100">
						图片压缩与转码
					</span>
				</div>
				<button
					type="button"
					onClick={onClose}
					className="text-zinc-400 hover:text-zinc-200 p-0.5 rounded transition-colors cursor-pointer"
				>
					<X className="w-3.5 h-3.5" />
				</button>
			</div>

			<div className="space-y-3 text-xs">
				{/* Current Image Details */}
				<div className="p-2 rounded-lg bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-between">
					<div className="flex items-center gap-2 min-w-0">
						<div className="p-1 rounded bg-zinc-700/60 text-zinc-300 shrink-0">
							<FileImage className="w-3.5 h-3.5" />
						</div>
						<div className="min-w-0">
							<div className="text-[11px] font-medium text-zinc-300 truncate">
								{imageInfo?.filename || "本地图片"}
							</div>
							<div className="text-[10px] text-zinc-400">
								{infoLoading ? (
									<span className="flex items-center gap-1">
										<Loader2 className="w-2.5 h-2.5 animate-spin" />
										读取参数...
									</span>
								) : imageInfo ? (
									`${imageInfo.width} × ${imageInfo.height}${imageInfo.size > 0 ? ` · ${formatBytes(imageInfo.size)}` : ""}`
								) : (
									"本地资源"
								)}
							</div>
						</div>
					</div>
				</div>

				{/* Format Selection */}
				<div>
					<div className="text-[11px] font-medium text-zinc-300 mb-1.5 flex items-center justify-between">
						<span>目标格式</span>
						<span className="text-[10px] text-zinc-400 font-normal">
							推荐 WebP 格式
						</span>
					</div>
					<div className="grid grid-cols-3 gap-1.5">
						{FORMAT_OPTIONS.map((item) => (
							<button
								key={item.id}
								type="button"
								onClick={() => setFormat(item.id)}
								className={`flex flex-col items-center p-1.5 rounded-lg border text-left transition-all cursor-pointer ${
									format === item.id
										? "bg-accent/20 border-accent text-white"
										: "bg-zinc-800/70 border-zinc-700/60 text-zinc-300 hover:bg-zinc-700/50"
								}`}
							>
								<div className="flex items-center gap-1">
									<span className="font-semibold text-xs">{item.name}</span>
									{item.recommended && (
										<span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
											推荐
										</span>
									)}
								</div>
								<span className="text-[9px] text-zinc-400 mt-0.5 text-center leading-tight">
									{item.desc}
								</span>
							</button>
						))}
					</div>
				</div>

				{/* Quality Settings (only relevant for WebP and JPEG) */}
				{format !== "image/png" ? (
					<div>
						<div className="flex items-center justify-between text-[11px] font-medium text-zinc-300 mb-1">
							<span className="flex items-center gap-1">
								<Sliders className="w-3 h-3 text-zinc-400" />
								压缩质量 ({Math.round(quality * 100)}%)
							</span>
							<div className="flex items-center gap-1">
								{QUALITY_PRESETS.map((p) => (
									<button
										key={p.label}
										type="button"
										onClick={() => setQuality(p.value)}
										className={`text-[9px] px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
											Math.abs(quality - p.value) < 0.02
												? "bg-accent text-white"
												: "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
										}`}
									>
										{p.label}
									</button>
								))}
							</div>
						</div>
						<input
							type="range"
							min="0.1"
							max="0.95"
							step="0.05"
							value={quality}
							onChange={(e) => setQuality(Number.parseFloat(e.target.value))}
							className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-accent"
						/>
					</div>
				) : (
					<div className="text-[10px] text-zinc-400 bg-zinc-800/40 p-2 rounded-lg border border-zinc-700/40">
						PNG 属于无损格式，可通过限制最长边缩小分辨率来实现体积压缩。
					</div>
				)}

				{/* Resolution Max Dimension */}
				<div>
					<div className="text-[11px] font-medium text-zinc-300 mb-1.5">
						分辨率缩放
					</div>
					<div className="grid grid-cols-2 gap-1.5">
						{DIMENSION_OPTIONS.map((opt) => (
							<button
								key={opt.value}
								type="button"
								onClick={() => setMaxDimension(opt.value)}
								className={`py-1 px-2 rounded-md border text-[11px] transition-colors cursor-pointer ${
									maxDimension === opt.value
										? "bg-accent/20 border-accent text-white font-medium"
										: "bg-zinc-800/60 border-zinc-700/60 text-zinc-300 hover:bg-zinc-700/50"
								}`}
							>
								{opt.label}
							</button>
						))}
					</div>
				</div>

				{/* Error feedback */}
				{error && (
					<div className="p-2 rounded bg-red-950/40 border border-red-800/50 text-[11px] text-red-300">
						{error}
					</div>
				)}

				{/* Previous result summary */}
				{lastResult && (
					<div className="p-2 rounded bg-emerald-950/40 border border-emerald-800/50 text-[11px] text-emerald-300 flex items-center justify-between">
						<span className="flex items-center gap-1">
							<Check className="w-3.5 h-3.5 text-emerald-400" />
							{lastResult.filename}
						</span>
						<span className="font-mono font-medium">
							{formatBytes(lastResult.originalSize)} →{" "}
							{formatBytes(lastResult.compressedSize)} (节省{" "}
							{Math.round(lastResult.ratio * 100)}%)
						</span>
					</div>
				)}

				{/* Action Buttons */}
				<div className="pt-1 flex items-center gap-2">
					<button
						type="button"
						disabled={processing}
						onClick={handleCompressAndApply}
						className="flex-1 py-1.5 px-3 rounded-lg bg-accent hover:bg-accent/90 active:bg-accent text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
					>
						{processing ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<Sparkles className="w-3.5 h-3.5" />
						)}
						<span>{processing ? "处理中..." : "压缩并替换原图"}</span>
					</button>

					<button
						type="button"
						disabled={processing}
						onClick={handleCompressAndDownload}
						title="仅下载压缩转换后的图片文件到电脑磁盘，不修改当前文档"
						className="py-1.5 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-medium border border-zinc-700/70 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
					>
						<Download className="w-3.5 h-3.5" />
						<span>仅下载</span>
					</button>
				</div>
			</div>
		</div>
	);
}
