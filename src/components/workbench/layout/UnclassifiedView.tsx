import { Button, EmptyState } from "@heroui/react";
import { WorkbenchItemCard } from "../item/WorkbenchItemCard";
import type { WorkbenchItem } from "../types";

export interface UnclassifiedViewProps {
	unclassified: WorkbenchItem[];
	onOpenAIClassify: () => void;
	onDeleteItem: (item: WorkbenchItem) => void;
}

/**
 * Unclassified Pool View with DeepSeek AI classification trigger and bookmark grid
 */
export function UnclassifiedView({
	unclassified,
	onOpenAIClassify,
	onDeleteItem,
}: UnclassifiedViewProps) {
	if (unclassified.length === 0) {
		return (
			<div className="flex-1 flex flex-col">
				<EmptyState className="py-20 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-3xl bg-surface p-8">
					<div className="w-14 h-14 rounded-2xl bg-surface-secondary flex items-center justify-center text-muted mb-3.5 opacity-50">
						📥
					</div>
					<h3 className="text-sm font-semibold text-foreground mb-1">
						未分类池暂无待整理内容
					</h3>
					<p className="text-xs text-muted mb-4 max-w-sm">
						在 Chrome 浏览器侧边栏扩展中，点击「⚡ 一键同步至工作台」即可将
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
							⚡
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
						className="rounded-full shadow-sm shrink-0"
						onPress={onOpenAIClassify}
					>
						⚡ 启动 DeepSeek 一键智能分类
					</Button>
				</div>

				{/* Unclassified Items Grid */}
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
					{unclassified.map((item, idx) => (
						<WorkbenchItemCard
							key={item.id || idx}
							item={item}
							index={idx}
							showMoveDropdown={false}
							showTypeBadge={false}
							onDeleteItem={onDeleteItem}
							footerExtra={
								<div className="flex items-center justify-between gap-2 text-[10px] text-muted w-full">
									<span className="truncate max-w-[150px]" title={item.url}>
										{item.folderName ? `📁 ${item.folderName}` : item.url}
									</span>
									{item.createdAt && (
										<span className="shrink-0">{item.createdAt}</span>
									)}
								</div>
							}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
