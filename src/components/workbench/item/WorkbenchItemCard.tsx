import {
	Button,
	Card,
	Chip,
	Dropdown,
	toast,
} from "@heroui/react";
import {
	ArrowUpRight,
	Copy,
	ExternalLink,
	Folder as FolderIconLucide,
	FolderInput,
	Globe,
	Tag,
	Trash2,
} from "lucide-react";
import React, { memo } from "react";
import { extractDomain } from "../../../lib/url";
import { ItemFavicon } from "../ItemFavicon";
import { type Folder, ITEM_TYPES, type WorkbenchItem } from "../types";

export interface WorkbenchItemCardProps {
	item: WorkbenchItem;
	index?: number;
	otherFolders?: Folder[];
	showMoveDropdown?: boolean;
	showTypeBadge?: boolean;
	footerExtra?: React.ReactNode;
	onDeleteItem?: (item: WorkbenchItem) => void;
	onMoveItem?: (item: WorkbenchItem, targetFolderId: number) => void;
}

/**
 * Reusable bookmark / item card component used across folder details and unclassified lists.
 * Heavily slimmed down & memoized to avoid DOM explosion on large lists.
 */
export const WorkbenchItemCard = memo(function WorkbenchItemCard({
	item,
	otherFolders = [],
	showMoveDropdown = false,
	showTypeBadge = true,
	footerExtra,
	onDeleteItem,
	onMoveItem,
}: WorkbenchItemCardProps) {
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

	return (
		<Card className="group/card p-3 rounded-2xl bg-surface-secondary/40 hover:bg-surface-secondary/80 border-border/70 hover:border-accent/40 transition-all duration-150 flex flex-col gap-2 shadow-none">
			{/* Item Header Row */}
			<div className="flex items-start justify-between gap-2">
				<button
					type="button"
					onClick={() => handleOpenLink(item.url)}
					className="flex items-start gap-2.5 flex-1 min-w-0 cursor-pointer text-left"
				>
					<div className="w-7 h-7 rounded-xl bg-surface flex items-center justify-center shrink-0 text-accent mt-0.5 shadow-2xs group-hover/card:bg-accent-soft transition-colors">
						<ItemFavicon
							url={item.url}
							favicon={item.favicon}
							type={item.type}
							name={item.name}
							size="xs"
						/>
					</div>

					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-1.5 flex-wrap">
							<span className="text-xs font-semibold text-foreground group-hover/card:text-accent transition-colors line-clamp-1 break-all">
								{item.name}
							</span>
							{item.url && (
								<ArrowUpRight className="w-3 h-3 text-muted group-hover/card:text-accent opacity-0 group-hover/card:opacity-100 transition-all shrink-0" />
							)}
						</div>

						{domain && (
							<div className="flex items-center gap-1 text-[10px] text-muted font-mono mt-0.5">
								<Globe className="w-2.5 h-2.5 opacity-60" />
								<span className="truncate max-w-[180px]">{domain}</span>
							</div>
						)}
					</div>
				</button>

				{showTypeBadge && (
					<Chip
						size="sm"
						variant="secondary"
						className="text-[10px] h-5 px-1.5 shrink-0 font-medium"
					>
						{typeInfo.label}
					</Chip>
				)}
			</div>

			{/* Item Description / Summary */}
			{(item.summary || item.description) && (
				<p className="text-[11px] text-muted line-clamp-2 leading-relaxed pl-9">
					{item.summary || item.description}
				</p>
			)}

			{/* Item Tags */}
			{item.tags && item.tags.length > 0 && (
				<div className="flex items-center gap-1 flex-wrap pl-9">
					{item.tags.map((tag) => (
						<span
							key={tag}
							className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.2 rounded-md bg-surface text-muted border border-border/60"
						>
							<Tag className="w-2 h-2 opacity-60" />
							{tag}
						</span>
					))}
				</div>
			)}

			{/* Item Action & Footer Bar */}
			<div className="flex items-center justify-between gap-1 pt-1 border-t border-border/40 mt-0.5 text-[10px] text-muted">
				{footerExtra ? (
					<div className="flex-1 min-w-0 truncate">{footerExtra}</div>
				) : (
					<div className="flex-1" />
				)}

				<div className="flex items-center gap-1 shrink-0">
					{/* Open in New Tab */}
					{item.url && (
						<Button
							variant="ghost"
							size="sm"
							className="h-6 px-2 text-[10px] rounded-lg text-muted hover:text-foreground hover:bg-surface cursor-pointer"
							onPress={() => handleOpenLink(item.url)}
							aria-label="在浏览器新标签页中打开"
						>
							<ExternalLink className="w-3 h-3 mr-1" />
							打开
						</Button>
					)}

					{/* Copy Link */}
					{item.url && (
						<Button
							variant="ghost"
							size="sm"
							className="h-6 px-2 text-[10px] rounded-lg text-muted hover:text-foreground hover:bg-surface cursor-pointer"
							onPress={() => handleCopyLink(item.url)}
							aria-label="复制链接至剪贴板"
						>
							<Copy className="w-3 h-3 mr-1" />
							复制
						</Button>
					)}

					{/* Move to another folder Dropdown */}
					{showMoveDropdown && onMoveItem && otherFolders.length > 0 && (
						<Dropdown>
							<Dropdown.Trigger
								className="h-6 px-2 text-[10px] rounded-lg text-muted hover:text-foreground hover:bg-surface cursor-pointer inline-flex items-center"
								aria-label="移动至其他文件夹"
							>
								<FolderInput className="w-3 h-3 mr-1" />
								移动
							</Dropdown.Trigger>

							<Dropdown.Popover aria-label="移动至其他文件夹">
								<Dropdown.Menu
									aria-label="选择目标文件夹"
									onAction={(key) => {
										const targetId = Number(key);
										if (targetId) {
											onMoveItem(item, targetId);
										}
									}}
								>
									{otherFolders.map((of) => (
										<Dropdown.Item
											key={String(of.id)}
											id={String(of.id)}
											textValue={of.name}
										>
											<div className="flex items-center gap-2">
												<FolderIconLucide className="w-3.5 h-3.5 text-accent" />
												<span className="text-xs">{of.name}</span>
												<span className="text-[10px] text-muted ml-auto">
													({of.category})
												</span>
											</div>
										</Dropdown.Item>
									))}
								</Dropdown.Menu>
							</Dropdown.Popover>
						</Dropdown>
					)}

					{/* Delete Item */}
					{onDeleteItem && (
						<Button
							variant="ghost"
							size="sm"
							className="h-6 w-6 p-0 text-muted hover:text-danger hover:bg-danger-soft/20 rounded-lg shrink-0 cursor-pointer"
							onPress={() => onDeleteItem(item)}
							aria-label="移除此项"
						>
							<Trash2 className="w-3 h-3" />
						</Button>
					)}
				</div>
			</div>
		</Card>
	);
});

