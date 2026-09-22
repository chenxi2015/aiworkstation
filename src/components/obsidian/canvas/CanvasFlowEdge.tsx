import {
	BaseEdge,
	type Edge,
	EdgeLabelRenderer,
	type EdgeProps,
	getBezierPath,
} from "@xyflow/react";

export interface CanvasEdgeData extends Record<string, unknown> {
	/** Original color string from the .canvas file (preset id or hex) */
	rawColor?: string;
	label?: string;
	editing?: boolean;
	onCommitEdgeLabel?: (id: string, label: string) => void;
}

export type CanvasFlowEdge = Edge<CanvasEdgeData, "canvasEdge">;

function autoFocus(el: HTMLInputElement | null) {
	if (!el) return;
	el.focus();
	el.select();
}

/** Bezier edge with Obsidian-style centered label, double-click to edit */
export function CanvasEdgeComponent({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	style,
	markerEnd,
	data,
	interactionWidth,
}: EdgeProps<CanvasFlowEdge>) {
	const [path, labelX, labelY] = getBezierPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
	});
	const color = typeof style?.stroke === "string" ? style.stroke : undefined;

	return (
		<>
			<BaseEdge
				id={id}
				path={path}
				style={style}
				markerEnd={markerEnd}
				interactionWidth={interactionWidth}
			/>
			{(data?.label || data?.editing) && (
				<EdgeLabelRenderer>
					<div
						className="nodrag nopan absolute pointer-events-auto"
						style={{
							transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
						}}
					>
						{data?.editing ? (
							<input
								ref={autoFocus}
								defaultValue={data.label ?? ""}
								onBlur={(e) => data.onCommitEdgeLabel?.(id, e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") e.currentTarget.blur();
									if (e.key === "Escape") {
										data.onCommitEdgeLabel?.(id, data.label ?? "");
									}
								}}
								placeholder="标签"
								className="w-28 rounded border border-accent bg-surface px-1.5 py-0.5 text-[11px] text-foreground/90 outline-none shadow-sm"
							/>
						) : (
							<div
								className="rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] shadow-sm select-none"
								style={{ color }}
							>
								{data?.label}
							</div>
						)}
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	);
}
