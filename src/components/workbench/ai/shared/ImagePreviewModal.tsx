import { toast } from "@heroui/react";
import {
	Download,
	ExternalLink,
	Maximize2,
	RotateCcw,
	X,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export interface ImagePreviewData {
	src: string;
	title?: string;
	subtitle?: string;
}

export interface ImagePreviewContextValue {
	previewImage: ImagePreviewData | null;
	openPreview: (data: ImagePreviewData) => void;
	closePreview: () => void;
}

const ImagePreviewContext = createContext<ImagePreviewContextValue>({
	previewImage: null,
	openPreview: () => {},
	closePreview: () => {},
});

/**
 * Hook to trigger image preview modal from any chat component
 */
export function useImagePreview(): ImagePreviewContextValue {
	return useContext(ImagePreviewContext);
}

interface ImagePreviewModalProps {
	data: ImagePreviewData | null;
	onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DEFAULT_ZOOM_SCALE = 2.5;

/**
 * Lightbox modal for previewing chat images and screenshots with pan and zoom capabilities
 */
export function ImagePreviewModal({ data, onClose }: ImagePreviewModalProps) {
	const [scale, setScale] = useState(1);
	const [position, setPosition] = useState({ x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);
	const [imgLoaded, setImgLoaded] = useState(false);

	// Tracking mouse drag state without unnecessary re-renders
	const isDraggingRef = useRef(false);
	const startMouseRef = useRef({ x: 0, y: 0 });
	const startPosRef = useRef({ x: 0, y: 0 });
	const hasMovedRef = useRef(false);

	// Reset scale and position whenever a new image is loaded
	useEffect(() => {
		setScale(1);
		setPosition({ x: 0, y: 0 });
		setImgLoaded(false);
	}, [data?.src]);

	// Global mousemove and mouseup listeners for smooth dragging
	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (!isDraggingRef.current) return;
			const dx = e.clientX - startMouseRef.current.x;
			const dy = e.clientY - startMouseRef.current.y;

			if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
				hasMovedRef.current = true;
			}

			setPosition({
				x: startPosRef.current.x + dx,
				y: startPosRef.current.y + dy,
			});
		};

		const handleMouseUp = () => {
			if (isDraggingRef.current) {
				isDraggingRef.current = false;
				setIsDragging(false);
			}
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, []);

	// Handle keyboard shortcuts (Escape to close, +/- to zoom, 0 to reset)
	useEffect(() => {
		if (!data) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			} else if (e.key === "+" || e.key === "=") {
				e.preventDefault();
				setScale((prev) => Math.min(prev + 0.5, MAX_SCALE));
			} else if (e.key === "-") {
				e.preventDefault();
				setScale((prev) => {
					const next = Math.max(prev - 0.5, MIN_SCALE);
					if (next === 1) setPosition({ x: 0, y: 0 });
					return next;
				});
			} else if (e.key === "0") {
				e.preventDefault();
				setScale(1);
				setPosition({ x: 0, y: 0 });
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [data, onClose]);

	if (!data) return null;

	// Reset to 100% fit view
	const handleReset = () => {
		setScale(1);
		setPosition({ x: 0, y: 0 });
	};

	// Toggle between fit-to-window (1x) and zoomed-in (2.5x)
	const handleToggleZoom = () => {
		if (scale > 1) {
			handleReset();
		} else {
			setScale(DEFAULT_ZOOM_SCALE);
			setPosition({ x: 0, y: 0 });
		}
	};

	// Zoom in step
	const handleZoomIn = () => {
		setScale((prev) => Math.min(prev + 0.5, MAX_SCALE));
	};

	// Zoom out step
	const handleZoomOut = () => {
		setScale((prev) => {
			const next = Math.max(prev - 0.5, MIN_SCALE);
			if (next === 1) setPosition({ x: 0, y: 0 });
			return next;
		});
	};

	// Mouse wheel zoom
	const handleWheel = (e: React.WheelEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const delta = -e.deltaY;
		const step = 0.25;

		setScale((prev) => {
			const next = Math.min(
				Math.max(MIN_SCALE, prev + (delta > 0 ? step : -step)),
				MAX_SCALE,
			);
			if (next === 1) {
				setPosition({ x: 0, y: 0 });
			}
			return Math.round(next * 100) / 100;
		});
	};

	// Mouse down starts dragging
	const handleMouseDown = (e: React.MouseEvent) => {
		// Only trigger with left mouse click
		if (e.button !== 0) return;
		e.preventDefault();
		isDraggingRef.current = true;
		setIsDragging(true);
		hasMovedRef.current = false;
		startMouseRef.current = { x: e.clientX, y: e.clientY };
		startPosRef.current = { ...position };
	};

	// Single click toggles zoom if user didn't drag
	const handleClickImage = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (hasMovedRef.current) return;
		handleToggleZoom();
	};

	// Download image to local file
	const handleDownload = () => {
		if (!data.src) return;
		try {
			const link = document.createElement("a");
			link.href = data.src;
			const safeTitle = (data.title || "image")
				.replace(/[\\/:*?"<>|]/g, "_")
				.slice(0, 50);
			link.download = safeTitle.includes(".") ? safeTitle : `${safeTitle}.png`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			toast.success("已开始下载图片");
		} catch (err) {
			console.error("Failed to trigger image download:", err);
			window.open(data.src, "_blank");
		}
	};

	// Open raw image in standalone window/tab
	const handleOpenInNewTab = () => {
		if (!data.src) return;
		if (data.src.startsWith("data:")) {
			const win = window.open();
			if (win) {
				win.document.write(
					`<!DOCTYPE html><html><head><title>${data.title || "图片预览"}</title></head><body style="margin:0;background:#09090b;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${data.src}" style="max-width:100%;max-height:100%;object-fit:contain;" /></body></html>`,
				);
				win.document.close();
				return;
			}
		}
		window.open(data.src, "_blank", "noopener,noreferrer");
	};

	const isZoomed = scale > 1;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label={data.title || "图片预览"}
			className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-black/85 backdrop-blur-md animate-in fade-in duration-200 select-none overflow-hidden"
			onClick={onClose}
		>
			{/* Top Action Bar */}
			<div
				className="w-full flex items-center justify-between gap-3 text-white py-3 px-4 sm:px-6 bg-gradient-to-b from-black/60 to-transparent z-20 shrink-0"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Title and metadata */}
				<div className="flex items-center gap-2.5 min-w-0">
					<span className="text-sm font-semibold truncate max-w-[280px] sm:max-w-md drop-shadow-sm">
						{data.title || "图片预览"}
					</span>
					{data.subtitle && (
						<span className="text-xs text-white/70 bg-white/15 px-2 py-0.5 rounded-full drop-shadow-xs shrink-0 font-normal">
							{data.subtitle}
						</span>
					)}
					{isZoomed && (
						<span className="text-xs text-accent-light bg-accent/30 border border-accent/40 px-2 py-0.5 rounded-full drop-shadow-xs shrink-0 font-medium">
							{Math.round(scale * 100)}%
						</span>
					)}
				</div>

				{/* Controls */}
				<div className="flex items-center gap-1.5 shrink-0">
					{/* Zoom Out Button */}
					<button
						type="button"
						onClick={handleZoomOut}
						disabled={scale <= MIN_SCALE}
						className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 hover:text-white disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
						title="缩小 (-)"
						aria-label="缩小"
					>
						<ZoomOut className="w-4 h-4" />
					</button>

					{/* Zoom In Button */}
					<button
						type="button"
						onClick={handleZoomIn}
						disabled={scale >= MAX_SCALE}
						className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 hover:text-white disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
						title="放大 (+)"
						aria-label="放大"
					>
						<ZoomIn className="w-4 h-4" />
					</button>

					{/* Reset / Fit toggle */}
					{isZoomed ? (
						<button
							type="button"
							onClick={handleReset}
							className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 hover:text-white transition-all cursor-pointer"
							title="复原到适应屏幕 (0)"
							aria-label="复原"
						>
							<RotateCcw className="w-4 h-4" />
						</button>
					) : (
						<button
							type="button"
							onClick={handleToggleZoom}
							className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 hover:text-white transition-all cursor-pointer"
							title="放大查看 (250%)"
							aria-label="放大查看"
						>
							<Maximize2 className="w-4 h-4" />
						</button>
					)}

					{/* Download Button */}
					<button
						type="button"
						onClick={handleDownload}
						className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 hover:text-white transition-all cursor-pointer"
						title="下载图片"
						aria-label="下载图片"
					>
						<Download className="w-4 h-4" />
					</button>

					{/* Open in New Tab Button */}
					<button
						type="button"
						onClick={handleOpenInNewTab}
						className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 hover:text-white transition-all cursor-pointer"
						title="在新标签页中打开原图"
						aria-label="在新标签页中打开"
					>
						<ExternalLink className="w-4 h-4" />
					</button>

					{/* Close Button */}
					<button
						type="button"
						onClick={onClose}
						className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/80 active:scale-95 text-white transition-all cursor-pointer ml-1"
						title="关闭 (Esc)"
						aria-label="关闭预览"
					>
						<X className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Main Image Viewport Area */}
			<div
				className="flex-1 w-full h-full relative overflow-hidden flex items-center justify-center p-2 sm:p-4"
				onWheel={handleWheel}
				onClick={onClose}
			>
				<div
					className="relative flex items-center justify-center select-none"
					style={{
						transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
						transformOrigin: "center center",
						transition: isDragging ? "none" : "transform 0.18s cubic-bezier(0.2, 0, 0, 1)",
						cursor: isZoomed
							? isDragging
								? "grabbing"
								: "grab"
							: "zoom-in",
					}}
					onMouseDown={handleMouseDown}
					onClick={handleClickImage}
				>
					<img
						src={data.src}
						alt={data.title || "图片预览"}
						draggable={false}
						onLoad={() => setImgLoaded(true)}
						className={`rounded-lg shadow-2xl object-contain pointer-events-auto max-h-[82vh] max-w-[92vw] select-none ${
							imgLoaded ? "opacity-100" : "opacity-0"
						}`}
					/>

					{!imgLoaded && (
						<div className="absolute inset-0 flex items-center justify-center text-white/60 text-xs">
							正在加载图片...
						</div>
					)}
				</div>
			</div>

			{/* Bottom helper tip */}
			<div
				className="text-[11px] text-white/60 py-2.5 px-4 bg-gradient-to-t from-black/60 to-transparent z-20 shrink-0 pointer-events-none text-center"
				onClick={(e) => e.stopPropagation()}
			>
				{isZoomed ? (
					<span>按住鼠标左键可自由拖拽平移 · 滚轮缩放 · 点击还原 · 按 Esc 关闭</span>
				) : (
					<span>点击或滚轮放大 · 点击外部遮罩或按 Esc 关闭</span>
				)}
			</div>
		</div>
	);
}

/**
 * Provider that hosts the ImagePreviewModal and supplies open/close handlers to chat components
 */
export function ImagePreviewProvider({ children }: { children: ReactNode }) {
	const [previewImage, setPreviewImage] = useState<ImagePreviewData | null>(
		null,
	);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const openPreview = useCallback((data: ImagePreviewData) => {
		setPreviewImage(data);
	}, []);

	const closePreview = useCallback(() => {
		setPreviewImage(null);
	}, []);

	const contextValue = useMemo(
		() => ({
			previewImage,
			openPreview,
			closePreview,
		}),
		[previewImage, openPreview, closePreview],
	);

	return (
		<ImagePreviewContext.Provider value={contextValue}>
			{children}
			{mounted &&
				typeof document !== "undefined" &&
				createPortal(
					<ImagePreviewModal
						data={previewImage}
						onClose={closePreview}
					/>,
					document.body,
				)}
		</ImagePreviewContext.Provider>
	);
}
