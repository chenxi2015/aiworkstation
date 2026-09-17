import {
	AlertCircle,
	Download,
	Loader2,
	Maximize2,
	RotateCcw,
	X,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderMermaidToSvg } from "../../utils/mermaidRenderer";

interface MermaidPreviewProps {
	code: string;
	onSwitchToCode?: () => void;
	isFullscreen?: boolean;
	onCloseFullscreen?: () => void;
	onOpenFullscreen?: () => void;
	onDownloadSvgReady?: (handler: () => void) => void;
}

/**
 * Safely extracts the primary SVG from Mermaid's render output,
 * stripping any temporary measurement SVGs that cause duplicate small diagram ghosts.
 */
function extractPrimarySvg(rawHtml: string): string {
	if (!rawHtml) return "";
	const svgRegex = /<svg[\s\S]*?<\/svg>/gi;
	const matches = rawHtml.match(svgRegex);
	if (!matches || matches.length === 0) {
		return rawHtml;
	}
	// Return strictly the first primary diagram SVG
	return matches[0];
}

/**
 * Interactive viewport supporting wheel zoom and drag pan.
 *
 * 性能与交互要点：
 * - 变换状态放在 ref 里、直接写 DOM style，拖拽/滚轮不触发 React 重渲染（之前每次
 *   mousemove 都 setState + 75ms transition，导致拖动明显卡顿）
 * - 滚轮以光标为锚点缩放（focal-point zoom）
 * - 缩放通过修改 SVG 元素的显示宽度实现（矢量重排），而不是 CSS transform scale——
 *   后者是在已栅格化的合成层上拉伸，放大会模糊；改尺寸则任何倍率都清晰
 */

// 缩小保留下限避免彻底丢失；放大上限同时受倍率与像素宽度约束
// （SVG 按显示尺寸重栅格化，超过 ~16000px 浏览器层渲染会异常）
const MIN_ZOOM_SCALE = 0.05;
const MAX_ZOOM_SCALE = 30;
const MAX_ZOOM_WIDTH_PX = 16000;

