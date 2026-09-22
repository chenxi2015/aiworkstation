import React, { useMemo } from "react";
import {
	type CanvasEdge,
	type CanvasNode,
	edgePath,
	resolveColor,
} from "./canvasUtils";

export interface CanvasEdgesProps {
	edges: CanvasEdge[];
	byId: Map<string, CanvasNode>;
	isLOD?: boolean;
}

interface ComputedEdge {
	id: string;
	d: string;
	color: string;
	mid: { x: number; y: number } | null;
	label?: string;
}

export const CanvasEdges = React.memo(function CanvasEdges({
	edges,
	byId,
	isLOD = false,
}: CanvasEdgesProps) {
	// Pre-calculate and cache edge bezier paths
	const computedEdges = useMemo(() => {
		const result: ComputedEdge[] = [];
		for (const edge of edges) {
			const d = edgePath(edge, byId);
			if (!d) continue;
			const color = resolveColor(edge.color) ?? "currentColor";
			const from = byId.get(edge.fromNode);
			const to = byId.get(edge.toNode);
			const mid =
				from && to
					? {
							x: (from.x + from.width / 2 + to.x + to.width / 2) / 2,
							y: (from.y + from.height / 2 + to.y + to.height / 2) / 2,
						}
					: null;
			result.push({
				id: edge.id,
				d,
				color,
				mid,
				label: edge.label,
			});
		}
		return result;
	}, [edges, byId]);

	return (
		<svg
			className="absolute overflow-visible pointer-events-none"
			style={{ left: 0, top: 0, width: 1, height: 1 }}
		>
			<title>画布连线</title>
			<defs>
				<marker
					id="canvas-arrow"
					viewBox="0 0 10 10"
					refX="9"
					refY="5"
					markerWidth="7"
					markerHeight="7"
					orient="auto-start-reverse"
				>
					<path d="M 0 1 L 9 5 L 0 9 z" className="fill-muted" />
				</marker>
			</defs>
			{computedEdges.map((edge) => (
				<g key={edge.id} className="text-muted">
					<path
						d={edge.d}
						fill="none"
						stroke={edge.color}
						strokeWidth={1.5}
						markerEnd="url(#canvas-arrow)"
						opacity={0.8}
					/>
					{!isLOD && edge.label && edge.mid && (
						<text
							x={edge.mid.x}
							y={edge.mid.y}
							textAnchor="middle"
							className="fill-muted text-[12px] select-none"
						>
							{edge.label}
						</text>
					)}
				</g>
			))}
		</svg>
	);
});
