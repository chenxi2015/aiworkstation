import { AlertTriangle, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { CanvasEdges } from "./CanvasEdges";
import { CanvasNodeCard } from "./CanvasNodeCard";
import {
	type CanvasData,
	type CanvasNode,
	getViewportRect,
	isEdgeInViewport,
	isNodeInViewport,
	resolveColor,
	type ViewTransform,
} from "./canvasUtils";

export interface CanvasViewProps {
	/** .canvas file JSON text */
	content: string;
	/** Callback when clicking a note/canvas file card */
	onNavigateNote?: (relPath: string) => void;
}

/**
 * JSON Canvas read-only visualization:
 * - Viewport culling (renders only visible nodes and edges for high performance)
 * - Level of Detail (LOD) degradation under low zoom
 * - rAF-scheduled gesture pan & zoom
 * - GPU compositing acceleration with translate3d
 */
export function CanvasView({ content, onNavigateNote }: CanvasViewProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [transform, setTransform] = useState<ViewTransform>({
		x: 0,
		y: 0,
		k: 1,
	});
	const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

	const dragRef = useRef<{
		startX: number;
		startY: number;
		baseX: number;
		baseY: number;
	} | null>(null);

	const rafMoveId = useRef<number | null>(null);

	// Observe container size for accurate viewport bounds calculation
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const updateSize = () => {
			setContainerSize({
				width: container.clientWidth,
				height: container.clientHeight,
			});
		};

		updateSize();
		const ro = new ResizeObserver(updateSize);
		ro.observe(container);
		return () => ro.disconnect();
	}, []);

	const parsed = useMemo<{
		data: CanvasData | null;
		error: string | null;
	}>(() => {
		try {
			const raw = JSON.parse(content || "{}") as Partial<CanvasData>;
			return {
				data: {
					nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
					edges: Array.isArray(raw.edges) ? raw.edges : [],
				},
				error: null,
			};
		} catch (err) {
			return {
				data: null,
				error: err instanceof Error ? err.message : "JSON 解析失败",
			};
		}
	}, [content]);

	const byId = useMemo(() => {
		const map = new Map<string, CanvasNode>();
		for (const node of parsed.data?.nodes ?? []) {
			map.set(node.id, node);
		}
		return map;
	}, [parsed.data]);

	const bounds = useMemo(() => {
		const nodes = parsed.data?.nodes ?? [];
		if (nodes.length === 0) return null;
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (const node of nodes) {
			minX = Math.min(minX, node.x);
			minY = Math.min(minY, node.y);
			maxX = Math.max(maxX, node.x + node.width);
			maxY = Math.max(maxY, node.y + node.height);
		}
		return { minX, minY, maxX, maxY };
	}, [parsed.data]);

	const fitToView = useCallback(() => {
		const container = containerRef.current;
		if (!container || !bounds) return;
		const cw = container.clientWidth;
		const ch = container.clientHeight;
		const bw = Math.max(bounds.maxX - bounds.minX, 1);
		const bh = Math.max(bounds.maxY - bounds.minY, 1);
		const k = Math.min(cw / bw, ch / bh, 1) * 0.9;
		setTransform({
			k,
			x: (cw - bw * k) / 2 - bounds.minX * k,
			y: (ch - bh * k) / 2 - bounds.minY * k,
		});
	}, [bounds]);

	// Re-fit view when content or file changes
	const fitRef = useRef(fitToView);
	fitRef.current = fitToView;
	// biome-ignore lint/correctness/useExhaustiveDependencies: fitRef preserves latest fitToView, only trigger on parsed.data change
	useLayoutEffect(() => {
		fitRef.current();
	}, [parsed.data]);

	// Wheel event: normal scroll for panning, Ctrl/Cmd+wheel for zooming at cursor
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			setTransform((prev) => {
				if (e.ctrlKey || e.metaKey) {
					const rect = container.getBoundingClientRect();
					const px = e.clientX - rect.left;
					const py = e.clientY - rect.top;
					const factor = Math.exp(-e.deltaY * 0.002);
					const k = Math.min(Math.max(prev.k * factor, 0.1), 4);
					const scale = k / prev.k;
					return {
						k,
						x: px - (px - prev.x) * scale,
						y: py - (py - prev.y) * scale,
					};
				}
				return { ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY };
			});
		};

		container.addEventListener("wheel", onWheel, { passive: false });
		return () => container.removeEventListener("wheel", onWheel);
	}, []);

	// Pointer gestures with rAF throttling for 60-120fps smooth panning
	const onPointerDown = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if ((e.target as HTMLElement).closest("[data-canvas-node]")) return;
			dragRef.current = {
				startX: e.clientX,
				startY: e.clientY,
				baseX: transform.x,
				baseY: transform.y,
			};
			e.currentTarget.setPointerCapture(e.pointerId);
		},
		[transform],
	);

	const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current;
		if (!drag) return;

		const nextX = drag.baseX + (e.clientX - drag.startX);
		const nextY = drag.baseY + (e.clientY - drag.startY);

		if (rafMoveId.current !== null) {
			cancelAnimationFrame(rafMoveId.current);
		}

		rafMoveId.current = requestAnimationFrame(() => {
			setTransform((prev) => ({
				...prev,
				x: nextX,
				y: nextY,
			}));
			rafMoveId.current = null;
		});
	}, []);

	const onPointerUp = useCallback(() => {
		dragRef.current = null;
		if (rafMoveId.current !== null) {
			cancelAnimationFrame(rafMoveId.current);
			rafMoveId.current = null;
		}
	}, []);

	// Viewport culling bounds with 250px extra margin
	const viewportRect = useMemo(() => {
		if (containerSize.width === 0 || containerSize.height === 0) return null;
		return getViewportRect(
			containerSize.width,
			containerSize.height,
			transform,
			250,
		);
	}, [containerSize.width, containerSize.height, transform]);

	const isLOD = transform.k < 0.35;

	const allNodes = parsed.data?.nodes ?? [];
	const allEdges = parsed.data?.edges ?? [];

	// Filter nodes and edges visible inside viewport
	const visibleNodes = useMemo(() => {
		if (!viewportRect || allNodes.length < 30) return allNodes;
		return allNodes.filter((node) => isNodeInViewport(node, viewportRect));
	}, [allNodes, viewportRect]);

	const visibleEdges = useMemo(() => {
		if (!viewportRect || allEdges.length < 30) return allEdges;
		return allEdges.filter((edge) =>
			isEdgeInViewport(edge, byId, viewportRect),
		);
	}, [allEdges, byId, viewportRect]);

	const groups = useMemo(
		() => visibleNodes.filter((n) => n.type === "group"),
		[visibleNodes],
	);
	const cards = useMemo(
		() => visibleNodes.filter((n) => n.type !== "group"),
		[visibleNodes],
	);

	if (parsed.error) {
		return (
			<div className="h-full flex flex-col items-center justify-center text-center px-8">
				<AlertTriangle className="w-6 h-6 text-warning mb-3" />
				<p className="text-xs text-muted leading-relaxed">
					Canvas JSON 解析失败：{parsed.error}
					<br />
					可切换到源码模式修复
				</p>
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className="relative h-full overflow-hidden bg-surface/40 dark:bg-black/20 touch-none cursor-grab active:cursor-grabbing"
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerUp}
		>
			{allNodes.length === 0 && (
				<div className="absolute inset-0 flex items-center justify-center">
					<p className="text-xs text-muted">
						空画布，可在源码模式或 Obsidian 中添加节点
					</p>
				</div>
			)}
			<div
				className="absolute left-0 top-0 will-change-transform"
				style={{
					transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.k})`,
					transformOrigin: "0 0",
				}}
			>
				{groups.map((node) => {
					const color = resolveColor(node.color);
					return (
						<div
							key={node.id}
							data-canvas-node
							className="absolute rounded-xl border bg-surface/30 dark:bg-white/[0.03]"
							style={{
								left: node.x,
								top: node.y,
								width: node.width,
								height: node.height,
								borderColor: color ?? "rgba(128,128,128,0.3)",
							}}
						>
							{node.label && (
								<span
									className="absolute -top-6 left-1 text-sm font-semibold select-none"
									style={{ color: color ?? "inherit" }}
								>
									{node.label}
								</span>
							)}
						</div>
					);
				})}

				<CanvasEdges edges={visibleEdges} byId={byId} isLOD={isLOD} />

				{cards.map((node) => (
					<CanvasNodeCard
						key={node.id}
						node={node}
						onNavigateNote={onNavigateNote}
						isLOD={isLOD}
					/>
				))}
			</div>

			<div className="absolute right-3 bottom-3 flex flex-col gap-1 rounded-lg border border-border bg-surface/90 backdrop-blur p-1 shadow-sm">
				<button
					type="button"
					aria-label="放大"
					onClick={() =>
						setTransform((p) => ({ ...p, k: Math.min(p.k * 1.25, 4) }))
					}
					className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors"
				>
					<ZoomIn className="w-3.5 h-3.5" />
				</button>
				<button
					type="button"
					aria-label="缩小"
					onClick={() =>
						setTransform((p) => ({ ...p, k: Math.max(p.k / 1.25, 0.1) }))
					}
					className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors"
				>
					<ZoomOut className="w-3.5 h-3.5" />
				</button>
				<button
					type="button"
					aria-label="适配视口"
					onClick={fitToView}
					className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors"
				>
					<Maximize2 className="w-3.5 h-3.5" />
				</button>
			</div>
		</div>
	);
}
