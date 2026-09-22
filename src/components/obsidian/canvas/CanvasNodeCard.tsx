import { ExternalLink, FileText, Waypoints } from "lucide-react";
import React from "react";
import { getVaultFileCategory, vaultAssetUrl } from "../utils/vaultFileUtils";
import { type CanvasNode, resolveColor } from "./canvasUtils";

export interface CanvasNodeCardProps {
	node: CanvasNode;
	onNavigateNote?: (relPath: string) => void;
	/** Level of detail flag for low-zoom optimization */
	isLOD?: boolean;
}

export const CanvasNodeCard = React.memo(function CanvasNodeCard({
	node,
	onNavigateNote,
	isLOD = false,
}: CanvasNodeCardProps) {
	const color = resolveColor(node.color);
	const style: React.CSSProperties = {
		left: node.x,
		top: node.y,
		width: node.width,
		height: node.height,
		borderColor: color,
		contain: "layout style",
	};

	const cardClass =
		"absolute rounded-lg border border-border bg-surface shadow-sm overflow-hidden";

	// Simplified rendering for overview/low-zoom state (LOD)
	if (isLOD) {
		return (
			<div
				data-canvas-node
				className={`${cardClass} flex items-center justify-center p-2 opacity-85 select-none`}
				style={style}
			>
				<div
					className="w-full h-full rounded bg-surface-secondary/40 flex items-center justify-center text-[10px] text-muted truncate px-1"
					style={{ borderLeft: color ? `3px solid ${color}` : undefined }}
				>
					{node.type === "text"
						? (node.text?.slice(0, 20) ?? "")
						: node.type === "file"
							? (node.file?.split("/").pop() ?? "")
							: (node.url ?? "")}
				</div>
			</div>
		);
	}

	if (node.type === "text") {
		return (
			<div
				data-canvas-node
				className={`${cardClass} p-3 text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap overflow-y-auto cursor-default`}
				style={style}
			>
				{node.text ?? ""}
			</div>
		);
	}

	if (node.type === "file" && node.file) {
		const file = node.file;
		const category = getVaultFileCategory(file);
		const name = file.split("/").pop() ?? file;

		if (category === "image") {
			return (
				<div data-canvas-node className={cardClass} style={style}>
					<img
						src={vaultAssetUrl(file)}
						alt={name}
						loading="lazy"
						decoding="async"
						className="w-full h-full object-cover select-none"
						draggable={false}
					/>
				</div>
			);
		}

		const isNavigable = category === "markdown" || category === "canvas";
		return (
			<button
				type="button"
				data-canvas-node
				disabled={!isNavigable}
				onClick={() => isNavigable && onNavigateNote?.(file)}
				className={`${cardClass} flex flex-col items-center justify-center gap-2 p-3 transition-colors ${
					isNavigable ? "hover:border-accent cursor-pointer" : "cursor-default"
				}`}
				style={style}
				title={file}
			>
				{category === "canvas" ? (
					<Waypoints className="w-5 h-5 text-muted" />
				) : (
					<FileText className="w-5 h-5 text-muted" />
				)}
				<span className="text-xs text-foreground/90 text-center break-all leading-snug">
					{category === "markdown" ? name.replace(/\.md$/i, "") : name}
				</span>
			</button>
		);
	}

	if (node.type === "link" && node.url) {
		let host = node.url;
		try {
			host = new URL(node.url).hostname;
		} catch {}
		return (
			<a
				data-canvas-node
				href={node.url}
				target="_blank"
				rel="noreferrer"
				className={`${cardClass} flex flex-col items-center justify-center gap-2 p-3 hover:border-accent transition-colors`}
				style={style}
			>
				<ExternalLink className="w-5 h-5 text-muted" />
				<span className="text-xs text-foreground/90 break-all text-center leading-snug">
					{host}
				</span>
			</a>
		);
	}

	return null;
});
