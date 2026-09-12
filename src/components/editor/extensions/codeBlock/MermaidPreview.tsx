import { createMermaidPlugin } from "@streamdown/mermaid";
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
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";

interface MermaidPreviewProps {
	code: string;
	onSwitchToCode?: () => void;
	isFullscreen?: boolean;
	onCloseFullscreen?: () => void;
	onOpenFullscreen?: () => void;
	onDownloadSvgReady?: (handler: () => void) => void;
}

// Dedicated Mermaid instance with dark mode and transparent background
const mermaidPlugin = createMermaidPlugin({
	config: {
		startOnLoad: false,
		theme: "dark",
		darkMode: true,
		securityLevel: "loose",
		fontFamily:
			"ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
		themeVariables: {
			darkMode: true,
			background: "transparent",
			mainBkg: "#27272a",
			nodeBorder: "#3f3f46",
			primaryColor: "#2563eb",
			primaryTextColor: "#f4f4f5",
			primaryBorderColor: "#3b82f6",
			lineColor: "#94a3b8",
			secondaryColor: "#1e293b",
			tertiaryColor: "#09090b",
			textColor: "#f4f4f5",
			fontFamily: "ui-sans-serif, system-ui, sans-serif",
			fontSize: "13px",
		},
	},
});

const mermaidInstance = mermaidPlugin.getMermaid();

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
 * Interactive viewport supporting wheel zoom and mouse drag pan
 */
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
	const [scale, setScale] = useState(1);
	const [position, setPosition] = useState({ x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);
	const dragStartRef = useRef({ x: 0, y: 0 });
	const containerRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);

	// Reset view
	const handleReset = useCallback(() => {
		setScale(1);
		setPosition({ x: 0, y: 0 });
	}, []);

	// Zoom controls
	const handleZoomIn = useCallback(() => {
		setScale((prev) => Math.min(prev * 1.25, 5));
	}, []);

	const handleZoomOut = useCallback(() => {
		setScale((prev) => Math.max(prev * 0.8, 0.2));
	}, []);

	// Native non-passive wheel listener to strictly prevent browser page zoom
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const handleNativeWheel = (e: WheelEvent) => {
			e.preventDefault();
			e.stopPropagation();
			const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
			setScale((prev) => Math.min(Math.max(prev * zoomFactor, 0.2), 5));
		};

		container.addEventListener("wheel", handleNativeWheel, { passive: false });
		return () => {
			container.removeEventListener("wheel", handleNativeWheel);
		};
	}, []);

	// Drag to pan (prevent text selection & stop bubble to editor)
	const handleMouseDown = (e: React.MouseEvent) => {
		if (e.button !== 0) return; // Primary button only
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(true);
		dragStartRef.current = {
			x: e.clientX - position.x,
			y: e.clientY - position.y,
		};
	};

	const handleMouseMove = (e: React.MouseEvent) => {
		if (!isDragging) return;
		e.preventDefault();
		e.stopPropagation();
		setPosition({
			x: e.clientX - dragStartRef.current.x,
			y: e.clientY - dragStartRef.current.y,
		});
	};

	const handleMouseUp = (e: React.MouseEvent) => {
		if (isDragging) {
			e.preventDefault();
			e.stopPropagation();
			setIsDragging(false);
		}
	};

	// Inject cleaned SVG into DOM ref
	useEffect(() => {
		if (contentRef.current) {
			contentRef.current.innerHTML = svgHtml;
		}
	}, [svgHtml]);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Diagram viewport interactive canvas
		// biome-ignore lint/a11y/useKeyWithClickEvents: Diagram viewport interactive canvas
		<div
			ref={containerRef}
			contentEditable={false}
			onMouseDown={handleMouseDown}
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
			onMouseLeave={handleMouseUp}
			onDoubleClick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				handleReset();
			}}
			onClick={(e) => {
				e.stopPropagation();
			}}
			style={{ overscrollBehavior: "contain" }}
			className={`relative w-full overflow-hidden select-none ${
				isFullscreen
					? "flex-1 w-full h-full bg-[#0d0d10] cursor-grab active:cursor-grabbing"
					: "h-[280px] bg-[#1a1a1a]/60 cursor-grab active:cursor-grabbing rounded-b-xl"
			}`}
		>
			{/* Draggable & Zoomable Canvas */}
			<div
				className="w-full h-full flex items-center justify-center pointer-events-none transition-transform duration-75 ease-out"
				style={{
					transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
					transformOrigin: "center center",
				}}
			>
				<div
					ref={contentRef}
					className="max-w-none max-h-none flex items-center justify-center [&>svg]:block [&>svg]:max-w-none [&>svg]:h-auto [&>svg]:drop-shadow-sm"
				/>
			</div>

			{/* Floating Controls Capsule */}
			<div className="absolute right-3 bottom-3 flex items-center gap-1 p-1 rounded-lg bg-zinc-900/85 backdrop-blur-md border border-zinc-700/60 shadow-lg text-zinc-300 z-10">
				<button
					type="button"
					onClick={handleZoomIn}
					title="放大图表 (也可使用鼠标滚轮)"
					className="p-1.5 rounded hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
				>
					<ZoomIn className="w-3.5 h-3.5" />
				</button>
				<button
					type="button"
					onClick={handleZoomOut}
					title="缩小图表 (也可使用鼠标滚轮)"
					className="p-1.5 rounded hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
				>
					<ZoomOut className="w-3.5 h-3.5" />
				</button>
				<button
					type="button"
					onClick={handleReset}
					title={`复位比例 (${Math.round(scale * 100)}%) - 也可双击画布复位`}
					className="px-1.5 py-0.5 rounded hover:bg-zinc-800 text-[11px] font-mono text-zinc-300 hover:text-zinc-100 transition-colors flex items-center gap-1 cursor-pointer"
				>
					<RotateCcw className="w-3 h-3" />
					<span>{Math.round(scale * 100)}%</span>
				</button>

				<div className="w-[1px] h-3.5 bg-zinc-700 mx-0.5" />

				{onDownloadSvg && (
					<button
						type="button"
						onClick={onDownloadSvg}
						title="下载为 SVG 矢量图"
						className="p-1.5 rounded hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
					>
						<Download className="w-3.5 h-3.5" />
					</button>
				)}

				{!isFullscreen && onOpenFullscreen && (
					<button
						type="button"
						onClick={onOpenFullscreen}
						title="全屏放大查看"
						className="p-1.5 rounded hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
					>
						<Maximize2 className="w-3.5 h-3.5" />
					</button>
				)}

				{isFullscreen && onCloseFullscreen && (
					<button
						type="button"
						onClick={onCloseFullscreen}
						title="退出全屏 (ESC)"
						className="p-1.5 rounded hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
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
	const baseId = useId().replace(/[^a-zA-Z0-9]/g, "");

	const trimmedCode = useMemo(() => code.trim(), [code]);

	// Render mermaid whenever trimmedCode changes
	useEffect(() => {
		if (!trimmedCode) {
			setSvgHtml("");
			setError(null);
			return;
		}

		let isCurrent = true;
		const renderId = `mermaid-${baseId}-${Date.now().toString(36)}`;
		setIsRendering(true);

		mermaidInstance
			.render(renderId, trimmedCode)
			.then((result) => {
				if (!isCurrent) return;
				// Filter out duplicate measurement artifacts
				const cleanSvg = extractPrimarySvg(result.svg);
				setSvgHtml(cleanSvg);
				setError(null);
				setIsRendering(false);
			})
			.catch((err) => {
				if (!isCurrent) return;
				const orphan = document.getElementById(`d${renderId}`);
				if (orphan) orphan.remove();

				const errMsg = err instanceof Error ? err.message : String(err);
				setError(errMsg);
				setIsRendering(false);
			});

		return () => {
			isCurrent = false;
		};
	}, [trimmedCode, baseId]);

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

	if (!trimmedCode) {
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
