import { Card } from "@heroui/react";
import { ArrowUpRight, Bookmark, Check } from "lucide-react";
import { memo } from "react";
import { FolderAppGridCover } from "./folder/FolderAppGridCover";
import type { Folder } from "./types";

interface FolderCardProps {
	folder: Folder;
	isSelected: boolean;
	onClick: () => void;
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

export const FolderCard = memo(function FolderCard({
	folder,
	isSelected,
	onClick,
}: FolderCardProps) {
	const color = folder.color;
	const activeColor = color || DEFAULT_SELECTED_COLOR;
	const subtitle = folder.desc?.trim() || folder.category || "工作台文件夹";

	return (
		<Card
			role="button"
			tabIndex={0}
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") onClick();
			}}
			style={{
				borderColor: isSelected
					? activeColor
					: color
						? getHexWithAlpha(color, "40")
						: "var(--border)",
				boxShadow: isSelected
					? `0 0 0 1.5px ${activeColor}, 0 8px 24px -4px ${getHexWithAlpha(activeColor, "28")}`
					: undefined,
				background: isSelected
					? `radial-gradient(circle at 95% 5%, ${getHexWithAlpha(activeColor, "16")} 0%, transparent 60%), var(--surface)`
					: color
						? `radial-gradient(circle at 95% 5%, ${getHexWithAlpha(color, "0c")} 0%, transparent 55%), var(--surface)`
						: "var(--surface)",
			}}
			className={`group relative cursor-pointer rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.06)] active:scale-[0.985] ${
				isSelected
					? ""
					: !color
						? "hover:border-blue-400/60"
						: "hover:border-opacity-90"
			}`}
		>
			<Card.Header className="flex flex-row items-center justify-between pb-2 pt-3.5 px-4">
				{/* Mobile-style app micro-grid cover displaying website favicons */}
				<FolderAppGridCover folder={folder} size="md" />

				{/* Right status & micro-action indicator */}
				<div className="flex items-center gap-1.5 shrink-0">
					{/* When selected: refined check badge */}
					{isSelected ? (
						<span
							className="w-5 h-5 rounded-full flex items-center justify-center text-white shadow-2xs transition-transform"
							style={{ backgroundColor: activeColor }}
							title="已选定当前文件夹"
						>
							<Check className="w-3 h-3 stroke-[2.5]" />
						</span>
					) : color ? (
						/* Color breathing halo ring with seamless hover arrow transform */
						<div
							className="relative flex items-center justify-center w-5 h-5 rounded-full transition-transform"
							title={`文件夹主题色：${color}`}
						>
							<span
								className="absolute inset-0 rounded-full opacity-20 group-hover:opacity-35 transition-opacity duration-200"
								style={{ backgroundColor: color }}
							/>
							<span
								className="w-2.5 h-2.5 rounded-full shadow-2xs ring-2 ring-surface group-hover:scale-0 transition-transform duration-200"
								style={{ backgroundColor: color }}
							/>
							{/* Hover micro navigation hint with matching folder color */}
							<ArrowUpRight
								className="w-3.5 h-3.5 absolute opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200"
								style={{ color }}
							/>
						</div>
					) : (
						/* Neutral subtle arrow indicator appearing smoothly on hover */
						<div className="w-5 h-5 rounded-full flex items-center justify-center opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 text-muted hover:text-foreground">
							<ArrowUpRight className="w-3.5 h-3.5" />
						</div>
					)}
				</div>
			</Card.Header>

			<Card.Content className="py-1 px-4">
				<Card.Title className="text-[15px] font-bold tracking-tight text-foreground group-hover:text-primary transition-colors line-clamp-1 break-all">
					{folder.name}
				</Card.Title>
				<p className="text-[11px] text-muted/70 line-clamp-1 mt-0.5 break-all">
					{subtitle}
				</p>
			</Card.Content>

			<Card.Footer className="pt-2 pb-3 px-4 flex items-center justify-between">
				{/* Refined lightweight count badge replacing bulky gray chip */}
				<div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-foreground/[0.04] dark:bg-white/[0.06] border border-border/40 text-[11px] font-medium text-muted">
					<Bookmark className="w-3 h-3 opacity-60 shrink-0" />
					<span>{folder.items.length} 项内容</span>
				</div>
			</Card.Footer>
		</Card>
	);
});
