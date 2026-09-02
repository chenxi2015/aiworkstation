import {
	Button,
	Card,
	Chip,
	Dropdown,
	EmptyState,
	InputGroup,
	ScrollShadow,
	Separator,
	Tooltip,
	toast,
} from "@heroui/react";
import {
	ArrowUpRight,
	Clock,
	Copy,
	ExternalLink,
	Folder as FolderIconLucide,
	FolderInput,
	FolderOpen,
	Globe,
	LayoutGrid,
	Pencil,
	Search,
	Sparkles,
	Tag,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ItemFavicon } from "./ItemFavicon";
import type { Folder, ItemType, WorkbenchItem } from "./types";
import { ITEM_TYPES } from "./types";

const EMPTY_SLOT_KEYS = [
	"slot-1",
	"slot-2",
	"slot-3",
	"slot-4",
	"slot-5",
	"slot-6",
	"slot-7",
	"slot-8",
	"slot-9",
];

interface FolderDetailPanelProps {
	folder: Folder | null;
	allFolders?: Folder[];
	onEdit: (folder: Folder) => void;
	onDeleteItem?: (item: WorkbenchItem, folderId: number) => void;
	onMoveItem?: (
		item: WorkbenchItem,
		sourceFolderId: number,
		targetFolderId: number,
	) => void;
}

/**
 * Helper to safely extract domain name from a URL for a clean badge display
 */
function extractDomain(url?: string): string {
	if (!url) return "";
	try {
		const parsed = new URL(url);
		return parsed.hostname.replace(/^www\./, "");
	} catch {
		return url.slice(0, 30);
	}
}