function DiagramViewport({
	svgHtml,
	isFullscreen = false,
	onCloseFullscreen,
	onOpenFullscreen,
	onDownloadSvg,
}: {
	svgHtml: string;
	isFullscreen?: boolean;
	onCloseFullscreen?: () => void;
	onOpenFullscreen?: () => void;
	onDownloadSvg?: () => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const panRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const scaleLabelRef = useRef<HTMLSpanElement>(null);
	const baseSizeRef = useRef<{ width: number; height: number } | null>(null);
	const viewRef = useRef({ scale: 1, x: 0, y: 0 });
	const dragRef = useRef<{
		pointerId: number;
		startX: number;
		startY: number;
		baseX: number;
		baseY: number;
	} | null>(null);

	const applyTransform = useCallback((animate = false) => {
		const el = panRef.current;
		if (!el) return;
		const { scale, x, y } = viewRef.current;
		el.style.transition = animate ? "transform 180ms ease-out" : "none";
		// 平移走 transform（合成层位移，无重绘开销）
		el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
		// 缩放改 SVG 显示尺寸：矢量内容按新尺寸重排栅格化，任意倍率都清晰
		const svgEl = contentRef.current?.querySelector("svg");
		const base = baseSizeRef.current;
		if (svgEl && base) {
			svgEl.style.width = `${Math.round(base.width * scale)}px`;
		}
		if (scaleLabelRef.current) {
			scaleLabelRef.current.textContent = `${Math.round(scale * 100)}%`;
		}
	}, []);

	/** 以屏幕上某个点为锚点缩放（锚点下的内容保持不动） */
	const zoomAt = useCallback(
		(clientX: number, clientY: number, factor: number) => {
			const container = containerRef.current;
			if (!container) return;
			const view = viewRef.current;
			const base = baseSizeRef.current;
			// 像素宽度上限折算为倍率上限，防止超大 SVG 栅格化失败
			const scaleCap = base
				? Math.min(MAX_ZOOM_SCALE, MAX_ZOOM_WIDTH_PX / base.width)
				: MAX_ZOOM_SCALE;
			const next = Math.min(
				scaleCap,
				Math.max(MIN_ZOOM_SCALE, view.scale * factor),
			);
			if (next === view.scale) return;
			const rect = container.getBoundingClientRect();
			// 内容经 flex 居中，变换原点即容器中心
			const centerX = rect.left + rect.width / 2;
			const centerY = rect.top + rect.height / 2;
			const ratio = next / view.scale;
			view.x = clientX - centerX - (clientX - centerX - view.x) * ratio;
			view.y = clientY - centerY - (clientY - centerY - view.y) * ratio;
			view.scale = next;
			applyTransform();
		},
		[applyTransform],
	);

	const zoomFromCenter = useCallback(
		(factor: number) => {
			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect) return;
			zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
		},
		[zoomAt],
	);

	// Reset view
	const handleReset = useCallback(() => {
		viewRef.current = { scale: 1, x: 0, y: 0 };
		applyTransform(true);
	}, [applyTransform]);

	// Native non-passive wheel listener to strictly prevent browser page zoom.
	// exp 衰减系数让触控板双指捏合/滚轮都平滑连续。
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const handleNativeWheel = (e: WheelEvent) => {
			e.preventDefault();
			e.stopPropagation();
			zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0022));
		};

		container.addEventListener("wheel", handleNativeWheel, { passive: false });
		return () => {
			container.removeEventListener("wheel", handleNativeWheel);
		};
	}, [zoomAt]);

	// Drag to pan via Pointer Events (pointer capture ensures panning isn't interrupted outside container)
	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return; // Primary button only
		// Do not initiate drag or prevent default if clicking interactive elements
		const target = e.target as HTMLElement | null;
		if (
			target?.closest("button, [data-interactive='true'], select, input, a")
		) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		e.currentTarget.setPointerCapture(e.pointerId);
		const view = viewRef.current;
		dragRef.current = {
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			baseX: view.x,
			baseY: view.y,
		};
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current;
		if (!drag || e.pointerId !== drag.pointerId) return;
		e.preventDefault();
		e.stopPropagation();
		const view = viewRef.current;
		view.x = drag.baseX + (e.clientX - drag.startX);
		view.y = drag.baseY + (e.clientY - drag.startY);
		applyTransform();
	};

	const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dragRef.current) return;
		e.preventDefault();
		e.stopPropagation();
		dragRef.current = null;
	};

	// Inject cleaned SVG into DOM ref（新图复位视角）
	useEffect(() => {
		const host = contentRef.current;
		if (host) {
			host.innerHTML = svgHtml;
			const svgEl = host.querySelector("svg");
			if (svgEl) {
				// 记录固有尺寸（viewBox 优先），作为缩放的基准宽度
				const vb = svgEl.viewBox?.baseVal;
				baseSizeRef.current =
					vb && vb.width > 0 && vb.height > 0
						? { width: vb.width, height: vb.height }
						: null;
				// mermaid 默认 width="100%" + max-width 内联样式，会限制放大，全部解除
				svgEl.removeAttribute("width");
				svgEl.style.maxWidth = "none";
				svgEl.style.height = "auto";
				if (!baseSizeRef.current) {
					// 极少数无 viewBox 的 svg：按当前布局尺寸作为基准
					const rect = svgEl.getBoundingClientRect();
					if (rect.width > 0 && rect.height > 0) {
						baseSizeRef.current = {
							width: rect.width,
							height: rect.height,
						};
					}
				}
			} else {
				baseSizeRef.current = null;
			}
		}
		viewRef.current = { scale: 1, x: 0, y: 0 };
		applyTransform();
	}, [svgHtml, applyTransform]);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Diagram viewport interactive canvas
		// biome-ignore lint/a11y/useKeyWithClickEvents: Diagram viewport interactive canvas
		<div
			ref={containerRef}
			contentEditable={false}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
			onDoubleClick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				handleReset();
			}}
			onClick={(e) => {
				e.stopPropagation();
			}}
			style={{ overscrollBehavior: "contain", touchAction: "none" }}
			className={`relative w-full overflow-hidden select-none ${
				isFullscreen
					? "flex-1 w-full h-full bg-[#fafbfe] cursor-grab active:cursor-grabbing"
					: "h-[280px] bg-gradient-to-br from-[#f6f7fb] via-white to-[#f4f6fc] cursor-grab active:cursor-grabbing rounded-b-xl"
			}`}
		>
			{/* Subtle dot-grid canvas backdrop */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					backgroundImage:
						"radial-gradient(circle, rgba(148,163,184,0.28) 1px, transparent 1px)",
					backgroundSize: "22px 22px",
				}}
			/>

			{/* Draggable & Zoomable Canvas */}
			<div
				ref={panRef}
				className="w-full h-full flex items-center justify-center pointer-events-none"
				style={{ transformOrigin: "center center", willChange: "transform" }}
			>
				<div
					ref={contentRef}
					className="max-w-none max-h-none flex items-center justify-center [&>svg]:block [&>svg]:max-w-none [&>svg]:h-auto [&>svg]:drop-shadow-sm"
				/>
			</div>

			{/* Floating Controls Capsule */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: Floating controls stop propagation capsule */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: Floating controls stop propagation capsule */}
			<div
				contentEditable={false}
				onPointerDown={(e) => e.stopPropagation()}
				onPointerMove={(e) => e.stopPropagation()}
				onPointerUp={(e) => e.stopPropagation()}
				onMouseDown={(e) => e.stopPropagation()}
				onClick={(e) => e.stopPropagation()}
				onDoubleClick={(e) => e.stopPropagation()}
				style={{ touchAction: "auto" }}
				className="absolute right-3 bottom-3 flex items-center gap-1 p-1 rounded-full bg-white/90 backdrop-blur-md border border-zinc-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.08)] text-zinc-500 z-10 cursor-default pointer-events-auto select-none"
			>
				<button
					type="button"
					onClick={() => zoomFromCenter(1.25)}
					title="放大图表 (也可使用鼠标滚轮)"
					className="p-1.5 rounded-full hover:bg-zinc-100 active:bg-zinc-200 active:scale-95 text-zinc-500 hover:text-zinc-800 transition-all cursor-pointer"
				>
					<ZoomIn className="w-3.5 h-3.5" />
				</button>
				<button
					type="button"
					onClick={() => zoomFromCenter(0.8)}
					title="缩小图表 (也可使用鼠标滚轮)"
					className="p-1.5 rounded-full hover:bg-zinc-100 active:bg-zinc-200 active:scale-95 text-zinc-500 hover:text-zinc-800 transition-all cursor-pointer"
				>
					<ZoomOut className="w-3.5 h-3.5" />
				</button>
				<button
					type="button"
					onClick={handleReset}
					title="复位比例 - 也可双击画布复位"
					className="px-1.5 py-0.5 rounded-full hover:bg-zinc-100 active:bg-zinc-200 active:scale-95 text-[11px] font-mono text-zinc-500 hover:text-zinc-800 transition-all flex items-center gap-1 cursor-pointer"
				>
					<RotateCcw className="w-3 h-3" />
					<span ref={scaleLabelRef}>100%</span>
				</button>

				<div className="w-[1px] h-3.5 bg-zinc-200 mx-0.5" />

				{onDownloadSvg && (
					<button
						type="button"
						onClick={onDownloadSvg}
						title="下载为 SVG 矢量图"
						className="p-1.5 rounded-full hover:bg-zinc-100 active:bg-zinc-200 active:scale-95 text-zinc-500 hover:text-zinc-800 transition-all cursor-pointer"
					>
						<Download className="w-3.5 h-3.5" />
					</button>
				)}

				{!isFullscreen && onOpenFullscreen && (
					<button
						type="button"
						onClick={onOpenFullscreen}
						title="全屏放大查看"
						className="p-1.5 rounded-full hover:bg-zinc-100 active:bg-zinc-200 active:scale-95 text-zinc-500 hover:text-zinc-800 transition-all cursor-pointer"
					>
						<Maximize2 className="w-3.5 h-3.5" />
					</button>
				)}

				{isFullscreen && onCloseFullscreen && (
					<button
						type="button"
						onClick={onCloseFullscreen}
						title="退出全屏 (ESC)"
						className="p-1.5 rounded-full hover:bg-zinc-100 active:bg-zinc-200 active:scale-95 text-zinc-500 hover:text-zinc-800 transition-all cursor-pointer"
					>
						<X className="w-3.5 h-3.5" />
					</button>
				)}
			</div>
		</div>
	);
}

