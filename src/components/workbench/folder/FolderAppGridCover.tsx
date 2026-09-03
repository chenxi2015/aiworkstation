import { memo, useState } from "react";
import { FolderIcon } from "../Icons";
import type { Folder, WorkbenchItem } from "../types";

interface FolderAppGridCoverProps {
	folder: Folder;
	size?: "sm" | "md" | "lg";
	className?: string;
}

/**
 * Safely extract hostname from URL string for Google S2 favicon service
 */
function getHostname(url?: string): string | null {
	if (!url) return null;
	try {
		const parsed = new URL(url);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") {
			return parsed.hostname;
		}
		return null;
	} catch {
		return null;
	}
}

// Deterministic placeholder keys for empty slots in 2x2 grid
const GHOST_SLOT_KEYS = ["ghost-a", "ghost-b", "ghost-c"] as const;

/**
 * Single micro app tile representing a bookmark item in the folder grid
 */
const MicroAppTile = memo(function MicroAppTile({
	item,
	layout,
	size = "md",
}: {
	item: WorkbenchItem;
	layout: "quarter" | "nine";
	size?: "sm" | "md" | "lg";
}) {
	const [hasError, setHasError] = useState(false);
	const hostname = getHostname(item.url);

	const imageSrc =
		item.favicon ||
		(hostname
			? `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`
			: null);

	// First character or fallback
	const initial = (item.name || "A").trim().charAt(0).toUpperCase();

	// Precise tile sizing mapped to parent cover size to guarantee perfect symmetry
	const tileClasses = {
		nine: {
			sm: "w-[9px] h-[9px] rounded-[2px]",
			md: "w-[10px] h-[10px] rounded-[2.5px]",
			lg: "w-3 h-3 rounded-[3px]",
		},
		quarter: {
			sm: "w-3.5 h-3.5 rounded-[3px]",
			md: "w-4 h-4 rounded-[4px]",
			lg: "w-5 h-5 rounded-[5px]",
		},
	}[layout][size];

	return (
		<div
			className={`${tileClasses} bg-white dark:bg-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.12)] flex items-center justify-center overflow-hidden shrink-0 transition-transform`}
			title={item.name}
		>
			{imageSrc && !hasError ? (
				<img
					src={imageSrc}
					alt=""
					loading="lazy"
					className="w-full h-full object-contain p-[1px]"
					onError={() => setHasError(true)}
				/>
			) : (
				<span className="text-[7px] font-bold text-foreground/70 leading-none select-none">
					{initial}
				</span>
			)}
		</div>
	);
});

/**
 * Focused single prominent app tile when folder contains exactly 1 item
 */
const SingleAppTile = memo(function SingleAppTile({
	item,
	size,
}: {
	item: WorkbenchItem;
	size: "sm" | "md" | "lg";
}) {
	const [hasError, setHasError] = useState(false);
	const hostname = getHostname(item.url);

	const imageSrc =
		item.favicon ||
		(hostname
			? `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`
			: null);

	const initial = (item.name || "A").trim().charAt(0).toUpperCase();

	const tileClasses = {
		sm: "w-7 h-7 rounded-[6px]",
		md: "w-9 h-9 rounded-[9px]",
		lg: "w-11 h-11 rounded-[11px]",
	}[size];

	return (
		<div
			className={`${tileClasses} bg-white dark:bg-zinc-800 shadow-[0_2px_6px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.7)] flex items-center justify-center overflow-hidden shrink-0 transition-transform group-hover:scale-105`}
			title={item.name}
		>
			{imageSrc && !hasError ? (
				<img
					src={imageSrc}
					alt=""
					loading="lazy"
					className="w-full h-full object-contain p-1"
					onError={() => setHasError(true)}
				/>
			) : (
				<span className="text-[11px] font-bold text-foreground/80 leading-none select-none">
					{initial}
				</span>
			)}
		</div>
	);
});

/**
 * Mobile-style (iOS / HyperOS) folder micro-grid cover displaying bookmark favicons
 */
export const FolderAppGridCover = memo(function FolderAppGridCover({
	folder,
	size = "md",
	className = "",
}: FolderAppGridCoverProps) {
	const items = folder.items || [];
	const color = folder.color;
	const count = items.length;

	// Adaptive layout strategy:
	// - 0: Empty folder icon
	// - 1: Single focused prominent tile (no empty grid void)
	// - 2~4: 2x2 grid with subtle placeholder slots
	// - >=5: 3x3 dense micro-app grid
	const isSingle = count === 1;
	const isQuarter = count > 1 && count <= 4;
	const maxDisplay = isSingle ? 1 : isQuarter ? 4 : 9;
	const displayItems = items.slice(0, maxDisplay);
	const emptySlotsCount = isQuarter ? 4 - displayItems.length : 0;

	// Symmetrical outer container sizes without restrictive padding
	const containerSizeClasses = {
		sm: "w-10 h-10 rounded-[12px]",
		md: "w-12 h-12 rounded-[14px]",
		lg: "w-14 h-14 rounded-[16px]",
	}[size];

	// Background styling based on folder color
	const containerStyle = color
		? {
				background: `linear-gradient(145deg, ${color}20 0%, ${color}08 100%)`,
				border: `1px solid ${color}35`,
				boxShadow: `0 4px 12px -2px ${color}20, inset 0 1px 1px rgba(255,255,255,0.4)`,
			}
		: {
				background:
					"linear-gradient(145deg, var(--surface-secondary), var(--surface-tertiary))",
				border: "1px solid var(--border)",
				boxShadow:
					"0 2px 8px rgba(0,0,0,0.04), inset 0 1px 1px rgba(255,255,255,0.6)",
			};

	// Empty state
	if (count === 0) {
		return (
			<div
				className={`${containerSizeClasses} ring-1 ring-black/5 dark:ring-white/10 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${className}`}
				style={{
					...containerStyle,
					color: color || "var(--accent)",
				}}
			>
				<FolderIcon className="w-5 h-5 transition-colors opacity-85" />
			</div>
		);
	}

	// Single item mode: centered prominent app tile
	if (isSingle) {
		return (
			<div
				className={`${containerSizeClasses} ring-1 ring-black/5 dark:ring-white/10 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 overflow-hidden ${className}`}
				style={containerStyle}
			>
				<SingleAppTile item={displayItems[0]} size={size} />
			</div>
		);
	}

	// Grid configuration for 2x2 and 3x3 layouts
	const gridCols = isQuarter
		? "grid-cols-2 grid-rows-2 gap-1"
		: "grid-cols-3 grid-rows-3 gap-0.5";

	return (
		<div
			className={`${containerSizeClasses} ring-1 ring-black/5 dark:ring-white/10 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 overflow-hidden ${className}`}
			style={containerStyle}
		>
			<div className={`grid place-items-center ${gridCols}`}>
				{displayItems.map((item, idx) => (
					<MicroAppTile
						key={item.id || `${item.name}-${idx}`}
						item={item}
						layout={isQuarter ? "quarter" : "nine"}
						size={size}
					/>
				))}
				{/* Subtle symmetric ghost slots for 2-3 items to keep balanced 2x2 symmetry */}
				{emptySlotsCount > 0 &&
					GHOST_SLOT_KEYS.slice(0, emptySlotsCount).map((key) => (
						<div
							key={key}
							className="w-1.5 h-1.5 rounded-full bg-foreground/10 dark:bg-white/15 self-center justify-self-center"
						/>
					))}
			</div>
		</div>
	);
});
