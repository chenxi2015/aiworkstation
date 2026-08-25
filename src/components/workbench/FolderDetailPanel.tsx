import {
	Button,
	Chip,
	EmptyState,
	ScrollShadow,
	Separator,
} from "@heroui/react";
import { EditIcon, FolderIcon, ItemIcon } from "./Icons";
import type { Folder } from "./types";
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
	onEdit: (folder: Folder) => void;
}

export function FolderDetailPanel({ folder, onEdit }: FolderDetailPanelProps) {
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

	return (
		<aside className="w-[360px] shrink-0 bg-surface border-l border-border p-7 flex flex-col max-h-[calc(100vh-60px)] sticky top-[60px]">
			<ScrollShadow className="flex-1 -mr-2 pr-2 overflow-y-auto">
				{/* Header */}
				<div className="flex items-start justify-between gap-3 mb-6">
					<h2 className="text-xl font-bold text-foreground tracking-tight leading-snug break-all">
						{folder.name}
					</h2>
					<Button
						isIconOnly
						variant="ghost"
						size="sm"
						onPress={() => onEdit(folder)}
						aria-label="编辑文件夹"
						className="rounded-full shrink-0"
					>
						<EditIcon className="w-4 h-4" />
					</Button>
				</div>

				{/* Creation Time */}
				<div className="mb-5">
					<div className="text-[11px] font-semibold tracking-wider text-muted uppercase mb-1.5">
						创建时间
					</div>
					<div className="text-xs text-foreground font-medium tabular-nums">
						{folder.createdAt}
					</div>
				</div>

				{/* Description */}
				<div className="mb-5">
					<div className="text-[11px] font-semibold tracking-wider text-muted uppercase mb-1.5">
						描述
					</div>
					<div className="text-xs text-foreground leading-relaxed">
						{folder.desc || <span className="text-muted">暂无描述</span>}
					</div>
				</div>

				<Separator className="my-5" />

				{/* 9-Grid Preview */}
				<div className="mb-6">
					<div className="text-[11px] font-semibold tracking-wider text-muted uppercase mb-3">
						内容预览（{folder.items.length} 项）
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
									title={item.name}
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

				{/* Item List */}
				<div>
					<div className="text-[11px] font-semibold tracking-wider text-muted uppercase mb-2.5">
						包含内容
					</div>

					{folder.items.length === 0 ? (
						<EmptyState className="text-xs text-muted py-3 text-center">
							暂无归集内容
						</EmptyState>
					) : (
						<div className="space-y-1">
							{folder.items.map((item, index) => {
								const typeInfo = ITEM_TYPES[item.type] || {
									label: "其他",
									color: "currentColor",
								};
								return (
									<div
										key={item.id || `${item.name}-${index}`}
										className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface-secondary transition-colors cursor-pointer group"
									>
										<div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center shrink-0 text-accent">
											<ItemIcon type={item.type} className="w-4 h-4" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="text-xs font-medium text-foreground truncate group-hover:text-accent transition-colors">
												{item.name}
											</div>
										</div>
										<Chip size="sm" variant="secondary">
											{typeInfo.label}
										</Chip>
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