export function MermaidPreview({
	code,
	onSwitchToCode,
	isFullscreen = false,
	onCloseFullscreen,
	onOpenFullscreen,
	onDownloadSvgReady,
}: MermaidPreviewProps) {
	const [svgHtml, setSvgHtml] = useState<string>("");
	const [error, setError] = useState<string | null>(null);
	const [isRendering, setIsRendering] = useState<boolean>(false);
	// Defensively decode HTML entities (e.g., &gt; -> >, &amp; -> &) to avoid lexical errors with arrows
	const cleanCode = useMemo(() => {
		let res = code || "";
		let prev = "";
		while (res !== prev && /&(?:gt|lt|amp|quot|#39);/i.test(res)) {
			prev = res;
			res = res
				.replace(/&gt;/gi, ">")
				.replace(/&lt;/gi, "<")
				.replace(/&quot;/gi, '"')
				.replace(/&#39;/gi, "'")
				.replace(/&amp;/gi, "&");
		}
		return res.trim();
	}, [code]);

	// Render mermaid whenever cleanCode changes
	useEffect(() => {
		if (!cleanCode) {
			setSvgHtml("");
			setError(null);
			return;
		}

		let isCurrent = true;
		setIsRendering(true);

		renderMermaidToSvg(cleanCode)
			.then((svg) => {
				if (!isCurrent) return;
				// Filter out duplicate measurement artifacts
				const cleanSvg = extractPrimarySvg(svg);
				setSvgHtml(cleanSvg);
				setError(null);
				setIsRendering(false);
			})
			.catch((err) => {
				if (!isCurrent) return;
				const errMsg = err instanceof Error ? err.message : String(err);
				setError(errMsg);
				setIsRendering(false);
			});

		return () => {
			isCurrent = false;
		};
	}, [cleanCode]);

	// Expose SVG download function
	const handleDownloadSvg = useCallback(() => {
		if (!svgHtml) return;
		const blob = new Blob([svgHtml], { type: "image/svg+xml;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `mermaid-diagram-${Date.now()}.svg`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}, [svgHtml]);

	useEffect(() => {
		if (onDownloadSvgReady) {
			onDownloadSvgReady(handleDownloadSvg);
		}
	}, [onDownloadSvgReady, handleDownloadSvg]);

	// Listen for ESC key to close fullscreen
	useEffect(() => {
		if (!isFullscreen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && onCloseFullscreen) {
				onCloseFullscreen();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isFullscreen, onCloseFullscreen]);

	if (!cleanCode) {
		return (
			<div className="flex flex-col items-center justify-center p-8 text-zinc-500 text-xs font-mono">
				请输入 Mermaid 代码或由 AI 生成图表…
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center p-6 text-center gap-2 text-zinc-300">
				<div className="flex items-center gap-1.5 text-amber-400 text-xs font-medium">
					<AlertCircle className="w-4 h-4 shrink-0" />
					<span>Mermaid 语法未完成或存在错误</span>
				</div>
				<p className="text-[11px] text-zinc-500 font-mono max-w-md line-clamp-2 px-4">
					{error}
				</p>
				{onSwitchToCode && (
					<button
						type="button"
						onClick={onSwitchToCode}
						className="mt-1 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-md transition-colors cursor-pointer"
					>
						切换到代码模式修改
					</button>
				)}
			</div>
		);
	}

	return (
		<>
			{/* Normal Inline View */}
			<div className="relative w-full">
				{isRendering && !svgHtml && (
					<div className="h-[280px] flex items-center justify-center text-zinc-500 gap-2 text-xs">
						<Loader2 className="w-4 h-4 animate-spin" />
						<span>渲染图表中…</span>
					</div>
				)}

				{svgHtml && (
					<DiagramViewport
						svgHtml={svgHtml}
						isFullscreen={false}
						onOpenFullscreen={onOpenFullscreen}
						onDownloadSvg={handleDownloadSvg}
					/>
				)}
			</div>

			{/* Fullscreen Modal View rendered via Portal into document.body */}
			{isFullscreen &&
				typeof document !== "undefined" &&
				createPortal(
					<div className="fixed inset-0 z-[999999] bg-[#0c0c0e] flex flex-col animate-in fade-in duration-150 select-none">
						{/* Modal Topbar */}
						<div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800/80 bg-[#16161a] text-zinc-200">
							<div className="flex items-center gap-2.5">
								<span className="font-semibold text-sm tracking-wide">
									Mermaid 架构图全屏浏览
								</span>
								<span className="text-xs text-zinc-500 font-mono">
									(支持鼠标滚轮放大缩小、鼠标拖拽平移、按 ESC 退出)
								</span>
							</div>

							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={handleDownloadSvg}
									className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
								>
									<Download className="w-3.5 h-3.5" />
									<span>下载 SVG</span>
								</button>
								<button
									type="button"
									onClick={onCloseFullscreen}
									className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
									title="关闭 (ESC)"
								>
									<X className="w-5 h-5" />
								</button>
							</div>
						</div>

						{/* Modal Content with Pan & Zoom */}
						<div className="flex-1 w-full h-full relative overflow-hidden">
							<DiagramViewport
								svgHtml={svgHtml}
								isFullscreen={true}
								onCloseFullscreen={onCloseFullscreen}
								onDownloadSvg={handleDownloadSvg}
							/>
						</div>
					</div>,
					document.body,
				)}
		</>
	);
}
