import { Modal, toast } from "@heroui/react";
import {
	Copy,
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
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

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
 * Hook to trigger image preview modal from any component
 */
export function useImagePreview(): ImagePreviewContextValue {
	return useContext(ImagePreviewContext);
}

interface ImagePreviewModalProps {
	data: ImagePreviewData | null;
	onClose: () => void;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 6;
const DEFAULT_ZOOM_SCALE = 2.5;

/**
 * Fullscreen lightbox modal for previewing images with pinch-to-zoom, pan and action toolbar.
 * Uses HeroUI Modal.Backdrop to integrate with React Aria overlay hierarchy and prevent inert blocking.
 */
export function ImagePreviewModal({ data, onClose }: ImagePreviewModalProps) {
	const isOpen = Boolean(data);
	const [activeData, setActiveData] = useState<ImagePreviewData | null>(data);

	const [scale, setScale] = useState(1);
	const [position, setPosition] = useState({ x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);
	const [imgLoaded, setImgLoaded] = useState(false);

	const viewportRef = useRef<HTMLDivElement>(null);
	const scaleRef = useRef(scale);
	scaleRef.current = scale;
	const positionRef = useRef(position);
	positionRef.current = position;

	const isDraggingRef = useRef(false);
	const startMouseRef = useRef({ x: 0, y: 0 });
	const startPosRef = useRef({ x: 0, y: 0 });
	const hasMovedRef = useRef(false);

	// Synchronize active data
	useEffect(() => {
		if (data) {
			setActiveData(data);
			setScale(1);
			setPosition({ x: 0, y: 0 });
			setImgLoaded(false);
		}
	}, [data]);

	const handleReset = useCallback(() => {
		setScale(1);
		setPosition({ x: 0, y: 0 });
	}, []);

	// Native wheel listener for Mac trackpad pinch (e.ctrlKey) and mouse wheel zooming
	useEffect(() => {
		if (!isOpen) return;
		const viewport = viewportRef.current;
		if (!viewport) return;

		const handleWheel = (e: WheelEvent) => {
			e.preventDefault();
			e.stopPropagation();

			// Trackpad pinch-to-zoom (ctrlKey or metaKey) or mouse wheel
			const isPinch = e.ctrlKey || e.metaKey;
			const isMouseWheel =
				e.deltaMode !== 0 ||
				(e.deltaX === 0 &&
					Math.abs(e.deltaY) >= 40 &&
					Number.isInteger(e.deltaY));

			if (isPinch || isMouseWheel) {
				const rect = viewport.getBoundingClientRect();
				const cx = e.clientX - rect.left - rect.width / 2;
				const cy = e.clientY - rect.top - rect.height / 2;

				const delta = isPinch ? -e.deltaY * 0.015 : -e.deltaY * 0.0025;
				const factor = Math.exp(delta);

				setScale((prevScale) => {
					const nextScale = Math.max(
						MIN_SCALE,
						Math.min(MAX_SCALE, Math.round(prevScale * factor * 100) / 100),
					);
					if (nextScale === prevScale) return prevScale;

					// Anchor zoom coordinates relative to pointer position
					setPosition((prevPos) => {
						if (nextScale <= 1) return { x: 0, y: 0 };
						const scaleRatio = nextScale / prevScale;
						const newX = cx - (cx - prevPos.x) * scaleRatio;
						const newY = cy - (cy - prevPos.y) * scaleRatio;
						return {
							x: Math.round(newX * 10) / 10,
							y: Math.round(newY * 10) / 10,
						};
					});

					return nextScale;
				});
			} else if (scaleRef.current > 1) {
				// Two-finger trackpad panning when zoomed in
				setPosition((prev) => ({
					x: Math.round((prev.x - e.deltaX) * 10) / 10,
					y: Math.round((prev.y - e.deltaY) * 10) / 10,
				}));
			}
		};

		viewport.addEventListener("wheel", handleWheel, { passive: false });
		return () => {
			viewport.removeEventListener("wheel", handleWheel);
		};
	}, [isOpen]);

	// Safari macOS gesture events for native pinch-to-zoom
	useEffect(() => {
		if (!isOpen) return;
		const viewport = viewportRef.current;
		if (!viewport) return;

		let gestureStartScale = 1;

		const handleGestureStart = (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
			gestureStartScale = scaleRef.current;
		};

		const handleGestureChange = (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
			const gestureEvent = e as unknown as { scale: number };
			const nextScale = Math.max(
				MIN_SCALE,
				Math.min(
					MAX_SCALE,
					Math.round(gestureStartScale * gestureEvent.scale * 100) / 100,
				),
			);
			setScale(nextScale);
			if (nextScale <= 1) {
				setPosition({ x: 0, y: 0 });
			}
		};

		const handleGestureEnd = (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
		};

		viewport.addEventListener("gesturestart", handleGestureStart);
		viewport.addEventListener("gesturechange", handleGestureChange);
		viewport.addEventListener("gestureend", handleGestureEnd);

		return () => {
			viewport.removeEventListener("gesturestart", handleGestureStart);
			viewport.removeEventListener("gesturechange", handleGestureChange);
			viewport.removeEventListener("gestureend", handleGestureEnd);
		};
	}, [isOpen]);

	// Touchscreen two-finger pinch-to-zoom
	useEffect(() => {
		if (!isOpen) return;
		const viewport = viewportRef.current;
		if (!viewport) return;

		let initialTouchDist = 0;
		let initialTouchScale = 1;

		const handleTouchStart = (e: TouchEvent) => {
			if (e.touches.length === 2) {
				e.preventDefault();
				const t1 = e.touches[0];
				const t2 = e.touches[1];
				initialTouchDist = Math.hypot(
					t2.clientX - t1.clientX,
					t2.clientY - t1.clientY,
				);
				initialTouchScale = scaleRef.current;
			}
		};

		const handleTouchMove = (e: TouchEvent) => {
			if (e.touches.length === 2 && initialTouchDist > 0) {
				e.preventDefault();
				const t1 = e.touches[0];
				const t2 = e.touches[1];
				const currentDist = Math.hypot(
					t2.clientX - t1.clientX,
					t2.clientY - t1.clientY,
				);
				const factor = currentDist / initialTouchDist;
				const nextScale = Math.max(
					MIN_SCALE,
					Math.min(
						MAX_SCALE,
						Math.round(initialTouchScale * factor * 100) / 100,
					),
				);
				setScale(nextScale);
				if (nextScale <= 1) {
					setPosition({ x: 0, y: 0 });
				}
			}
		};

		const handleTouchEnd = (e: TouchEvent) => {
			if (e.touches.length < 2) {
				initialTouchDist = 0;
			}
		};

		viewport.addEventListener("touchstart", handleTouchStart, {
			passive: false,
		});
		viewport.addEventListener("touchmove", handleTouchMove, {
			passive: false,
		});
		viewport.addEventListener("touchend", handleTouchEnd);
		viewport.addEventListener("touchcancel", handleTouchEnd);

		return () => {
			viewport.removeEventListener("touchstart", handleTouchStart);
			viewport.removeEventListener("touchmove", handleTouchMove);
			viewport.removeEventListener("touchend", handleTouchEnd);
			viewport.removeEventListener("touchcancel", handleTouchEnd);
		};
	}, [isOpen]);

	// Keyboard shortcuts
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			} else if (e.key === "+" || e.key === "=") {
				e.preventDefault();
				setScale((prev) =>
					Math.min(Math.round((prev + 0.5) * 100) / 100, MAX_SCALE),
				);
			} else if (e.key === "-") {
				e.preventDefault();
				setScale((prev) => {
					const next = Math.max(
						Math.round((prev - 0.5) * 100) / 100,
						MIN_SCALE,
					);
					if (next <= 1) setPosition({ x: 0, y: 0 });
					return next;
				});
			} else if (e.key === "0") {
				e.preventDefault();
				handleReset();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose, handleReset]);

	if (!activeData && !isOpen) return null;

	const handleToggleZoom = () => {
		if (scale !== 1 || position.x !== 0 || position.y !== 0) {
			handleReset();
		} else {
			setScale(DEFAULT_ZOOM_SCALE);
			setPosition({ x: 0, y: 0 });
		}
	};

	const handleZoomIn = () => {
		setScale((prev) =>
			Math.min(Math.round((prev + 0.5) * 100) / 100, MAX_SCALE),
		);
	};

	const handleZoomOut = () => {
		setScale((prev) => {
			const next = Math.max(Math.round((prev - 0.5) * 100) / 100, MIN_SCALE);
			if (next <= 1) setPosition({ x: 0, y: 0 });
			return next;
		});
	};

	// Pointer drag handlers for panning
	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;
		if ((e.target as HTMLElement).closest("button")) return;

		isDraggingRef.current = true;
		hasMovedRef.current = false;
		startMouseRef.current = { x: e.clientX, y: e.clientY };
		startPosRef.current = { ...positionRef.current };

		try {
			e.currentTarget.setPointerCapture(e.pointerId);
		} catch {
			// ignore
		}
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!isDraggingRef.current) return;
		const dx = e.clientX - startMouseRef.current.x;
		const dy = e.clientY - startMouseRef.current.y;

		if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
			hasMovedRef.current = true;
			if (!isDragging) setIsDragging(true);
		}

		setPosition({
			x: Math.round((startPosRef.current.x + dx) * 10) / 10,
			y: Math.round((startPosRef.current.y + dy) * 10) / 10,
		});
	};

	const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
		if (isDraggingRef.current) {
			isDraggingRef.current = false;
			setIsDragging(false);
			try {
				e.currentTarget.releasePointerCapture(e.pointerId);
			} catch {
				// ignore
			}
		}
	};

	// Viewport click: close if clicking backdrop without dragging
	const handleViewportClick = (e: React.MouseEvent) => {
		if (hasMovedRef.current) return;
		if (e.target === viewportRef.current) {
			onClose();
		}
	};

	// Image click: toggle zoom if not dragged
	const handleImageClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (hasMovedRef.current) return;
		handleToggleZoom();
	};

	// Copy image URL
	const handleCopyUrl = async () => {
		if (!activeData?.src) return;
		try {
			await navigator.clipboard.writeText(activeData.src);
			toast.success("已复制图片链接到剪贴板");
		} catch {
			toast.danger("复制图片链接失败");
		}
	};

	// Download image file
	const handleDownload = async () => {
		if (!activeData?.src) return;
		const ext =
			activeData.src.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
		const filename = `image_${Date.now()}.${
			/^[a-z0-9]{2,5}$/.test(ext) ? ext : "png"
		}`;
		try {
			const res = await fetch(activeData.src);
			if (!res.ok) throw new Error(String(res.status));
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = filename;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			setTimeout(() => URL.revokeObjectURL(url), 5000);
			toast.success("已开始下载图片");
		} catch (err) {
			console.error("Failed to trigger image download:", err);
			const link = document.createElement("a");
			link.href = activeData.src;
			link.download = filename;
			link.rel = "noopener";
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		}
	};

	// Open raw image in standalone window
	const handleOpenInNewTab = () => {
		if (!activeData?.src) return;
		if (activeData.src.startsWith("data:")) {
			const win = window.open();
			if (win) {
				win.document.write(
					`<!DOCTYPE html><html><head><title>${
						activeData.title || "图片预览"
					}</title></head><body style="margin:0;background:#09090b;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${
						activeData.src
					}" style="max-width:100%;max-height:100%;object-fit:contain;" /></body></html>`,
				);
				win.document.close();
				return;
			}
		}
		window.open(activeData.src, "_blank", "noopener,noreferrer");
	};

	const isZoomed = scale !== 1;
	const isPanOrZoomActive =
		scale !== 1 || position.x !== 0 || position.y !== 0;

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			variant="blur"
			className="!z-[99999] fixed inset-0 flex flex-col items-center justify-between !bg-black/85 backdrop-blur-md p-0 select-none overflow-hidden"
		>
			<Modal.Container className="w-screen h-screen !max-w-none !max-h-none !w-full !h-full p-0 m-0 bg-transparent flex flex-col items-center justify-between">
				<Modal.Dialog
					aria-label={activeData?.title || "图片预览"}
					className="w-screen h-screen !max-w-none !max-h-none !w-full !h-full p-0 m-0 bg-transparent border-0 shadow-none flex flex-col items-center justify-between outline-none overflow-hidden"
				>
					{/* Top Action Bar */}
					{/* biome-ignore lint/a11y/noStaticElementInteractions: Top action toolbar container */}
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: Handled by keyboard shortcuts */}
					<div
						className="w-full flex items-center justify-between gap-3 text-white py-3 px-4 sm:px-6 bg-gradient-to-b from-black/80 to-transparent z-20 shrink-0 pointer-events-auto"
						onClick={(e) => e.stopPropagation()}
					>
						{/* Title and metadata */}
						<div className="flex items-center gap-2.5 min-w-0">
							<span className="text-sm font-semibold truncate max-w-[280px] sm:max-w-md drop-shadow-sm">
								{activeData?.title || "图片预览"}
							</span>
							{activeData?.subtitle && (
								<span className="text-xs text-white/70 bg-white/15 px-2 py-0.5 rounded-full drop-shadow-xs shrink-0 font-normal">
									{activeData.subtitle}
								</span>
							)}
							{isZoomed && (
								<span className="text-xs text-accent-light bg-accent/30 border border-accent/40 px-2 py-0.5 rounded-full drop-shadow-xs shrink-0 font-medium font-mono">
									{Math.round(scale * 100)}%
								</span>
							)}
						</div>

						{/* Action Controls Button Group */}
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

							{/* Reset / Fit Toggle */}
							{isPanOrZoomActive ? (
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

							{/* Copy URL Button */}
							<button
								type="button"
								onClick={handleCopyUrl}
								className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 hover:text-white transition-all cursor-pointer"
								title="复制图片链接"
								aria-label="复制图片链接"
							>
								<Copy className="w-4 h-4" />
							</button>

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
					{/* biome-ignore lint/a11y/noStaticElementInteractions: Interactive pan-and-zoom viewport canvas */}
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: Handled by keyboard shortcuts */}
					<div
						ref={viewportRef}
						className="flex-1 w-full h-full relative overflow-hidden flex items-center justify-center p-2 sm:p-4 touch-none select-none cursor-default"
						onPointerDown={handlePointerDown}
						onPointerMove={handlePointerMove}
						onPointerUp={handlePointerUp}
						onPointerCancel={handlePointerUp}
						onClick={handleViewportClick}
					>
						{/* biome-ignore lint/a11y/noStaticElementInteractions: Interactive pan-and-zoom image container */}
						{/* biome-ignore lint/a11y/useKeyWithClickEvents: Handled by keyboard shortcuts */}
						<div
							className="relative flex items-center justify-center select-none"
							style={{
								transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
								transformOrigin: "center center",
								transition: isDragging
									? "none"
									: "transform 0.12s cubic-bezier(0.2, 0, 0, 1)",
								cursor:
									scale > 1
										? isDragging
											? "grabbing"
											: "grab"
										: "zoom-in",
							}}
							onClick={handleImageClick}
						>
							{activeData && (
								<img
									src={activeData.src}
									alt={activeData.title || "图片预览"}
									draggable={false}
									onLoad={() => setImgLoaded(true)}
									className={`rounded-lg shadow-2xl object-contain pointer-events-auto max-h-[82vh] max-w-[92vw] select-none ${
										imgLoaded ? "opacity-100" : "opacity-0"
									}`}
								/>
							)}

							{!imgLoaded && (
								<div className="absolute inset-0 flex items-center justify-center text-white/60 text-xs">
									正在加载图片...
								</div>
							)}
						</div>
					</div>

					{/* Bottom helper tip */}
					<div className="text-[11px] text-white/60 py-2.5 px-4 bg-gradient-to-t from-black/80 to-transparent z-20 shrink-0 pointer-events-none text-center">
						<span>
							触控板双指缩放/捏合 · 滚轮缩放 · 拖拽平移 · 单击图片切换缩放 ·
							按 Esc 关闭
						</span>
					</div>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}

/**
 * Provider that supplies open/close image preview handlers to components
 */
export function ImagePreviewProvider({ children }: { children: ReactNode }) {
	const [previewImage, setPreviewImage] = useState<ImagePreviewData | null>(
		null,
	);

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
			<ImagePreviewModal data={previewImage} onClose={closePreview} />
		</ImagePreviewContext.Provider>
	);
}

