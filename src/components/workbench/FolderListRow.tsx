import { Check, ChevronRight } from "lucide-react";
import { memo } from "react";
import { useFolderDropIndicator } from "./dnd/WorkbenchDnd";
import { FolderActionsMenu } from "./FolderActionsMenu";
import { FolderAppGridCover } from "./folder/FolderAppGridCover";
import type { Folder as FolderType } from "./types";

interface FolderListRowProps {
	folder: FolderType;
	isSelected: boolean;
	childFolderCount?: number;
	onClick: () => void;
	onEnter?: () => void;
	onEdit?: () => void;
	onCreateFolder?: (folder: FolderType) => void;
	onCreateLink?: () => void;
	onDelete?: () => void;
	onAskAI?: () => void;
	allFolders?: FolderType[];
	onMoveFolder?: (folderId: number, targetParentId: number | null) => void;
}

// Default vibrant tech blue used for selection outline on folders without custom colors
const DEFAULT_SELECTED_COLOR = "#2563eb";

/**
 * Safely append hex opacity if the color is a valid 6-digit hex string
 */
function getHexWithAlpha(hex: string, alphaHex: string): string {
	if (hex.startsWith("#") && hex.length === 7) {
		return `${hex}${alphaHex}`;
	}
	return hex;
}

/**
 * Compact horizontal row variant of FolderCard, used when the workbench
 * folder area is switched to list view. Keeps the same interactions:
 * click to select, double-click to enter, drag/drop, and the shared
 * actions dropdown.
 */
export const FolderListRow = memo(function FolderListRow({
	folder,
	isSelected,
	childFolderCount = 0,
	onClick,
	onEnter,
	onEdit,
	onCreateFolder,
	onCreateLink,
	onDelete,
	onAskAI,
	allFolders,
	onMoveFolder,
}: FolderListRowProps) {
	const color = folder.color;
	const activeColor = color || DEFAULT_SELECTED_COLOR;
	const subtitle = folder.desc?.trim() || folder.category || "工作台文件夹";
	const dropMode = useFolderDropIndicator(folder.id);

	return (
		// biome-ignore lint/a11y/useSemanticElements: row keeps parity with FolderCard interactions (dbl-click enter, dnd slot)
		<div
			role="button"
			tabIndex={0}
			onClick={onClick}
			onDoubleClick={onEnter}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") onClick();
			}}
			style={{
				borderColor:
					dropMode === "into"
						? "var(--accent, #6366f1)"
						: isSelected
							? activeColor
							: color
								? getHexWithAlpha(color, "40")
								: "var(--border)",
				boxShadow:
					dropMode === "into"
						? "0 0 0 2px var(--accent, #6366f1), 0 8px 24px -4px rgba(99,102,241,0.25)"
						: isSelected
							? `0 0 0 1.5px ${activeColor}`
							: undefined,
				background: isSelected
					? `linear-gradient(90deg, ${getHexWithAlpha(activeColor, "10")} 0%, transparent 45%), var(--surface)`
					: "var(--surface)",
			}}
			className="group relative flex items-center gap-3 w-full rounded-xl border px-3 py-2 cursor-pointer transition-all duration-150 hover:bg-surface-secondary/60 hover:border-blue-400/50 active:scale-[0.995]"
		>
			{/* Reorder insertion indicators while drag-sorting folders */}
			{dropMode === "before" && (
				<span className="absolute left-2 right-2 -top-[5px] h-[3px] rounded-full bg-accent shadow-sm pointer-events-none" />
			)}
			{dropMode === "after" && (
				<span className="absolute left-2 right-2 -bottom-[5px] h-[3px] rounded-full bg-accent shadow-sm pointer-events-none" />
			)}

			<FolderAppGridCover folder={folder} size="sm" />

			<div className="min-w-0 flex-1">
				<p className="text-[13px] font-semibold tracking-tight leading-snug text-foreground group-hover:text-primary transition-colors truncate">
					{folder.name}
				</p>
				<p className="text-[11px] text-muted/70 truncate leading-normal">
					{subtitle}
				</p>
			</div>

			<div className="flex items-center gap-1.5 shrink-0">
				<div className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-foreground/[0.03] dark:bg-white/[0.05] border border-border/40 text-[10.5px] font-medium text-muted/80 whitespace-nowrap">
					链接 {folder.items.length}
				</div>
				{childFolderCount > 0 && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onEnter?.();
						}}
						className="group/sub inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-accent/10 border border-accent/25 text-[10.5px] font-medium text-accent whitespace-nowrap hover:bg-accent/20 transition-colors cursor-pointer"
						title="双击行或点击此处进入子文件夹"
					>
						文件夹 {childFolderCount}
						<ChevronRight className="w-2.5 h-2.5 shrink-0 transition-transform group-hover/sub:translate-x-0.5" />
					</button>
				)}

				{isSelected && (
					<span
						className="w-4.5 h-4.5 rounded-full flex items-center justify-center text-white shadow-2xs"
						style={{ backgroundColor: activeColor }}
						title="已选定当前文件夹"
					>
						<Check className="w-2.5 h-2.5 stroke-[2.5]" />
					</span>
				)}

				<FolderActionsMenu
					folder={folder}
					onEdit={onEdit}
					onCreateFolder={onCreateFolder}
					onCreateLink={onCreateLink}
					onDelete={onDelete}
					onAskAI={onAskAI}
					allFolders={allFolders}
					onMoveFolder={onMoveFolder}
				/>
			</div>
		</div>
	);
});
