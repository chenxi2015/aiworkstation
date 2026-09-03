import { Button, EmptyState } from "@heroui/react";
import { Folder, Inbox, Sparkles, Zap } from "lucide-react";
import { WorkbenchItemCard } from "../item/WorkbenchItemCard";
import type { Folder as WorkbenchFolder, WorkbenchItem } from "../types";

export interface UnclassifiedViewProps {
	unclassified: WorkbenchItem[];
	folders?: WorkbenchFolder[];
	onOpenAIClassify: () => void;
	onDeleteItem: (item: WorkbenchItem) => void;
	onMoveItem?: (item: WorkbenchItem, targetFolderId: number) => void;
}

/**
 * Unclassified Pool View with DeepSeek AI classification trigger and bookmark grid
 */
export function UnclassifiedView({
	unclassified,
	folders = [],
	onOpenAIClassify,
	onDeleteItem,
	onMoveItem,
}: UnclassifiedViewProps) {
	if (unclassified.length === 0) {
		return (
			<div className="flex-1 flex flex-col">
				<EmptyState className="py-20 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-3xl bg-surface p-8">
					<div className="w-14 h-14 rounded-2xl bg-surface-secondary flex items-center justify-center text-muted mb-3.5 opacity-50">
						<Inbox className="w-7 h-7" />
					</div>
					<h3 className="text-sm font-semibold text-foreground mb-1">
						未分类池暂无待整理内容
					</h3>
					<p className="text-xs text-muted mb-4 max-w-sm">
						在 Chrome 浏览器侧边栏扩展中，点击「一键同步至工作台」即可将
						2000+ 书签快速写入本地 SQLite。
					</p>
				</EmptyState>
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col">
			<div className="flex flex-col gap-4">
				{/* Top AI Action Banner */}
				<div className="p-4 rounded-2xl bg-gradient-to-r from-accent/10 via-surface-secondary to-surface-secondary border border-accent/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-xl bg-accent text-accent-foreground flex items-center justify-center text-lg font-bold shadow-sm">
							<Zap className="w-5 h-5" />
						</div>
						<div>
							<div className="font-semibold text-xs text-foreground">
								SQLite 已就绪 {unclassified.length} 条从插件同步的书签 TDK
							</div>
							<div className="text-[11px] text-muted">
								点击按钮，由 DeepSeek
								深度分析网页标题、描述及原路径，自动创建主题文件夹并入库。
							</div>
						</div>
					</div>

					<Button
						variant="primary"
						size="sm"
						className="rounded-full shadow-sm shrink-0 flex items-center gap-1.5 cursor-pointer"
						onPress={onOpenAIClassify}
					>
						<Sparkles className="w-3.5 h-3.5" />
						<span>启动 DeepSeek 一键智能分类</span>
					</Button>
				</div>

				{/* Unclassified Items Grid */}
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
					{unclassified.map((item, idx) => {
						const matchedFolder = item.folderName
							? folders.find(
									(f) =>
										f.name.trim().toLowerCase() ===
										item.folderName?.trim().toLowerCase(),
								)
							: undefined;

						return (
							<WorkbenchItemCard
								key={item.id || idx}
								item={item}
								index={idx}
								otherFolders={folders}
								showMoveDropdown={Boolean(folders.length > 0 && onMoveItem)}
								showTypeBadge={false}
								onDeleteItem={onDeleteItem}
								onMoveItem={onMoveItem}
								footerExtra={
									<div className="flex items-center justify-between gap-2 text-[10px] text-muted w-full">
										<span
											className="truncate max-w-[150px] inline-flex items-center gap-1"
											title={item.url}
										>
											{matchedFolder && onMoveItem ? (
												<button
													type="button"
													onClick={() => onMoveItem(item, matchedFolder.id)}
													className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-accent-soft text-accent hover:bg-accent hover:text-accent-foreground transition-all cursor-pointer truncate max-w-[150px]"
													title={`点击直接放入已有文件夹「${matchedFolder.name}」`}
												>
													<Folder className="w-2.5 h-2.5 shrink-0" />
													<span className="truncate">{item.folderName}</span>
												</button>
											) : item.folderName ? (
												<>
													<Folder className="w-2.5 h-2.5 opacity-70 shrink-0" />
													<span className="truncate">{item.folderName}</span>
												</>
											) : (
												item.url
											)}
										</span>
										{item.createdAt && (
											<span className="shrink-0">{item.createdAt}</span>
										)}
									</div>
								}
							/>
						);
					})}
				</div>
			</div>
		</div>
	);
}

