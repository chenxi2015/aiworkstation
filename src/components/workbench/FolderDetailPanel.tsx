import {
	Button,
	Chip,
	EmptyState,
	ScrollShadow,
	Separator,
	toast,
} from "@heroui/react";
import { EditIcon, FolderIcon, ItemIcon } from "./Icons";
import type { Folder, WorkbenchItem } from "./types";
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

export function FolderDetailPanel({
	folder,
	allFolders = [],
	onEdit,
	onDeleteItem,
	onMoveItem,
}: FolderDetailPanelProps) {
	if (!folder) {
		return (
			<aside className="w-[360px] shrink-0 bg-surface border-l border-border p-7 flex flex-col items-center justify-center text-center">
				<EmptyState className="p-0 flex flex-col items-center justify-center text-center">
					<div className="w-16 h-16 rounded-2xl bg-surface-secondary flex items-center justify-center text-muted mb-4 opacity-40">
						<FolderIcon className="w-8 h-8" />
					</div>
					<h3 className="text-sm font-semibold text-foreground mb-1.5">
						选择一个文件夹
					</h3>
					<p className="text-xs text-muted leading-relaxed max-w-[220px]">
						点击左侧任意文件夹卡片
						<br />
						查看其中归集的工具与内容
					</p>
				</EmptyState>
			</aside>
		);
	}

	// Calculate 9-grid preview items
	const maxPreview = 9;
	const hasMore = folder.items.length > maxPreview;
	const previewItems = hasMore
		? folder.items.slice(0, maxPreview - 1)
		: folder.items.slice(0, maxPreview);
	const remainingCount = folder.items.length - (maxPreview - 1);

	// Fill up empty slots to keep a tidy 3x3 layout when items are 1-8
	const emptySlotsCount = Math.max(
		0,
		9 - (previewItems.length + (hasMore ? 1 : 0)),
	);

	const otherFolders = allFolders.filter((f) => f.id !== folder.id);

	const handleOpenLink = (url?: string) => {
		if (url) {
			window.open(url, "_blank", "noopener,noreferrer");
		}
	};

	const handleCopyLink = (e: React.MouseEvent, url?: string) => {
		e.stopPropagation();
		if (url) {
			navigator.clipboard.writeText(url);
			toast.success("已复制链接到剪贴板");
		}
	};

	const handleMoveSelect = (item: WorkbenchItem, targetId: number) => {
		if (onMoveItem) {
			onMoveItem(item, folder.id, targetId);
		}
	};

	return (
		<aside className="w-[380px] shrink-0 bg-surface border-l border-border p-6 flex flex-col max-h-[calc(100vh-60px)] sticky top-[60px]">
			<ScrollShadow className="flex-1 -mr-2 pr-2 overflow-y-auto">
				{/* Header */}
				<div className="flex items-start justify-between gap-3 mb-5">
					<div>
						<span className="text-[10px] uppercase font-semibold tracking-wider text-accent bg-accent-soft px-2 py-0.5 rounded-full mb-1.5 inline-block">
							{folder.category}
						</span>
						<h2 className="text-xl font-bold text-foreground tracking-tight leading-snug break-all">
							{folder.name}
						</h2>
					</div>
					<Button
						variant="ghost"
						size="sm"
						onPress={() => onEdit(folder)}
						aria-label="编辑文件夹"
						className="rounded-full shrink-0 h-8 w-8 p-0"
					>
						<EditIcon className="w-4 h-4" />
					</Button>
				</div>

				{/* Creation Time & Desc */}
				<div className="flex items-center gap-2 mb-3 text-xs text-muted">
					<span>创建于 {folder.createdAt}</span>
					<span>•</span>
					<span>共 {folder.items.length} 个归集项</span>
				</div>

				<div className="text-xs text-foreground/80 leading-relaxed bg-surface-secondary/60 p-3 rounded-xl border border-border/60 mb-5">
					{folder.desc || <span className="text-muted">暂无描述</span>}
				</div>

				{/* 9-Grid Preview */}
				<div className="mb-6">
					<div className="text-[11px] font-semibold tracking-wider text-muted uppercase mb-3">
						内容九宫格预览
					</div>

					{folder.items.length === 0 ? (
						<EmptyState className="text-xs text-muted py-4 text-center rounded-xl bg-surface-secondary">
							暂无内容
						</EmptyState>
					) : (
						<div className="grid grid-cols-3 gap-2">
							{previewItems.map((item, index) => (
								<div
									key={item.id || `${item.name}-${index}`}
									title={`${item.name}${item.url ? `\n${item.url}` : ""}`}
									onClick={() => handleOpenLink(item.url)}
									className="group aspect-square rounded-xl bg-surface-secondary hover:bg-accent-soft hover:scale-[1.03] transition-all flex flex-col items-center justify-center p-1.5 cursor-pointer text-center"
								>
									<ItemIcon
										type={item.type}
										className="w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity"
									/>
									<span className="text-[10px] text-muted group-hover:text-accent mt-1 line-clamp-1 truncate w-full px-1">
										{item.name}
									</span>
								</div>
							))}

							{hasMore && (
								<div className="aspect-square rounded-xl bg-surface-tertiary hover:bg-accent-soft hover:text-accent transition-all flex items-center justify-center text-xs font-bold text-foreground cursor-pointer">
									+{remainingCount}
								</div>
							)}

							{EMPTY_SLOT_KEYS.slice(0, emptySlotsCount).map((slotKey) => (
								<div
									key={slotKey}
									className="aspect-square rounded-xl border border-dashed border-border opacity-40"
								/>
							))}
						</div>
					)}
				</div>

				<Separator className="my-4" />

				{/* Item Detailed List */}
				<div>
					<div className="text-[11px] font-semibold tracking-wider text-muted uppercase mb-3">
						归集内容详情 ({folder.items.length})
					</div>

					{folder.items.length === 0 ? (
						<EmptyState className="text-xs text-muted py-3 text-center">
							暂无归集内容
						</EmptyState>
					) : (
						<div className="space-y-2">
							{folder.items.map((item, index) => {
								const typeInfo = ITEM_TYPES[item.type] || {
									label: "其他",
									color: "currentColor",
								};
								return (
									<div
										key={item.id || `${item.name}-${index}`}
										onClick={() => handleOpenLink(item.url)}
										className="p-2.5 rounded-xl bg-surface-secondary hover:bg-surface-secondary/80 border border-border transition-all cursor-pointer group flex flex-col gap-1.5"
									>
										<div className="flex items-start gap-2 justify-between">
											<div className="flex items-center gap-2 flex-1 min-w-0">
												<div className="w-6 h-6 rounded-lg bg-accent-soft flex items-center justify-center shrink-0 text-accent">
													<ItemIcon type={item.type} className="w-3.5 h-3.5" />
												</div>
												<span className="text-xs font-medium text-foreground truncate group-hover:text-accent transition-colors">
													{item.name}
												</span>
											</div>
											<div className="flex items-center gap-1 shrink-0">
												<Chip size="sm" variant="secondary" className="text-[10px] h-5">
													{typeInfo.label}
												</Chip>
												{item.url && (
													<button
														type="button"
														onClick={(e) => handleCopyLink(e, item.url)}
														className="text-muted hover:text-foreground p-1 text-[10px]"
														title="复制链接"
													>
														🔗
													</button>
												)}
												{onMoveItem && otherFolders.length > 0 && (
													<select
														onClick={(e) => e.stopPropagation()}
														onChange={(e) => {
															e.stopPropagation();
															const targetId = Number(e.target.value);
															if (targetId) handleMoveSelect(item, targetId);
														}}
														defaultValue=""
														className="text-[10px] bg-surface text-muted rounded border border-border px-1 py-0.5"
														title="移动至其他文件夹"
													>
														<option value="" disabled>
															移动...
														</option>
														{otherFolders.map((of) => (
															<option key={of.id} value={of.id}>
																{of.name}
															</option>
														))}
													</select>
												)}
												{onDeleteItem && (
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															onDeleteItem(item, folder.id);
														}}
														className="text-muted hover:text-danger p-1 text-[10px]"
														title="从文件夹移除"
													>
														✕
													</button>
												)}
											</div>
										</div>

										{(item.summary || item.description || item.url) && (
											<p className="text-[11px] text-muted line-clamp-2 leading-relaxed pl-8">
												{item.summary || item.description || item.url}
											</p>
										)}

										{item.tags && item.tags.length > 0 && (
											<div className="flex items-center gap-1 flex-wrap pl-8 pt-0.5">
												{item.tags.map((t) => (
													<span
														key={t}
														className="text-[9px] px-1.5 py-0.2 rounded bg-surface text-muted border border-border"
													>
														#{t}
													</span>
												))}
											</div>
										)}
									</div>
								);
							})}
						</div>
					)}
				</div>
			</ScrollShadow>
		</aside>
	);
}
