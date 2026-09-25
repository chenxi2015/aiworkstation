import {
	Check,
	Crop as CropIcon,
	Download,
	FolderPlus,
	Maximize2,
	RefreshCw,
	RotateCcw,
	Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactCrop, {
	type Crop,
	centerCrop,
	makeAspectCrop,
	type PixelCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { uploadMaterialFiles } from "../../../../server/functions/creatorMaterials";
import type { ToolDefinition } from "../types";

interface AspectRatioOption {
	id: string;
	label: string;
	subLabel?: string;
	ratio: number | null | "custom"; // null means original, "custom" means unconstrained
}

const PRESET_RATIOS: AspectRatioOption[] = [
	{ id: "custom", label: "自由裁剪", subLabel: "随意拖拽", ratio: "custom" },
	{ id: "3:4", label: "3:4", subLabel: "小红书图文", ratio: 3 / 4 },
	{ id: "9:16", label: "9:16", subLabel: "抖音/竖屏", ratio: 9 / 16 },
	{ id: "16:9", label: "16:9", subLabel: "B站/横屏", ratio: 16 / 9 },
	{ id: "1:1", label: "1:1", subLabel: "正方形", ratio: 1 },
	{ id: "original", label: "原比例", subLabel: "原图锁定", ratio: null },
];

interface ImageCropAndCompressProps {
	tool: ToolDefinition;
	onSaveSuccess?: () => void;
}

/**
 * Calculate initial center crop based on image display dimensions and aspect ratio.
 */
function createInitialCrop(
	aspectRatio: number | undefined,
	mediaWidth: number,
	mediaHeight: number,
): Crop {
	if (!aspectRatio) {
		// Free crop: default to 85% area centered
		return centerCrop(
			{
				unit: "%",
				width: 85,
				height: 85,
			},
			mediaWidth,
			mediaHeight,
		);
	}

	return centerCrop(
		makeAspectCrop(
			{
				unit: "%",
				width: 85,
			},
			aspectRatio,
			mediaWidth,
			mediaHeight,
		),
		mediaWidth,
		mediaHeight,
	);
}

/**
 * Generate cropped blob from HTMLImageElement and PixelCrop area.
 */
async function generateCroppedBlob(
	image: HTMLImageElement,
	crop: PixelCrop,
	format: "image/jpeg" | "image/webp" | "image/png",
	quality: number,
): Promise<{ blob: Blob; url: string; width: number; height: number } | null> {
	if (!crop || crop.width <= 0 || crop.height <= 0) return null;

	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;

	const scaleX = image.naturalWidth / image.width;
	const scaleY = image.naturalHeight / image.height;

	const pixelX = crop.x * scaleX;
	const pixelY = crop.y * scaleY;
	const pixelWidth = crop.width * scaleX;
	const pixelHeight = crop.height * scaleY;

	canvas.width = Math.max(1, Math.round(pixelWidth));
	canvas.height = Math.max(1, Math.round(pixelHeight));

	ctx.imageSmoothingQuality = "high";
	ctx.imageSmoothingEnabled = true;

	ctx.drawImage(
		image,
		pixelX,
		pixelY,
		pixelWidth,
		pixelHeight,
		0,
		0,
		canvas.width,
		canvas.height,
	);

	return new Promise((resolve) => {
		canvas.toBlob(
			(blob) => {
				if (!blob) {
					resolve(null);
					return;
				}
				const url = URL.createObjectURL(blob);
				resolve({
					blob,
					url,
					width: canvas.width,
					height: canvas.height,
				});
			},
			format,
			format === "image/png" ? undefined : quality / 100,
		);
	});
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * High-performance client-side interactive image cropping & compression studio.
 * Centers around the canvas workspace with a compact parameter toolbar.
 */
export function ImageCropAndCompress({
	tool: _tool,
	onSaveSuccess,
}: ImageCropAndCompressProps) {
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [originalUrl, setOriginalUrl] = useState<string | null>(null);

	// Crop state
	const [crop, setCrop] = useState<Crop>();
	const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
	const [selectedRatioId, setSelectedRatioId] = useState<string>("custom");

	// Export params
	const [format, setFormat] = useState<
		"image/jpeg" | "image/webp" | "image/png"
	>("image/webp");
	const [quality, setQuality] = useState<number>(85);

	// Processed result
	const [processedUrl, setProcessedUrl] = useState<string | null>(null);
	const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
	const [processedDimensions, setProcessedDimensions] = useState<{
		width: number;
		height: number;
	} | null>(null);

	// Processing states
	const [isGenerating, setIsGenerating] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

	const imgRef = useRef<HTMLImageElement | null>(null);
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Cleanup created Object URLs on unmount or updates
	useEffect(() => {
		return () => {
			if (originalUrl) URL.revokeObjectURL(originalUrl);
			if (processedUrl) URL.revokeObjectURL(processedUrl);
			if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
		};
	}, [originalUrl, processedUrl]);

	// Calculate aspect ratio constraint value
	const getEffectiveAspect = useCallback(
		(ratioId: string): number | undefined => {
			const config = PRESET_RATIOS.find((r) => r.id === ratioId);
			if (!config || config.ratio === "custom") return undefined;
			if (config.ratio === null && imgRef.current) {
				return imgRef.current.naturalWidth / imgRef.current.naturalHeight;
			}
			return typeof config.ratio === "number" ? config.ratio : undefined;
		},
		[],
	);

	const handleFileSelect = (file: File) => {
		if (!file.type.startsWith("image/")) return;
		setSelectedFile(file);
		setSaveFeedback(null);
		setCrop(undefined);
		setCompletedCrop(undefined);
		if (originalUrl) URL.revokeObjectURL(originalUrl);
		setOriginalUrl(URL.createObjectURL(file));
	};

	// Reset crop box when image finishes loading
	const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
		const { width, height, naturalWidth, naturalHeight } = e.currentTarget;
		const aspect =
			selectedRatioId === "original"
				? naturalWidth / naturalHeight
				: getEffectiveAspect(selectedRatioId);

		const initial = createInitialCrop(aspect, width, height);
		setCrop(initial);
	};

	// When user clicks a ratio button
	const handleRatioChange = (ratioId: string) => {
		setSelectedRatioId(ratioId);
		if (!imgRef.current) return;

		const { width, height, naturalWidth, naturalHeight } = imgRef.current;
		const aspect =
			ratioId === "original"
				? naturalWidth / naturalHeight
				: getEffectiveAspect(ratioId);

		const nextCrop = createInitialCrop(aspect, width, height);
		setCrop(nextCrop);
	};

	// Re-center current crop box
	const handleCenterReset = () => {
		if (!imgRef.current) return;
		const { width, height, naturalWidth, naturalHeight } = imgRef.current;
		const aspect =
			selectedRatioId === "original"
				? naturalWidth / naturalHeight
				: getEffectiveAspect(selectedRatioId);

		setCrop(createInitialCrop(aspect, width, height));
	};

	// Debounced render of cropped image preview when crop, format, or quality changes
	useEffect(() => {
		if (!imgRef.current || !completedCrop) return;
		if (completedCrop.width === 0 || completedCrop.height === 0) return;

		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
		}

		debounceTimerRef.current = setTimeout(async () => {
			if (!imgRef.current || !completedCrop) return;
			setIsGenerating(true);
			try {
				const result = await generateCroppedBlob(
					imgRef.current,
					completedCrop,
					format,
					quality,
				);

				if (result) {
					setProcessedUrl((prev) => {
						if (prev) URL.revokeObjectURL(prev);
						return result.url;
					});
					setProcessedBlob(result.blob);
					setProcessedDimensions({
						width: result.width,
						height: result.height,
					});
				}
			} finally {
				setIsGenerating(false);
			}
		}, 150);

		return () => {
			if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
		};
	}, [completedCrop, format, quality]);

	const handleDownload = () => {
		if (!processedUrl) return;
		const ext =
			format === "image/webp" ? "webp" : format === "image/png" ? "png" : "jpg";
		const link = document.createElement("a");
		link.href = processedUrl;
		link.download = `cropped_${Date.now()}.${ext}`;
		link.click();
	};

	const handleSaveToMaterials = async () => {
		if (!processedBlob || isSaving) return;
		setIsSaving(true);
		setSaveFeedback(null);
		try {
			const ext =
				format === "image/webp"
					? "webp"
					: format === "image/png"
						? "png"
						: "jpg";
			const filename = `crop_${Date.now()}.${ext}`;
			const file = new File([processedBlob], filename, { type: format });

			const formData = new FormData();
			formData.append("files", file);

			await uploadMaterialFiles({ data: formData });
			setSaveFeedback("已存入素材库！");
			onSaveSuccess?.();
		} catch (err) {
			console.error("Failed to save cropped image to materials", err);
			setSaveFeedback("保存失败，请稍后重试");
		} finally {
			setIsSaving(false);
		}
	};

	const compressionSavings =
		selectedFile && processedBlob
			? Math.round(
					((selectedFile.size - processedBlob.size) / selectedFile.size) * 100,
				)
			: 0;

	const effectiveAspect = getEffectiveAspect(selectedRatioId);

	return (
		<div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
			{/* Compact Top Control Bar */}
			<div className="shrink-0 px-4 py-2 border-b border-border bg-surface/50 backdrop-blur-sm flex items-center justify-between gap-3 flex-wrap z-10">
				{/* Aspect Ratios Pill Selector */}
				<div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
					<span className="text-[11px] font-semibold text-muted shrink-0 mr-1 flex items-center gap-1">
						<CropIcon className="w-3.5 h-3.5 text-accent" />
						<span>比例</span>
					</span>

					{PRESET_RATIOS.map((item) => {
						const isSelected = selectedRatioId === item.id;
						return (
							<button
								key={item.id}
								type="button"
								onClick={() => handleRatioChange(item.id)}
								className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
									isSelected
										? "bg-accent text-accent-foreground shadow-xs font-semibold"
										: "bg-surface/80 hover:bg-surface border border-border/70 text-foreground/80 hover:text-foreground"
								}`}
								title={item.subLabel}
							>
								<span>{item.label}</span>
								{item.subLabel && (
									<span
										className={`text-[10px] hidden sm:inline opacity-75 ${
											isSelected ? "text-accent-foreground" : "text-muted"
										}`}
									>
										{item.subLabel}
									</span>
								)}
							</button>
						);
					})}
				</div>

				{/* Compact Format & Quality Controls */}
				<div className="flex items-center gap-3 shrink-0">
					{/* Reset / Center Box */}
					{originalUrl && (
						<button
							type="button"
							onClick={handleCenterReset}
							className="px-2 py-1 rounded-md text-xs border border-border bg-surface/60 hover:bg-surface text-muted hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors"
							title="将裁切框重新居中"
						>
							<RotateCcw className="w-3 h-3" />
							<span className="hidden sm:inline">重置居中</span>
						</button>
					)}

					{/* Format Select */}
					<div className="flex items-center gap-1.5">
						<select
							value={format}
							onChange={(e) =>
								setFormat(
									e.target.value as "image/jpeg" | "image/webp" | "image/png",
								)
							}
							className="px-2 py-1 rounded-md border border-border bg-background text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
						>
							<option value="image/webp">WebP</option>
							<option value="image/jpeg">JPG</option>
							<option value="image/png">PNG</option>
						</select>
					</div>

					{/* Quality Slider (Compact) */}
					{format !== "image/png" && (
						<div className="flex items-center gap-2">
							<span className="text-[11px] text-muted whitespace-nowrap">
								质量{" "}
								<span className="font-mono text-foreground font-semibold">
									{quality}%
								</span>
							</span>
							<input
								type="range"
								min={30}
								max={100}
								step={5}
								value={quality}
								onChange={(e) => setQuality(Number(e.target.value))}
								className="w-16 sm:w-20 accent-accent cursor-pointer h-1.5"
								title={`压缩质量: ${quality}%`}
							/>
						</div>
					)}

					{/* Re-upload button in top bar if image already loaded */}
					{originalUrl && (
						<label
							htmlFor="top-reupload-image"
							className="px-2.5 py-1 rounded-md border border-border/80 bg-surface/70 hover:bg-surface text-foreground text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors shrink-0"
						>
							<Upload className="w-3 h-3 text-muted" />
							<span>换图</span>
							<input
								id="top-reupload-image"
								type="file"
								accept="image/*"
								onChange={(e) => {
									if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
								}}
								className="sr-only"
							/>
						</label>
					)}
				</div>
			</div>

			{/* Main Workspace Stage */}
			{!originalUrl ? (
				<div className="flex-1 flex flex-col items-center justify-center p-8 bg-surface/10">
					<div className="max-w-md w-full p-8 rounded-2xl border-2 border-dashed border-border/80 hover:border-accent/60 bg-surface/30 hover:bg-surface/50 transition-all flex flex-col items-center justify-center text-center group cursor-pointer relative shadow-xs">
						<input
							type="file"
							accept="image/*"
							onChange={(e) => {
								if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
							}}
							className="absolute inset-0 opacity-0 cursor-pointer"
						/>
						<div className="w-14 h-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mb-3.5 group-hover:scale-105 transition-transform shadow-xs">
							<Upload className="w-7 h-7" />
						</div>
						<h3 className="text-sm font-bold text-foreground mb-1">
							选择或拖拽图片到这里
						</h3>
						<p className="text-xs text-muted mb-3">
							支持自由拖拽框选、预设社交比例、九宫格微调与画质压缩
						</p>
						<span className="text-[11px] px-3 py-1 rounded-full bg-accent/10 text-accent font-medium">
							纯浏览器本地计算 · 零画质损耗
						</span>
					</div>
				</div>
			) : (
				<div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
					{/* Left / Center: Interactive Crop Canvas Area (Takes maximum screen area) */}
					<div className="flex-1 min-w-0 bg-neutral-950/80 dark:bg-black relative flex flex-col items-center justify-center p-4 sm:p-6 overflow-auto">
						{/* Sub-header status bar above canvas */}
						<div className="absolute top-3 left-4 right-4 flex items-center justify-between text-xs text-white/70 pointer-events-none z-10">
							<div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
								<span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
								<span>拖拽四角或边框自由调整选区</span>
							</div>

							{processedDimensions && (
								<div className="bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 font-mono text-[11px] text-white/90">
									裁切尺寸: {processedDimensions.width} ×{" "}
									{processedDimensions.height} px
								</div>
							)}
						</div>

						{/* ReactCrop Viewport */}
						<div className="max-w-full max-h-full flex items-center justify-center">
							<ReactCrop
								crop={crop}
								onChange={(_, percentCrop) => setCrop(percentCrop)}
								onComplete={(c) => setCompletedCrop(c)}
								aspect={effectiveAspect}
								ruleOfThirds
								className="max-h-[calc(100vh-170px)] shadow-2xl rounded-sm"
							>
								<img
									ref={imgRef}
									src={originalUrl}
									alt="Crop source"
									onLoad={onImageLoad}
									className="max-h-[calc(100vh-180px)] max-w-full object-contain select-none block"
								/>
							</ReactCrop>
						</div>
					</div>

					{/* Right Side: Realtime Result Preview & Export Panel */}
					<div className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-border bg-surface/30 backdrop-blur-xs flex flex-col p-4 space-y-4 overflow-y-auto">
						{/* Preview Card */}
						<div className="space-y-2">
							<div className="flex items-center justify-between text-xs">
								<span className="font-semibold text-foreground flex items-center gap-1.5">
									<Maximize2 className="w-3.5 h-3.5 text-accent" />
									<span>裁切实时预览</span>
								</span>
								{isGenerating && (
									<span className="text-[11px] text-muted flex items-center gap-1">
										<RefreshCw className="w-3 h-3 animate-spin text-accent" />
										<span>生成中</span>
									</span>
								)}
							</div>

							{/* Preview Container */}
							<div className="relative aspect-square rounded-xl overflow-hidden bg-black/10 border border-border flex items-center justify-center p-1">
								{processedUrl ? (
									<img
										src={processedUrl}
										alt="Crop result preview"
										className="max-h-full max-w-full object-contain rounded-lg shadow-xs"
									/>
								) : (
									<div className="text-center p-4 text-xs text-muted">
										调整选区后实时呈现
									</div>
								)}
							</div>
						</div>

						{/* Metadata & Stats Grid */}
						<div className="p-3 rounded-xl border border-border/80 bg-surface/40 space-y-2.5">
							<div className="text-xs font-semibold text-foreground border-b border-border/50 pb-1.5 flex items-center justify-between">
								<span>处理指标对比</span>
								<span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-muted uppercase font-mono">
									{format.replace("image/", "")}
								</span>
							</div>

							<div className="space-y-1.5 text-xs">
								<div className="flex items-center justify-between text-muted">
									<span>原图体积</span>
									<span className="font-mono text-foreground">
										{selectedFile ? formatBytes(selectedFile.size) : "-"}
									</span>
								</div>

								<div className="flex items-center justify-between text-muted">
									<span>导出体积</span>
									<div className="flex items-center gap-1.5 font-mono">
										<span className="text-foreground font-semibold">
											{processedBlob ? formatBytes(processedBlob.size) : "-"}
										</span>
										{compressionSavings > 0 && (
											<span className="text-emerald-500 font-bold text-[11px]">
												(-{compressionSavings}%)
											</span>
										)}
									</div>
								</div>

								{processedDimensions && (
									<div className="flex items-center justify-between text-muted pt-1 border-t border-border/40">
										<span>输出像素</span>
										<span className="font-mono text-foreground">
											{processedDimensions.width} × {processedDimensions.height}
										</span>
									</div>
								)}
							</div>
						</div>

						{/* Feedback notification */}
						{saveFeedback && (
							<div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
								<Check className="w-4 h-4 shrink-0" />
								<span>{saveFeedback}</span>
							</div>
						)}

						{/* Actions */}
						<div className="space-y-2 pt-1 mt-auto">
							<button
								type="button"
								onClick={handleDownload}
								disabled={!processedUrl || isGenerating}
								className="w-full py-2.5 px-4 rounded-xl bg-accent text-accent-foreground text-xs font-semibold flex items-center justify-center gap-2 hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer shadow-sm"
							>
								<Download className="w-4 h-4" />
								<span>下载高清图片</span>
							</button>

							<button
								type="button"
								onClick={handleSaveToMaterials}
								disabled={!processedBlob || isSaving || isGenerating}
								className="w-full py-2.5 px-4 rounded-xl border border-border bg-surface hover:bg-surface/80 text-foreground text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
							>
								<FolderPlus className="w-4 h-4 text-accent" />
								<span>{isSaving ? "正在存入..." : "一键保存至素材库"}</span>
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
