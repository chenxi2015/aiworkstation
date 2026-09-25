import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { Download, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ChartEditModal } from "./ChartEditModal";
import {
	buildChartOption,
	echarts,
	parseChartSpec,
	serializeChartSpec,
} from "./chartSpec";

/**
 * 图表节点视图：ECharts 实时渲染 + 悬浮操作条（编辑数据 / 删除）。
 */
export function ChartNodeView({
	node,
	editor,
	selected,
	updateAttributes,
	deleteNode,
	getPos,
}: NodeViewProps) {
	const chartContainerRef = useRef<HTMLDivElement>(null);
	const chartInstanceRef = useRef<echarts.ECharts | null>(null);
	const [isEditing, setIsEditing] = useState(false);

	const specString = (node.attrs.spec as string) || "";
	const height = (node.attrs.height as number) || 320;

	// 初始化 / 更新图表
	useEffect(() => {
		const container = chartContainerRef.current;
		if (!container) return;
		if (!chartInstanceRef.current) {
			chartInstanceRef.current = echarts.init(container);
		}
		const instance = chartInstanceRef.current;
		instance.setOption(buildChartOption(parseChartSpec(specString)), {
			notMerge: true,
		});
		instance.resize({ height });
	}, [specString, height]);

	// 容器宽度变化时自适应（防抖避免死循环触发）
	useEffect(() => {
		const container = chartContainerRef.current;
		if (!container || typeof ResizeObserver === "undefined") return;
		let rafId: number | null = null;
		let lastWidth = container.clientWidth;

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			const newWidth = Math.round(entry.contentRect.width);
			if (Math.abs(newWidth - lastWidth) < 2) return;
			lastWidth = newWidth;

			if (rafId) cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => {
				chartInstanceRef.current?.resize();
			});
		});
		observer.observe(container);
		return () => {
			if (rafId) cancelAnimationFrame(rafId);
			observer.disconnect();
			chartInstanceRef.current?.dispose();
			chartInstanceRef.current = null;
		};
	}, []);

	const handleSelectNode = (e: React.MouseEvent) => {
		if ((e.target as HTMLElement).closest(".chart-action-toolbar")) return;
		e.preventDefault();
		e.stopPropagation();
		if (typeof getPos === "function") {
			const pos = getPos();
			if (typeof pos === "number") {
				editor.commands.setNodeSelection(pos);
				editor.view.focus();
			}
		}
	};

	const handleDownloadImage = () => {
		const instance = chartInstanceRef.current;
		if (!instance) return;
		const dataUrl = instance.getDataURL({
			type: "png",
			pixelRatio: 2,
			backgroundColor: "#ffffff",
		});
		const link = document.createElement("a");
		link.href = dataUrl;
		link.download = `chart-${Date.now()}.png`;
		link.click();
	};

	return (
		<NodeViewWrapper
			className="chart-node-wrapper my-3"
			data-drag-handle=""
			onClick={handleSelectNode}
		>
			<div
				className={`relative rounded-lg transition-shadow ${
					selected
						? "ring-2 ring-accent shadow-md"
						: "ring-1 ring-zinc-200 hover:ring-accent/40"
				}`}
			>
				<div
					ref={chartContainerRef}
					className="w-full"
					style={{ height: `${height}px` }}
				/>
				{(selected || isEditing) && (
					<div className="chart-action-toolbar absolute right-2 top-2 flex items-center gap-1 rounded-md border border-zinc-200 bg-white/95 p-1 shadow-sm">
						<button
							type="button"
							title="下载为图片"
							className="flex h-7 w-7 items-center justify-center rounded text-zinc-600 hover:bg-zinc-100"
							onClick={(e) => {
								e.stopPropagation();
								handleDownloadImage();
							}}
						>
							<Download className="h-4 w-4" />
						</button>
						<button
							type="button"
							title="编辑图表数据"
							className="flex h-7 w-7 items-center justify-center rounded text-zinc-600 hover:bg-zinc-100"
							onClick={(e) => {
								e.stopPropagation();
								setIsEditing(true);
							}}
						>
							<Pencil className="h-4 w-4" />
						</button>
						<button
							type="button"
							title="删除图表"
							className="flex h-7 w-7 items-center justify-center rounded text-zinc-600 hover:bg-red-50 hover:text-red-600"
							onClick={(e) => {
								e.stopPropagation();
								deleteNode();
							}}
						>
							<Trash2 className="h-4 w-4" />
						</button>
					</div>
				)}
			</div>
			<ChartEditModal
				isOpen={isEditing}
				initialSpec={parseChartSpec(specString)}
				onClose={() => setIsEditing(false)}
				onSave={(spec) => {
					updateAttributes({ spec: serializeChartSpec(spec) });
					setIsEditing(false);
				}}
			/>
		</NodeViewWrapper>
	);
}
