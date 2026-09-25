import { Button, Chip, Modal } from "@heroui/react";
import {
	AlertCircle,
	ChevronLeft,
	ChevronRight,
	ExternalLink,
	FileImage,
	FolderOpen,
	RotateCw,
	Sparkles,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Material, MaterialAsset } from "../types";
import { formatBytes, getAssetMediaUrl, getImageAssets } from "./utils";

export interface ImagePreviewItem {
	material: Material;
	asset: MaterialAsset;
	url: string;
}

interface MaterialImageModalProps {
	isOpen: boolean;
	material: Material | null;
	initialAssetId?: number | null;
	materials?: Material[];
	onClose: () => void;
	onOpenDir?: (material: Material) => void;
	onImportToStudio?: (material: Material) => void;
}

/**
 * Modal dialog for previewing and paginating through material images
 */
export function MaterialImageModal({
	isOpen,
	material,
	initialAssetId,
	materials = [],
	onClose,
	onOpenDir,
	onImportToStudio,
}: MaterialImageModalProps) {
	// Aggregate all image assets from current materials pool
	const allImages = useMemo(() => {
		if (!material && materials.length === 0) return [];
		const pool = materials.length > 0 ? materials : material ? [material] : [];
		const list: ImagePreviewItem[] = [];
		const seenAssetIds = new Set<number>();

		for (const m of pool) {
			const imgAssets = getImageAssets(m);
			for (const a of imgAssets) {
				if (!seenAssetIds.has(a.id)) {
					seenAssetIds.add(a.id);
					list.push({
						material: m,
						asset: a,
						url: getAssetMediaUrl(a),
					});
				}
			}
		}

		// Ensure active material's images are included if pool didn't contain it
		if (material) {
			const currentImgs = getImageAssets(material);
			for (const a of currentImgs) {
				if (!seenAssetIds.has(a.id)) {
					seenAssetIds.add(a.id);
					list.push({
						material,
						asset: a,
						url: getAssetMediaUrl(a),
					});
				}
			}
		}

		return list;
	}, [materials, material]);

	const [currentIndex, setCurrentIndex] = useState(0);
	const [zoom, setZoom] = useState(1);
	const [rotation, setRotation] = useState(0);
	const [dimensions, setDimensions] = useState<{
		width: number;
		height: number;
	} | null>(null);
	const [imageError, setImageError] = useState(false);

	const activeThumbRef = useRef<HTMLButtonElement | null>(null);

	// Synchronize initial index when modal opens or target changes
	useEffect(() => {
		if (!isOpen || allImages.length === 0) return;
		if (material) {
			const targetIdx = allImages.findIndex(
				(item) =>
					item.material.id === material.id &&
					(!initialAssetId || item.asset.id === initialAssetId),
			);
			if (targetIdx !== -1) {
				setCurrentIndex(targetIdx);
				return;
			}
		}
		setCurrentIndex(0);
	}, [isOpen, material, initialAssetId, allImages]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset zoom/rotation/dimensions on image change or modal open
	useEffect(() => {
		setZoom(1);
		setRotation(0);
		setDimensions(null);
		setImageError(false);
	}, [currentIndex, isOpen]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Auto-scroll active thumbnail into view
	useEffect(() => {
		if (activeThumbRef.current) {
			activeThumbRef.current.scrollIntoView({
				behavior: "smooth",
				block: "nearest",
				inline: "center",
			});
		}
	}, [currentIndex]);

	const handlePrev = useCallback(() => {
		setCurrentIndex((prev) => Math.max(0, prev - 1));
	}, []);

	const handleNext = useCallback(() => {
		setCurrentIndex((prev) => Math.min(allImages.length - 1, prev + 1));
	}, [allImages.length]);

	// Keyboard shortcuts for pagination and closing
	useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "ArrowLeft") {
				e.preventDefault();
				handlePrev();
			} else if (e.key === "ArrowRight") {
				e.preventDefault();
				handleNext();
			} else if (e.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, handlePrev, handleNext, onClose]);

	if (!material && allImages.length === 0) return null;

	const currentItem = allImages[currentIndex] ?? null;
	const currentMaterial = currentItem?.material ?? material;
	const currentAsset = currentItem?.asset ?? null;
	const totalImages = allImages.length;

	const handleZoomIn = () =>
		setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)));
	const handleZoomOut = () =>
		setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));
	const handleResetZoom = () => {
		setZoom(1);
		setRotation(0);
	};
	const handleRotate = () => setRotation((r) => (r + 90) % 360);

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="lg" className="w-full !max-w-4xl">
				<Modal.Dialog
					aria-label={`预览图片 - ${currentMaterial?.title ?? ""}`}
					className="w-full flex flex-col bg-surface border border-border shadow-2xl rounded-2xl overflow-hidden"
				>
					<Modal.CloseTrigger />

					{/* Modal Header */}
					<Modal.Header className="flex flex-col gap-2 pb-2">
						<div className="flex items-center justify-between gap-3 pr-8 min-w-0">
							<div className="flex items-center gap-2 min-w-0">
								<FileImage className="w-5 h-5 text-accent shrink-0" />
								<Modal.Heading className="text-base font-semibold text-foreground truncate">
									{currentMaterial?.title ?? "图片预览"}
								</Modal.Heading>
								{currentAsset?.filename &&
									currentAsset.filename !== currentMaterial?.title && (
										<span
											className="text-xs text-muted truncate max-w-xs hidden sm:inline"
											title={currentAsset.filename}
										>
											({currentAsset.filename})
										</span>
									)}
							</div>

							{totalImages > 0 && (
								<div className="flex items-center gap-2 shrink-0">
									<Chip
										size="sm"
										variant="soft"
										color="accent"
										className="h-5 px-2 text-[11px] font-mono shrink-0"
									>
										{currentIndex + 1} / {totalImages}
									</Chip>
								</div>
							)}
						</div>

						{/* Top auxiliary toolbar (Zoom, Rotate, Open original) */}
						{currentItem && !imageError && (
							<div className="flex items-center justify-between text-xs text-muted pt-1">
								<div className="flex items-center gap-1.5">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-7 w-7 p-0 rounded-lg text-muted hover:text-foreground cursor-pointer"
										onPress={handleZoomOut}
										aria-title="缩小"
										aria-label="缩小图片"
									>
										<ZoomOut className="w-3.5 h-3.5" />
									</Button>
									<span className="text-[11px] font-mono min-w-[36px] text-center">
										{Math.round(zoom * 100)}%
									</span>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-7 w-7 p-0 rounded-lg text-muted hover:text-foreground cursor-pointer"
										onPress={handleZoomIn}
										aria-title="放大"
										aria-label="放大图片"
									>
										<ZoomIn className="w-3.5 h-3.5" />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-7 w-7 p-0 rounded-lg text-muted hover:text-foreground cursor-pointer ml-1"
										onPress={handleRotate}
										aria-title="顺时针旋转 90°"
										aria-label="旋转图片"
									>
										<RotateCw className="w-3.5 h-3.5" />
									</Button>
									{(zoom !== 1 || rotation !== 0) && (
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="h-7 px-2 rounded-lg text-[11px] text-accent hover:text-accent cursor-pointer ml-1"
											onPress={handleResetZoom}
										>
											重置
										</Button>
									)}
								</div>

								<div className="flex items-center gap-2">
									<a
										href={currentItem.url}
										target="_blank"
										rel="noreferrer"
										className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted/10"
										title="新窗口查看原图"
									>
										<ExternalLink className="w-3 h-3" />
										原图
									</a>
								</div>
							</div>
						)}
					</Modal.Header>

					{/* Modal Body / Image Viewport */}
					<Modal.Body className="p-0 flex flex-col gap-0 select-none">
						<div className="relative w-full h-[52vh] min-h-[360px] max-h-[600px] bg-neutral-950 flex items-center justify-center overflow-hidden">
							{currentItem ? (
								imageError ? (
									<div className="text-xs text-muted flex flex-col items-center gap-2 py-12">
										<AlertCircle className="w-8 h-8 text-danger/80" />
										<span>图片无法加载或已被移除</span>
									</div>
								) : (
									<img
										key={currentItem.url}
										src={currentItem.url}
										alt={currentMaterial?.title ?? ""}
										onError={() => setImageError(true)}
										onLoad={(e) => {
											setDimensions({
												width: e.currentTarget.naturalWidth,
												height: e.currentTarget.naturalHeight,
											});
										}}
										style={{
											transform: `scale(${zoom}) rotate(${rotation}deg)`,
											transition: "transform 0.15s ease-out",
										}}
										className="max-w-full max-h-full object-contain pointer-events-auto transition-transform"
										draggable={false}
									/>
								)
							) : (
								<div className="text-xs text-muted flex flex-col items-center gap-2 py-12">
									<FileImage className="w-8 h-8 opacity-50" />
									<span>暂无可预览的图片文件</span>
								</div>
							)}

							{/* Previous button (Floating Left) */}
							{totalImages > 1 && (
								<button
									type="button"
									onClick={handlePrev}
									disabled={currentIndex <= 0}
									className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/60 hover:bg-black/85 text-white flex items-center justify-center backdrop-blur-md border border-white/10 transition-all hover:scale-105 active:scale-95 disabled:opacity-20 disabled:pointer-events-none cursor-pointer shadow-lg"
									title="上一张 (← 键盘左键)"
									aria-label="上一张图片"
								>
									<ChevronLeft className="w-6 h-6" />
								</button>
							)}

							{/* Next button (Floating Right) */}
							{totalImages > 1 && (
								<button
									type="button"
									onClick={handleNext}
									disabled={currentIndex >= totalImages - 1}
									className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/60 hover:bg-black/85 text-white flex items-center justify-center backdrop-blur-md border border-white/10 transition-all hover:scale-105 active:scale-95 disabled:opacity-20 disabled:pointer-events-none cursor-pointer shadow-lg"
									title="下一张 (→ 键盘右键)"
									aria-label="下一张图片"
								>
									<ChevronRight className="w-6 h-6" />
								</button>
							)}
						</div>

						{/* Bottom Thumbnail Strip for Fast Paging */}
						{totalImages > 1 && (
							<div className="flex items-center gap-2 overflow-x-auto p-2 scrollbar-none max-w-full bg-muted/5 border-t border-border/40">
								{allImages.map((item, idx) => {
									const isSelected = idx === currentIndex;
									return (
										<button
											key={`${item.material.id}-${item.asset.id}`}
											ref={isSelected ? activeThumbRef : null}
											type="button"
											onClick={() => setCurrentIndex(idx)}
											className={`relative shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
												isSelected
													? "border-accent ring-2 ring-accent/30 scale-105 shadow-sm"
													: "border-transparent opacity-60 hover:opacity-100"
											}`}
											title={`${item.material.title} (${idx + 1}/${totalImages})`}
										>
											<img
												src={item.url}
												alt={item.asset.filename}
												className="w-full h-full object-cover"
												loading="lazy"
											/>
										</button>
									);
								})}
							</div>
						)}

						{/* Metadata Bar */}
						{currentAsset && (
							<div className="px-5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted border-t border-border/40 bg-muted/5">
								<div className="flex items-center gap-2 min-w-0">
									<span
										className="font-medium text-foreground truncate max-w-xs"
										title={currentAsset.filename}
									>
										{currentAsset.filename}
									</span>
									{currentAsset.sizeBytes && (
										<span className="font-mono text-[11px] text-muted/80">
											({formatBytes(currentAsset.sizeBytes)})
										</span>
									)}
									{dimensions && (
										<span className="font-mono text-[11px] text-muted/80">
											· {dimensions.width} × {dimensions.height}
										</span>
									)}
								</div>

								<div className="flex items-center gap-2">
									<Chip
										size="sm"
										variant="soft"
										className="h-5 text-[10px] px-1.5"
									>
										{currentAsset.storageMode === "external"
											? "本地原位"
											: "应用托管"}
									</Chip>
									{currentAsset.sourcePath && (
										<span
											className="text-[11px] font-mono text-muted/70 truncate max-w-[200px]"
											title={currentAsset.sourcePath}
										>
											{currentAsset.sourcePath}
										</span>
									)}
								</div>
							</div>
						)}
					</Modal.Body>

					{/* Modal Footer */}
					<Modal.Footer className="flex items-center justify-between border-t border-border pt-3">
						<div className="flex items-center gap-2">
							{onOpenDir && currentMaterial && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="rounded-lg h-8 text-xs flex items-center gap-1.5 cursor-pointer text-muted hover:text-foreground"
									onPress={() => onOpenDir(currentMaterial)}
								>
									<FolderOpen className="w-3.5 h-3.5" />
									打开所在目录
								</Button>
							)}
						</div>

						<div className="hidden sm:flex items-center text-[11px] text-muted/70">
							{totalImages > 1 ? "按 ← / → 键翻页" : "可使用上方工具缩放或旋转"}
						</div>

						<div className="flex items-center gap-2">
							{onImportToStudio && currentMaterial && (
								<Button
									type="button"
									variant="secondary"
									size="sm"
									className="rounded-lg h-8 text-xs flex items-center gap-1.5 cursor-pointer"
									onPress={() => {
										onClose();
										onImportToStudio(currentMaterial);
									}}
								>
									<Sparkles className="w-3.5 h-3.5 text-accent" />
									导入创作台
								</Button>
							)}
							<Button
								type="button"
								variant="primary"
								size="sm"
								className="rounded-lg h-8 px-4 text-xs cursor-pointer"
								onPress={onClose}
							>
								关闭
							</Button>
						</div>
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
