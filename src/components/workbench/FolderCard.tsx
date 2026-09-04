import { Card, Dropdown } from "@heroui/react";
import {
	ArrowUpRight,
	Check,
	ChevronRight,
	Ellipsis,
	FolderPlus,
	Link2,
	Pencil,
	Plus,
	Sparkles,
	Trash2,
} from "lucide-react";
import { memo } from "react";
import { useFolderDropIndicator } from "./dnd/WorkbenchDnd";
import { FolderAppGridCover } from "./folder/FolderAppGridCover";
import type { Folder as FolderType } from "./types";

interface FolderCardProps {
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
	childFolderCount = 0,
	onClick,
	onEnter,
	onEdit,
	onCreateFolder,
	onCreateLink,
	onDelete,
	onAskAI,
}: FolderCardProps) {
	const color = folder.color;
	const activeColor = color || DEFAULT_SELECTED_COLOR;
	const subtitle = folder.desc?.trim() || folder.category || "工作台文件夹";
	const dropMode = useFolderDropIndicator(folder.id);
	const hasActions =
		onEdit || onCreateFolder || onCreateLink || onDelete || onAskAI;

	return (
		<Card
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
							? `0 0 0 1.5px ${activeColor}, 0 8px 24px -4px ${getHexWithAlpha(activeColor, "28")}`
							: undefined,
				background: isSelected
					? `radial-gradient(circle at 95% 5%, ${getHexWithAlpha(activeColor, "16")} 0%, transparent 60%), var(--surface)`
					: color
						? `radial-gradient(circle at 95% 5%, ${getHexWithAlpha(color, "0c")} 0%, transparent 55%), var(--surface)`
						: "var(--surface)",
			}}
			className={`group relative cursor-pointer rounded-2xl border p-3 gap-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.06)] active:scale-[0.985] ${
				isSelected
					? ""
					: !color
						? "hover:border-blue-400/60"
						: "hover:border-opacity-90"
			}`}
		>
			{/* Reorder insertion indicators while drag-sorting folders */}
			{dropMode === "before" && (
				<span className="absolute -left-[7px] top-2 bottom-2 w-[3px] rounded-full bg-accent shadow-sm pointer-events-none" />
			)}
			{dropMode === "after" && (
				<span className="absolute -right-[7px] top-2 bottom-2 w-[3px] rounded-full bg-accent shadow-sm pointer-events-none" />
			)}

			<Card.Header className="flex flex-row items-start justify-between p-0">
				{/* Mobile-style app micro-grid cover displaying website favicons */}
				<FolderAppGridCover folder={folder} size="sm" />

				{/* Right status & micro-action indicator */}
				<div className="flex items-center gap-1.5 shrink-0">
					{/* When selected: refined check badge */}
					{isSelected ? (
						<span
							className="w-4.5 h-4.5 rounded-full flex items-center justify-center text-white shadow-2xs transition-transform"
							style={{ backgroundColor: activeColor }}
							title="已选定当前文件夹"
						>
							<Check className="w-2.5 h-2.5 stroke-[2.5]" />
						</span>
					) : color ? (
						/* Color breathing halo ring with seamless hover arrow transform */
						<div
							className="relative flex items-center justify-center w-4.5 h-4.5 rounded-full transition-transform"
							title={`文件夹主题色：${color}`}
						>
							<span
								className="absolute inset-0 rounded-full opacity-20 group-hover:opacity-35 transition-opacity duration-200"
								style={{ backgroundColor: color }}
							/>
							<span
								className="w-2 h-2 rounded-full shadow-2xs ring-2 ring-surface group-hover:scale-0 transition-transform duration-200"
								style={{ backgroundColor: color }}
							/>
							{/* Hover micro navigation hint with matching folder color */}
							<ArrowUpRight
								className="w-3 h-3 absolute opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200"
								style={{ color }}
							/>
						</div>
					) : (
						/* Neutral subtle arrow indicator appearing smoothly on hover */
						<div className="w-4.5 h-4.5 rounded-full flex items-center justify-center opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 text-muted hover:text-foreground">
							<ArrowUpRight className="w-3 h-3" />
						</div>
					)}
				</div>
			</Card.Header>

			<Card.Content className="p-0">
				<Card.Title className="text-[13.5px] font-semibold tracking-tight leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-1 break-all">
					{folder.name}
				</Card.Title>
				<p className="text-[11px] text-muted/70 line-clamp-1 mt-0.5 leading-normal break-all">
					{subtitle}
				</p>
			</Card.Content>

			<Card.Footer className="p-0 pt-0.5 flex items-center gap-1.5">
				<div className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-foreground/[0.03] dark:bg-white/[0.05] border border-border/40 text-[10.5px] font-medium text-muted/80 whitespace-nowrap shrink-0">
					链接 {folder.items.length}
				</div>
				{childFolderCount > 0 && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onEnter?.();
						}}
						className="group/sub inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-accent/10 border border-accent/25 text-[10.5px] font-medium text-accent whitespace-nowrap shrink-0 hover:bg-accent/20 transition-colors cursor-pointer"
						title="双击卡片或点击此处进入子文件夹"
					>
						文件夹 {childFolderCount}
						<ChevronRight className="w-2.5 h-2.5 shrink-0 transition-transform group-hover/sub:translate-x-0.5" />
					</button>
				)}

				{/* Folder action dropdown (edit / create / delete / AI summary) */}
				{hasActions && (
					// biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: wrapper only stops card-level click/keyboard selection
					<span
						className="ml-auto shrink-0"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
						onDoubleClick={(e) => e.stopPropagation()}
					>
						<Dropdown>
							<Dropdown.Trigger
								aria-label={`文件夹「${folder.name}」操作`}
								className="w-6 h-6 rounded-md flex items-center justify-center text-muted/70 hover:text-foreground hover:bg-foreground/[0.06] dark:hover:bg-white/[0.08] data-[pressed]:bg-foreground/[0.08] cursor-pointer transition-colors"
							>
								<Ellipsis className="w-3.5 h-3.5" />
							</Dropdown.Trigger>
							<Dropdown.Popover
								placement="bottom end"
								className="min-w-[168px] p-1 shadow-lg border border-border/80 rounded-xl bg-surface"
							>
								<Dropdown.Menu aria-label={`文件夹「${folder.name}」操作`}>
									{onAskAI && (
										<Dropdown.Item
											id="ai-summary"
											textValue="AI 总结与盘点"
											isDisabled={folder.items.length === 0}
											onAction={onAskAI}
										>
											<div className="flex items-center gap-2 w-full py-0.5">
												<Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
												<span className="text-xs font-medium flex-1">
													AI 总结与盘点
												</span>
											</div>
										</Dropdown.Item>
									)}
									{onEdit && (
										<Dropdown.Item id="edit" textValue="编辑" onAction={onEdit}>
											<div className="flex items-center gap-2 w-full py-0.5">
												<Pencil className="w-3.5 h-3.5 text-muted shrink-0" />
												<span className="text-xs font-medium flex-1">编辑</span>
											</div>
										</Dropdown.Item>
									)}
									{(onCreateFolder || onCreateLink) && (
										<Dropdown.SubmenuTrigger>
											<Dropdown.Item id="new" textValue="新建">
												<div className="flex items-center gap-2 w-full py-0.5">
													<Plus className="w-3.5 h-3.5 text-muted shrink-0" />
													<span className="text-xs font-medium flex-1">
														新建
													</span>
													<Dropdown.SubmenuIndicator />
												</div>
											</Dropdown.Item>
											<Dropdown.Popover className="min-w-[140px] p-1 shadow-lg border border-border/80 rounded-xl bg-surface">
												<Dropdown.Menu aria-label="新建">
													{onCreateFolder && (
														<Dropdown.Item
															id="new-folder"
															textValue="新建文件夹"
															onAction={() => onCreateFolder(folder)}
														>
															<div className="flex items-center gap-2 w-full py-0.5">
																<FolderPlus className="w-3.5 h-3.5 text-muted shrink-0" />
																<span className="text-xs font-medium flex-1">
																	文件夹
																</span>
															</div>
														</Dropdown.Item>
													)}
													{onCreateLink && (
														<Dropdown.Item
															id="new-link"
															textValue="新建链接"
															onAction={onCreateLink}
														>
															<div className="flex items-center gap-2 w-full py-0.5">
																<Link2 className="w-3.5 h-3.5 text-muted shrink-0" />
																<span className="text-xs font-medium flex-1">
																	链接
																</span>
															</div>
														</Dropdown.Item>
													)}
												</Dropdown.Menu>
											</Dropdown.Popover>
										</Dropdown.SubmenuTrigger>
									)}
									{onDelete && (
										<Dropdown.Item
											id="delete"
											textValue="删除"
											variant="danger"
											onAction={onDelete}
										>
											<div className="flex items-center gap-2 w-full py-0.5">
												<Trash2 className="w-3.5 h-3.5 shrink-0" />
												<span className="text-xs font-medium flex-1">删除</span>
											</div>
										</Dropdown.Item>
									)}
								</Dropdown.Menu>
							</Dropdown.Popover>
						</Dropdown>
					</span>
				)}
			</Card.Footer>
		</Card>
	);
});
