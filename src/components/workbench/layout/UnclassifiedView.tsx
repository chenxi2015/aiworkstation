import { Button, EmptyState } from "@heroui/react";
import { Folder, Inbox, Loader2, Sparkles, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { extractDomain } from "../../../lib/url";
import { WorkbenchItemCard } from "../item/WorkbenchItemCard";
import type { Folder as WorkbenchFolder, WorkbenchItem } from "../types";

export interface UnclassifiedViewProps {
	unclassified: WorkbenchItem[];
	folders?: WorkbenchFolder[];
	onOpenAIClassify: () => void;
	onDeleteItem: (item: WorkbenchItem) => void;
	onMoveItem?: (item: WorkbenchItem, targetFolderId: number) => void;
}

const INITIAL_BATCH_SIZE = 60;
const SCROLL_BATCH_SIZE = 40;

/**
 * Unclassified Pool View with DeepSeek AI classification trigger and progressive batch-rendered bookmark grid
 */
export function UnclassifiedView({
	unclassified,
	folders = [],
	onOpenAIClassify,
	onDeleteItem,
	onMoveItem,
}: UnclassifiedViewProps) {
	// Progressive rendering states for 2000+ items
	const [visibleCount, setVisibleCount] = useState(INITIAL_BATCH_SIZE);
	const sentinelRef = useRef<HTMLDivElement | null>(null);

	// Reset visible count when unclassified list length changes meaningfully
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset pagination when dataset size changes
	useEffect(() => {
		setVisibleCount(INITIAL_BATCH_SIZE);
	}, [unclassified.length]);

	// Auto load next batch when scrolling near the bottom using IntersectionObserver
	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel) return;

		const observer = new IntersectionObserver(
			(entries) => {
				const [entry] = entries;
				if (entry.isIntersecting) {
					setVisibleCount((prev) => {
						if (prev >= unclassified.length) return prev;
						return Math.min(prev + SCROLL_BATCH_SIZE, unclassified.length);
					});
				}
			},
			{ rootMargin: "400px" },
		);

		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [unclassified.length]);

	const visibleItems = useMemo(
		() => unclassified.slice(0, visibleCount),
		[unclassified, visibleCount],
	);

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
						在 Chrome 浏览器侧边栏扩展中，点击「一键同步至工作台」即可将 2000+
						书签快速写入本地 SQLite。
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
								点击按钮，由 AI大模型
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
						<span>启动 AI 一键智能分类</span>
					</Button>
				</div>

				{/* Unclassified Items Grid: 5 to 6 cards per row on larger screens */}
				<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5">
					{visibleItems.map((item, idx) => (
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
								<div className="flex items-center justify-between gap-1.5 text-[10px] text-muted w-full min-w-0 pr-0.5">
									<span
										className="truncate max-w-[120px] inline-flex items-center gap-1 opacity-80"
										title={
											item.folderName
												? `原书签目录: ${item.folderName}`
												: item.url
										}
									>
										{item.folderName ? (
											<>
												<Folder className="w-2.5 h-2.5 opacity-60 shrink-0" />
												<span className="truncate">{item.folderName}</span>
											</>
										) : (
											<span className="truncate text-[10px] opacity-70 font-mono">
												{extractDomain(item.url) || item.url}
											</span>
										)}
									</span>
									{item.createdAt && (
										<span
											className="shrink-0 text-[10px] text-muted/70"
											title={`同步时间: ${item.createdAt}`}
										>
											{item.createdAt}
										</span>
									)}
								</div>
							}
						/>
					))}
				</div>

				{/* Sentinel for infinite progressive rendering */}
				{visibleCount < unclassified.length && (
					<div
						ref={sentinelRef}
						className="py-6 flex flex-col items-center justify-center gap-1.5 text-xs text-muted"
					>
						<div className="flex items-center gap-2">
							<Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
							<span>加载更多书签中...</span>
						</div>
						<span className="text-[11px] text-muted/70">
							已展示 {visibleCount} / {unclassified.length} 条（滚动自动加载）
						</span>
					</div>
				)}
			</div>
		</div>
	);
}