export function FolderDetailPanel({
	folder,
	allFolders = [],
	onEdit,
	onDeleteItem,
	onMoveItem,
}: FolderDetailPanelProps) {
	const [itemSearchQuery, setItemSearchQuery] = useState("");
	const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("all");

	// Reset local filter when active folder changes
	const activeFolderId = folder?.id;
	useEffect(() => {
		if (activeFolderId !== undefined) {
			setItemSearchQuery("");
			setSelectedTypeFilter("all");
		}
	}, [activeFolderId]);

	// Filter other folders available for moving items
	const otherFolders = useMemo(() => {
		if (!folder) return [];
		return allFolders.filter((f) => f.id !== folder.id);
	}, [allFolders, folder]);

	// Filter items inside current folder
	const filteredItems = useMemo(() => {
		if (!folder) return [];
		let list = folder.items;

		// Type filter
		if (selectedTypeFilter !== "all") {
			list = list.filter((item) => item.type === selectedTypeFilter);
		}

		// Search query filter
		if (itemSearchQuery.trim()) {
			const q = itemSearchQuery.toLowerCase();
			list = list.filter(
				(item) =>
					item.name.toLowerCase().includes(q) ||
					item.url?.toLowerCase().includes(q) ||
					item.description?.toLowerCase().includes(q) ||
					item.summary?.toLowerCase().includes(q) ||
					item.tags?.some((t) => t.toLowerCase().includes(q)),
			);
		}

		return list;
	}, [folder, selectedTypeFilter, itemSearchQuery]);

	// Get available item types in this folder for quick filter chips
	const availableTypes = useMemo(() => {
		if (!folder) return [];
		const types = new Set<ItemType>();
		for (const item of folder.items) {
			if (item.type) types.add(item.type);
		}
		return Array.from(types);
	}, [folder]);

	// Actions
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

	const handleMoveSelect = (item: WorkbenchItem, targetId: number) => {
		if (onMoveItem && folder) {
			onMoveItem(item, folder.id, targetId);
		}
	};

	// 1. Empty State when no folder is selected
	if (!folder) {
		return (
			<aside className="w-[380px] xl:w-[410px] shrink-0 bg-surface/90 backdrop-blur-md border-l border-border p-7 flex flex-col items-center justify-center text-center h-[calc(100vh-60px)] sticky top-[60px]">
				<EmptyState className="p-0 flex flex-col items-center justify-center text-center max-w-[280px]">
					<div className="w-16 h-16 rounded-3xl bg-gradient-to-b from-accent/15 to-accent/5 border border-accent/20 flex items-center justify-center text-accent mb-4 shadow-xs">
						<FolderIconLucide className="w-8 h-8 opacity-80" />
					</div>
					<h3 className="text-base font-bold text-foreground mb-1.5 tracking-tight">
						选择一个文件夹
					</h3>
					<p className="text-xs text-muted leading-relaxed mb-4">
						点击左侧任意文件夹卡片，查看其中归集的内容、九宫格快捷看板与工具外链
					</p>
					<div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-secondary text-[11px] text-muted border border-border/60">
						<Sparkles className="w-3 h-3 text-accent" />
						<span>支持九宫格预览与快捷外链跳转</span>
					</div>
				</EmptyState>
			</aside>
		);
	}

	// 9-grid preview items calculation
	const maxPreview = 9;
	const hasMore = folder.items.length > maxPreview;
	const previewItems = hasMore
		? folder.items.slice(0, maxPreview - 1)
		: folder.items.slice(0, maxPreview);
	const remainingCount = folder.items.length - (maxPreview - 1);
	const emptySlotsCount = Math.max(
		0,
		9 - (previewItems.length + (hasMore ? 1 : 0)),
	);

	return (
		<aside className="w-[380px] xl:w-[410px] shrink-0 bg-surface/95 backdrop-blur-md border-l border-border flex flex-col h-[calc(100vh-60px)] sticky top-[60px] shadow-xs">
			<ScrollShadow className="flex-1 px-5 py-5 overflow-y-auto">
				{/* Top Header Card */}
				<div className="flex flex-col gap-3 mb-5">
					<div className="flex items-start justify-between gap-2">
						<div className="flex items-center gap-1.5 flex-wrap">
							<Chip
								size="sm"
								variant="secondary"
								className="font-medium text-[11px] text-accent bg-accent-soft border-accent/20"
							>
								{folder.category || "工作台"}
							</Chip>
							<span className="text-[11px] text-muted flex items-center gap-1">
								<Clock className="w-3 h-3 opacity-60" />
								{folder.createdAt || "刚刚"}
							</span>
						</div>

						<Tooltip>
							<Tooltip.Trigger>
								<Button
									variant="ghost"
									size="sm"
									className="rounded-full shrink-0 h-7 w-7 p-0 text-muted hover:text-foreground"
									onPress={() => onEdit(folder)}
									aria-label="编辑文件夹"
								>
									<Pencil className="w-3.5 h-3.5" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-xs py-1 px-2">
								编辑文件夹名称与分类
							</Tooltip.Content>
						</Tooltip>
					</div>

					<div>
						<h2 className="text-lg font-bold text-foreground tracking-tight leading-snug break-all flex items-center gap-2">
							<FolderOpen className="w-5 h-5 text-accent shrink-0" />
							<span>{folder.name}</span>
						</h2>
					</div>

					{/* Folder Description Card */}
					<Card className="bg-surface-secondary/50 border-border/60 p-3 shadow-none">
						<p className="text-xs text-foreground/80 leading-relaxed break-words">
							{folder.desc || (
								<span className="text-muted italic">暂无文件夹描述信息</span>
							)}
						</p>
					</Card>
				</div>

				{/* 9-Grid Preview Section */}
				<div className="mb-5">
					<div className="flex items-center justify-between gap-2 mb-2.5">
						<div className="flex items-center gap-1.5 text-xs font-semibold text-foreground tracking-tight">
							<LayoutGrid className="w-3.5 h-3.5 text-accent" />
							<span>九宫格快捷看板</span>
						</div>
						<span className="text-[10px] text-muted font-medium bg-surface-secondary px-1.5 py-0.5 rounded-md">
							{Math.min(folder.items.length, 9)} / 9
						</span>
					</div>

					{folder.items.length === 0 ? (
						<EmptyState className="text-xs text-muted py-6 text-center rounded-2xl bg-surface-secondary/40 border border-dashed border-border/70 flex flex-col items-center justify-center">
							<FolderIconLucide className="w-6 h-6 opacity-40 mb-1 text-muted" />
							<span>该文件夹暂无归集项</span>
						</EmptyState>
					) : (
						<div className="grid grid-cols-3 gap-2">
							{previewItems.map((item, index) => {
								const typeInfo = ITEM_TYPES[item.type] || {
									label: "其他",
									color: "currentColor",
								};

								return (
									<Tooltip key={item.id || `${item.name}-${index}`}>
										<Tooltip.Trigger>
											<button
												type="button"
												onClick={() => handleOpenLink(item.url)}
												className="group aspect-square rounded-2xl bg-surface-secondary/60 hover:bg-accent-soft/80 border border-border/70 hover:border-accent/30 hover:scale-[1.03] transition-all duration-200 flex flex-col items-center justify-center p-2 cursor-pointer text-center relative overflow-hidden shadow-2xs w-full"
											>
												<div className="w-7 h-7 rounded-xl bg-surface flex items-center justify-center shrink-0 shadow-2xs group-hover:bg-surface/90 transition-colors">
													<ItemFavicon
														url={item.url}
														favicon={item.favicon}
														type={item.type}
														name={item.name}
														size="xs"
														className="group-hover:scale-110 transition-transform"
														iconClassName="opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-transform"
													/>
												</div>
												<span className="text-[10px] font-medium text-foreground/80 group-hover:text-accent mt-1.5 line-clamp-1 truncate w-full px-1 text-center">
													{item.name}
												</span>
											</button>
										</Tooltip.Trigger>
										<Tooltip.Content className="text-xs py-1.5 px-2.5 max-w-[220px]">
											<div className="font-semibold text-foreground line-clamp-1">
												{item.name}
											</div>
											<div className="text-[10px] text-muted truncate mt-0.5">
												{item.url || typeInfo.label}
											</div>
										</Tooltip.Content>
									</Tooltip>
								);
							})}

							{hasMore && (
								<button
									type="button"
									onClick={() => setSelectedTypeFilter("all")}
									className="aspect-square rounded-2xl bg-surface-secondary/80 hover:bg-accent-soft hover:text-accent border border-border/80 hover:border-accent/30 hover:scale-[1.03] transition-all flex flex-col items-center justify-center text-xs font-bold text-foreground cursor-pointer shadow-2xs w-full"
									title={`查看全部 ${folder.items.length} 个归集内容`}
								>
									<span className="text-sm">+{remainingCount}</span>
									<span className="text-[9px] font-normal text-muted mt-0.5">
										更多内容
									</span>
								</button>
							)}

							{EMPTY_SLOT_KEYS.slice(0, emptySlotsCount).map((slotKey) => (
								<div
									key={slotKey}
									className="aspect-square rounded-2xl border border-dashed border-border/50 bg-surface-secondary/20 opacity-40 flex items-center justify-center text-muted text-[10px]"
								/>
							))}
						</div>
					)}
				</div>

				<Separator className="my-4 opacity-60" />

				{/* In-Folder Search & Filter Section */}
				<div className="mb-4 space-y-2">
					<div className="flex items-center justify-between gap-2">
						<div className="flex items-center gap-1.5 text-xs font-semibold text-foreground tracking-tight">
							<span>归集内容列表</span>
							<Chip
								size="sm"
								variant="secondary"
								className="h-4 text-[10px] px-1"
							>
								{folder.items.length}
							</Chip>
						</div>

						{itemSearchQuery && (
							<span className="text-[10px] text-muted">
								找到 {filteredItems.length} 项
							</span>
						)}
					</div>

					{/* Search Input */}
					{folder.items.length > 2 && (
						<InputGroup className="w-full h-8 text-xs">
							<InputGroup.Prefix className="pl-2.5 text-muted">
								<Search className="w-3.5 h-3.5" />
							</InputGroup.Prefix>
							<InputGroup.Input
								type="text"
								placeholder="在当前文件夹搜索..."
								value={itemSearchQuery}
								onChange={(e) => setItemSearchQuery(e.target.value)}
								className="text-xs h-8 pl-1"
							/>
							{itemSearchQuery && (
								<InputGroup.Suffix className="pr-1.5">
									<button
										type="button"
										onClick={() => setItemSearchQuery("")}
										className="w-4 h-4 rounded-full flex items-center justify-center text-muted hover:text-foreground cursor-pointer"
									>
										<X className="w-3 h-3" />
									</button>
								</InputGroup.Suffix>
							)}
						</InputGroup>
					)}

					{/* Type Filter Chips */}
					{availableTypes.length > 1 && (
						<div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar pt-1">
							<button
								type="button"
								onClick={() => setSelectedTypeFilter("all")}
								className={`text-[10px] px-2 py-0.5 rounded-full transition-colors cursor-pointer shrink-0 font-medium ${
									selectedTypeFilter === "all"
										? "bg-foreground text-background"
										: "bg-surface-secondary text-muted hover:text-foreground"
								}`}
							>
								全部 ({folder.items.length})
							</button>

							{availableTypes.map((type) => {
								const typeInfo = ITEM_TYPES[type] || { label: type };
								const count = folder.items.filter(
									(i) => i.type === type,
								).length;
								const isActive = selectedTypeFilter === type;

								return (
									<button
										key={type}
										type="button"
										onClick={() =>
											setSelectedTypeFilter(isActive ? "all" : type)
										}
										className={`text-[10px] px-2 py-0.5 rounded-full transition-colors cursor-pointer shrink-0 font-medium ${
											isActive
												? "bg-accent text-accent-foreground"
												: "bg-surface-secondary text-muted hover:text-foreground"
										}`}
									>
										{typeInfo.label} ({count})
									</button>
								);
							})}
						</div>
					)}
				</div>

				{/* Detailed Items List */}
				{folder.items.length === 0 ? (
					<EmptyState className="text-xs text-muted py-6 text-center rounded-2xl bg-surface-secondary/20">
						暂无归集内容
					</EmptyState>
				) : filteredItems.length === 0 ? (
					<EmptyState className="text-xs text-muted py-6 text-center rounded-2xl bg-surface-secondary/20 flex flex-col items-center justify-center">
						<Search className="w-5 h-5 opacity-40 mb-1 text-muted" />
						<span>未找到匹配的归集内容</span>
					</EmptyState>
				) : (
					<div className="space-y-2.5">
						{filteredItems.map((item, index) => {
							const typeInfo = ITEM_TYPES[item.type] || {
								label: "其他",
								color: "currentColor",
							};
							const domain = extractDomain(item.url);

							return (
								<Card
									key={item.id || `${item.name}-${index}`}
									className="group/card p-3 rounded-2xl bg-surface-secondary/40 hover:bg-surface-secondary/80 border-border/70 hover:border-accent/40 transition-all duration-200 flex flex-col gap-2 shadow-none"
								>
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
														<span className="truncate max-w-[180px]">
															{domain}
														</span>
													</div>
												)}
											</div>
										</button>

										<Chip
											size="sm"
											variant="secondary"
											className="text-[10px] h-5 px-1.5 shrink-0 font-medium"
										>
											{typeInfo.label}
										</Chip>
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

									{/* Item Action Bar */}
									<div className="flex items-center justify-end gap-1 pt-1 border-t border-border/40 mt-0.5">
										{/* Open in New Window */}
										{item.url && (
											<Tooltip>
												<Tooltip.Trigger>
													<Button
														variant="ghost"
														size="sm"
														className="h-6 px-2 text-[10px] rounded-lg text-muted hover:text-foreground hover:bg-surface"
														onPress={() => handleOpenLink(item.url)}
													>
														<ExternalLink className="w-3 h-3 mr-1" />
														打开
													</Button>
												</Tooltip.Trigger>
												<Tooltip.Content className="text-xs py-1 px-2">
													在浏览器新标签页中打开
												</Tooltip.Content>
											</Tooltip>
										)}

										{/* Copy Link */}
										{item.url && (
											<Tooltip>
												<Tooltip.Trigger>
													<Button
														variant="ghost"
														size="sm"
														className="h-6 px-2 text-[10px] rounded-lg text-muted hover:text-foreground hover:bg-surface"
														onPress={() => handleCopyLink(item.url)}
													>
														<Copy className="w-3 h-3 mr-1" />
														复制
													</Button>
												</Tooltip.Trigger>
												<Tooltip.Content className="text-xs py-1 px-2">
													复制链接至剪贴板
												</Tooltip.Content>
											</Tooltip>
										)}

										{/* Move to another folder Dropdown */}
										{onMoveItem && otherFolders.length > 0 && (
											<Dropdown>
												<Tooltip>
													<Tooltip.Trigger>
														<Dropdown.Trigger>
															<Button
																variant="ghost"
																size="sm"
																className="h-6 px-2 text-[10px] rounded-lg text-muted hover:text-foreground hover:bg-surface"
															>
																<FolderInput className="w-3 h-3 mr-1" />
																移动
															</Button>
														</Dropdown.Trigger>
													</Tooltip.Trigger>
													<Tooltip.Content className="text-xs py-1 px-2">
														移动至其他文件夹
													</Tooltip.Content>
												</Tooltip>

												<Dropdown.Popover>
													<Dropdown.Menu
														onAction={(key) => {
															const targetId = Number(key);
															if (targetId) {
																handleMoveSelect(item, targetId);
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

										{/* Remove item from folder */}
										{onDeleteItem && (
											<Tooltip>
												<Tooltip.Trigger>
													<Button
														variant="ghost"
														size="sm"
														className="h-6 w-6 p-0 text-muted hover:text-danger hover:bg-danger-soft/20 rounded-lg shrink-0"
														onPress={() => onDeleteItem(item, folder.id)}
													>
														<Trash2 className="w-3 h-3" />
													</Button>
												</Tooltip.Trigger>
												<Tooltip.Content className="text-xs py-1 px-2 text-danger">
													从该文件夹移除此项
												</Tooltip.Content>
											</Tooltip>
										)}
									</div>
								</Card>
							);
						})}
					</div>
				)}
			</ScrollShadow>
		</aside>
	);
}
