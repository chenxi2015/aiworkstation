import { Card, Chip, Dropdown, Tooltip, toast } from "@heroui/react";
import {
	ArrowUpRight,
	Copy,
	Ellipsis,
	ExternalLink,
	Globe,
	Tag,
	Trash2,
} from "lucide-react";
import type React from "react";
import { memo, useState } from "react";
import { extractDomain } from "../../../lib/url";
import { FolderAssignMenu } from "../folder/FolderAssignMenu";
import { ItemFavicon } from "../ItemFavicon";
import { type Folder, ITEM_TYPES, type WorkbenchItem } from "../types";

export interface WorkbenchItemCardProps {
	item: WorkbenchItem;
	index?: number;
	otherFolders?: Folder[];
	showMoveDropdown?: boolean;
	showTypeBadge?: boolean;
	footerExtra?: React.ReactNode;
	className?: string;
	compact?: boolean;
	onDeleteItem?: (item: WorkbenchItem) => void;
	onMoveItem?: (item: WorkbenchItem, targetFolderId: number) => void;
}

/**
 * Reusable bookmark / item card component used across folder details and unclassified lists.
 * Supports compact mode for clean sidebars, and full card mode for multi-column feeds.
 */
export const WorkbenchItemCard = memo(function WorkbenchItemCard({
	item,
	otherFolders = [],
	showMoveDropdown = false,
	showTypeBadge = true,
	footerExtra,
	className,
	compact = false,
	onDeleteItem,
	onMoveItem,
}: WorkbenchItemCardProps) {
	const [isAssignMenuOpen, setIsAssignMenuOpen] = useState(false);
	const [isCardMenuOpen, setIsCardMenuOpen] = useState(false);

	const typeInfo = (item.type && ITEM_TYPES[item.type]) || {
		label: "其他",
		color: "currentColor",
	};
	const domain = extractDomain(item.url);

	const handleOpenLink = (url?: string) => {
		if (url) {
			window.open(url, "_blank", "noopener,noreferrer");
		}
	};

	const handleCopyLink = (url?: string) => {
		if (url) {
			navigator.clipboard.writeText(url);
			toast.success("已复制链接到剪贴板");
		}
	};

	if (compact) {
		return (
			<div
				className={`group/item flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border transition-all ${
					isAssignMenuOpen
						? "bg-surface-secondary border-accent/40 shadow-xs"
						: "hover:bg-surface-secondary/70 border-transparent hover:border-border/60"
				} ${className || ""}`}
			>
				{/* Favicon & Title Button */}
				<button
					type="button"
					onClick={() => handleOpenLink(item.url)}
					className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer text-left"
				>
					<div className="w-5 h-5 rounded-md bg-surface flex items-center justify-center shrink-0 text-accent shadow-2xs">
						<ItemFavicon
							url={item.url}
							favicon={item.favicon}
							type={item.type}
							name={item.name}
							size="xs"
						/>
					</div>
					<div className="min-w-0 flex-1">
						<div
							className={`text-xs font-medium truncate transition-colors ${
								isAssignMenuOpen
									? "text-accent"
									: "text-foreground group-hover/item:text-accent"
							}`}
							title={item.name}
						>
							{item.name}
						</div>
						{domain && (
							<div className="text-[10px] text-muted font-mono truncate leading-none mt-0.5">
								{domain}
							</div>
						)}
					</div>
				</button>

				{/* Actions (visible on hover or when assign menu is open) */}
				<div
					className={`flex items-center gap-0.5 transition-opacity shrink-0 ${
						isAssignMenuOpen
							? "opacity-100"
							: "opacity-0 group-hover/item:opacity-100"
					}`}
				>
					{item.url && (
						<Tooltip>
							<Tooltip.Trigger>
								<button
									type="button"
									onClick={() => handleOpenLink(item.url)}
									className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-foreground hover:bg-surface cursor-pointer transition-colors"
									aria-label="打开链接"
								>
									<ExternalLink className="w-3 h-3" />
								</button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-xs py-1 px-2">
								打开
							</Tooltip.Content>
						</Tooltip>
					)}

					{item.url && (
						<Tooltip>
							<Tooltip.Trigger>
								<button
									type="button"
									onClick={() => handleCopyLink(item.url)}
									className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-foreground hover:bg-surface cursor-pointer transition-colors"
									aria-label="复制链接"
								>
									<Copy className="w-3 h-3" />
								</button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-xs py-1 px-2">
								复制链接
							</Tooltip.Content>
						</Tooltip>
					)}

					{showMoveDropdown && onMoveItem && otherFolders.length > 0 && (
						<FolderAssignMenu
							mode="button"
							folders={otherFolders}
							currentFolderId={item.folderId}
							originalFolderName={item.folderName}
							onSelectFolder={(targetId) => onMoveItem(item, targetId)}
							onOpenChange={setIsAssignMenuOpen}
							triggerClassName="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-foreground hover:bg-surface cursor-pointer transition-colors"
						/>
					)}

					{onDeleteItem && (
						<Tooltip>
							<Tooltip.Trigger>
								<button
									type="button"
									onClick={() => onDeleteItem(item)}
									className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-danger hover:bg-danger-soft/20 cursor-pointer transition-colors"
									aria-label="删除此条目"
								>
									<Trash2 className="w-3 h-3" />
								</button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-xs py-1 px-2">
								删除
							</Tooltip.Content>
						</Tooltip>
					)}
				</div>
			</div>
		);
	}

	return (
		<Card
			className={`group/card p-3 rounded-xl bg-surface hover:bg-surface border transition-all duration-150 flex flex-col justify-between h-full ${
				isCardMenuOpen
					? "border-accent/50 shadow-md ring-1 ring-accent/20"
					: "border-border/80 hover:border-accent/40 shadow-xs hover:shadow-md"
			} ${className || ""}`}
		>
			{/* Item Body Content */}
			<div className="flex-1 flex flex-col gap-1.5 min-w-0">
				{/* Item Header Row */}
				<div className="flex items-start justify-between gap-1.5">
					<button
						type="button"
						onClick={() => handleOpenLink(item.url)}
						className="flex items-start gap-2 flex-1 min-w-0 cursor-pointer text-left"
					>
						<div className="w-6 h-6 rounded-lg bg-surface-secondary/70 flex items-center justify-center shrink-0 text-accent mt-0.5 group-hover/card:bg-accent-soft transition-colors">
							<ItemFavicon
								url={item.url}
								favicon={item.favicon}
								type={item.type}
								name={item.name}
								size="xs"
							/>
						</div>

						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-1">
								<span
									className="text-xs font-semibold text-foreground group-hover/card:text-accent transition-colors truncate"
									title={item.name}
								>
									{item.name}
								</span>
								{item.url && (
									<ArrowUpRight className="w-3 h-3 text-muted group-hover/card:text-accent opacity-0 group-hover/card:opacity-100 transition-all shrink-0" />
								)}
							</div>

							{domain && (
								<div className="flex items-center gap-1 text-[10px] text-muted font-mono mt-0.5">
									<Globe className="w-2.5 h-2.5 opacity-60 shrink-0" />
									<span className="truncate">{domain}</span>
								</div>
							)}
						</div>
					</button>

					{showTypeBadge && (
						<Chip
							size="sm"
							variant="secondary"
							className="text-[9px] h-4.5 px-1 shrink-0 font-medium"
						>
							{typeInfo.label}
						</Chip>
					)}
				</div>

				{/* Item Description / Summary */}
				{(item.summary || item.description) && (
					<p className="text-[11px] text-muted line-clamp-2 leading-relaxed pl-8">
						{item.summary || item.description}
					</p>
				)}

				{/* Item Tags */}
				{item.tags && item.tags.length > 0 && (
					<div className="flex items-center gap-1 flex-wrap pl-8 mt-auto">
						{item.tags.map((tag) => (
							<span
								key={tag}
								className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-md bg-surface-secondary text-muted border border-border/60"
							>
								<Tag className="w-2 h-2 opacity-60" />
								{tag}
							</span>
						))}
					</div>
				)}
			</div>

			{/* Item Action & Footer Bar — sticky at bottom and horizontally aligned */}
			<div className="mt-auto shrink-0 pt-1.5 border-t border-border/40 flex items-center justify-between gap-1 text-[10px] text-muted min-w-0">
				{footerExtra ? (
					<div className="flex-1 min-w-0">{footerExtra}</div>
				) : (
					<div className="flex-1" />
				)}

				{/* Single Consolidated Action Dropdown */}
				<div className="shrink-0 flex items-center">
					<Dropdown onOpenChange={setIsCardMenuOpen}>
						<Dropdown.Trigger
							className="h-6 w-6 p-0 rounded-lg text-muted hover:text-foreground hover:bg-surface-secondary cursor-pointer transition-colors flex items-center justify-center"
							aria-label="条目操作"
						>
							<Ellipsis className="w-3.5 h-3.5" />
						</Dropdown.Trigger>

						<Dropdown.Popover
							placement="bottom end"
							className="min-w-[160px] p-1 shadow-lg border border-border/80 rounded-xl bg-surface"
						>
							<Dropdown.Menu aria-label="条目操作">
								{item.url && (
									<Dropdown.Item
										id="open"
										textValue="打开链接"
										onAction={() => handleOpenLink(item.url)}
									>
										<div className="flex items-center gap-2 w-full py-0.5">
											<ExternalLink className="w-3.5 h-3.5 text-muted shrink-0" />
											<span className="text-xs font-medium flex-1">
												打开链接
											</span>
										</div>
									</Dropdown.Item>
								)}

								{item.url && (
									<Dropdown.Item
										id="copy"
										textValue="复制链接"
										onAction={() => handleCopyLink(item.url)}
									>
										<div className="flex items-center gap-2 w-full py-0.5">
											<Copy className="w-3.5 h-3.5 text-muted shrink-0" />
											<span className="text-xs font-medium flex-1">
												复制链接
											</span>
										</div>
									</Dropdown.Item>
								)}

								{showMoveDropdown && onMoveItem && otherFolders.length > 0 && (
									<FolderAssignMenu
										mode="submenu"
										folders={otherFolders}
										currentFolderId={item.folderId}
										originalFolderName={item.folderName}
										onSelectFolder={(targetId) => onMoveItem(item, targetId)}
									/>
								)}

								{onDeleteItem && (
									<Dropdown.Item
										id="delete"
										textValue="移除此项"
										variant="danger"
										onAction={() => onDeleteItem(item)}
									>
										<div className="flex items-center gap-2 w-full py-0.5">
											<Trash2 className="w-3.5 h-3.5 shrink-0" />
											<span className="text-xs font-medium flex-1">
												移除此项
											</span>
										</div>
									</Dropdown.Item>
								)}
							</Dropdown.Menu>
						</Dropdown.Popover>
					</Dropdown>
				</div>
			</div>
		</Card>
	);
});
