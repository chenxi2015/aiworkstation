import { Button, ScrollShadow, toast } from "@heroui/react";
import {
	CheckCircle2,
	Loader2,
	RefreshCw,
	Search,
	Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ExtensionBridgeService } from "../../../services/extensionBridge";
import { WorkbenchStorageService } from "../../../services/workbenchStorage";
import type { BookmarkTDKItem, WorkbenchItem } from "../types";
import { ExtensionGuideCard } from "./ExtensionGuideCard";

interface ExtensionSyncTabProps {
	isOpen: boolean;
	onBookmarksImported: (
		newUnclassified: WorkbenchItem[],
		triggerAICallback?: boolean,
	) => void;
	onClose: () => void;
}

const PAGE_SIZE = 80;

/**
 * Tab panel for loading Chrome bookmarks directly via AI Collector extension
 */
export function ExtensionSyncTab({
	isOpen,
	onBookmarksImported,
	onClose,
}: ExtensionSyncTabProps) {
	const [extensionInstalled, setExtensionInstalled] = useState<boolean | null>(null);
	const [isCheckingExtension, setIsCheckingExtension] = useState(false);
	const [isLoadingBookmarks, setIsLoadingBookmarks] = useState(false);
	const [chromeBookmarks, setChromeBookmarks] = useState<BookmarkTDKItem[]>([]);
	const [bookmarkSearch, setBookmarkSearch] = useState("");
	const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
	const [isImporting, setIsImporting] = useState(false);
	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

	const handleFetchBookmarks = async () => {
		setIsLoadingBookmarks(true);
		try {
			const res = await ExtensionBridgeService.fetchChromeBookmarks();
			if (res.success && res.bookmarks.length > 0) {
				setChromeBookmarks(res.bookmarks);
				setSelectedIds(new Set(res.bookmarks.map((b) => b.id)));
				setVisibleCount(PAGE_SIZE);
			} else if (res.bookmarks.length === 0) {
				toast.info("您的 Chrome 浏览器暂未找到有效网页书签");
			} else if (res.error) {
				toast.danger(res.error);
			}
		} catch (err: any) {
			toast.danger(err?.message || "读取 Chrome 书签失败");
		} finally {
			setIsLoadingBookmarks(false);
		}
	};

	const handleCheckExtension = async (autoFetch = true) => {
		setIsCheckingExtension(true);
		try {
			const installed = await ExtensionBridgeService.checkInstalled();
			setExtensionInstalled(installed);
			if (installed && autoFetch) {
				handleFetchBookmarks();
			}
		} finally {
			setIsCheckingExtension(false);
		}
	};

	useEffect(() => {
		if (isOpen) {
			handleCheckExtension(true);
		}
	}, [isOpen]);

	// Filter Chrome bookmarks by search query
	const filteredChromeBookmarks = useMemo(() => {
		if (!bookmarkSearch.trim()) return chromeBookmarks;
		const query = bookmarkSearch.trim().toLowerCase();
		return chromeBookmarks.filter(
			(bm) =>
				bm.title.toLowerCase().includes(query) ||
				bm.url.toLowerCase().includes(query) ||
				(bm.folderPath && bm.folderPath.toLowerCase().includes(query)),
		);
	}, [chromeBookmarks, bookmarkSearch]);

	// Limit rendered DOM items to avoid freezing UI thread with thousands of items
	const displayedBookmarks = useMemo(() => {
		return filteredChromeBookmarks.slice(0, visibleCount);
	}, [filteredChromeBookmarks, visibleCount]);

	const handleToggleSelectAll = () => {
		if (selectedIds.size === filteredChromeBookmarks.length) {
			setSelectedIds(new Set());
		} else {
			setSelectedIds(new Set(filteredChromeBookmarks.map((bm) => bm.id)));
		}
	};

	const handleToggleSelectOne = (id: string | number) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	// Import selected Chrome bookmarks into SQLite database
	const handleImportSelected = async (withAICallback = false) => {
		const itemsToImport = chromeBookmarks.filter((b) => selectedIds.has(b.id));
		if (itemsToImport.length === 0) {
			toast.warning("请至少选择一个要导入的书签");
			return;
		}

		setIsImporting(true);
		try {
			await WorkbenchStorageService.addBookmarksToDb(itemsToImport);
			const { unclassified: updated } =
				await WorkbenchStorageService.fetchAllFromDb();
			toast.success(`已成功将 ${itemsToImport.length} 个 Chrome 书签导入到 SQLite`);
			onBookmarksImported(updated, withAICallback);
			onClose();
		} catch (err: any) {
			toast.danger(err?.message || "导入书签至 SQLite 失败");
		} finally {
			setIsImporting(false);
		}
	};

	if (extensionInstalled === false) {
		return (
			<ExtensionGuideCard
				onCheckAgain={() => handleCheckExtension(true)}
				isChecking={isCheckingExtension}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-3 py-1">
			{/* Status Bar */}
			<div className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
				<div className="flex items-center gap-2">
					<CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
					<span className="font-semibold text-foreground text-xs">
						已读取到 Chrome 本地 {chromeBookmarks.length} 个书签
					</span>
				</div>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 px-2.5 text-xs rounded-full cursor-pointer text-muted hover:text-foreground"
					onPress={handleFetchBookmarks}
					isDisabled={isLoadingBookmarks}
				>
					<RefreshCw
						className={`w-3 h-3 ${isLoadingBookmarks ? "animate-spin" : ""}`}
					/>
					<span>重新读取</span>
				</Button>
			</div>

			{/* Search and Selection Tools */}
			{chromeBookmarks.length > 0 && (
				<div className="flex items-center gap-2">
					<div className="relative flex-1">
						<Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
						<input
							type="text"
							placeholder="快速过滤书签名称、网址或文件夹..."
							value={bookmarkSearch}
							onChange={(e) => {
								setBookmarkSearch(e.target.value);
								setVisibleCount(PAGE_SIZE);
							}}
							className="w-full pl-8 pr-3 py-1.5 bg-surface-secondary border border-border rounded-lg text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
						/>
					</div>
					<Button
						variant="ghost"
						size="sm"
						className="h-8 px-2.5 text-xs text-muted hover:text-foreground cursor-pointer shrink-0"
						onPress={handleToggleSelectAll}
					>
						{selectedIds.size === filteredChromeBookmarks.length
							? "取消全选"
							: "全选"}
					</Button>
				</div>
			)}

			{/* Loading State */}
			{isLoadingBookmarks && (
				<div className="py-12 flex flex-col items-center justify-center gap-2 text-muted">
					<Loader2 className="w-6 h-6 animate-spin text-accent" />
					<span className="text-xs">
						正在通过 AI Collector 读取 Chrome 本地书签...
					</span>
				</div>
			)}

			{/* Bookmarks Render List */}
			{!isLoadingBookmarks && filteredChromeBookmarks.length > 0 && (
				<ScrollShadow className="max-h-[240px] overflow-y-auto pr-1">
					<div className="space-y-1.5">
						{displayedBookmarks.map((bm) => {
							const isChecked = selectedIds.has(bm.id);
							return (
								<div
									key={bm.id}
									onClick={() => handleToggleSelectOne(bm.id)}
									className={`p-2 rounded-lg border transition-colors cursor-pointer flex items-center gap-2.5 select-none ${
										isChecked
											? "bg-accent-soft/30 border-accent/40"
											: "bg-surface-secondary border-border hover:border-border/80"
									}`}
								>
									<input
										type="checkbox"
										checked={isChecked}
										onChange={() => handleToggleSelectOne(bm.id)}
										className="w-3.5 h-3.5 accent-accent cursor-pointer shrink-0"
									/>
									<div className="truncate flex-1 min-w-0">
										<div className="font-medium text-foreground truncate text-xs">
											{bm.title}
										</div>
										<div className="text-[10px] text-muted truncate">
											{bm.url}
										</div>
									</div>
									{bm.parentTitle && (
										<span className="shrink-0 text-[10px] text-muted bg-surface px-1.5 py-0.5 rounded border border-border">
											{bm.parentTitle}
										</span>
									)}
								</div>
							);
						})}
					</div>

					{/* Incremental display button */}
					{visibleCount < filteredChromeBookmarks.length && (
						<div className="py-2 text-center">
							<Button
								variant="ghost"
								size="sm"
								className="text-xs text-muted hover:text-foreground cursor-pointer"
								onPress={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
							>
								展开更多书签 ({visibleCount} / {filteredChromeBookmarks.length})
							</Button>
						</div>
					)}
				</ScrollShadow>
			)}

			{/* Bottom Actions */}
			{!isLoadingBookmarks && chromeBookmarks.length > 0 && (
				<div className="flex items-center gap-2 pt-1 border-t border-border/80">
					<div className="text-[11px] text-muted mr-auto">
						已勾选{" "}
						<strong className="text-foreground">{selectedIds.size}</strong> /{" "}
						{filteredChromeBookmarks.length}
					</div>
					<Button
						variant="secondary"
						size="sm"
						className="rounded-full cursor-pointer"
						onPress={() => handleImportSelected(false)}
						isDisabled={isImporting || selectedIds.size === 0}
					>
						放入未分类池
					</Button>
					<Button
						variant="primary"
						size="sm"
						className="rounded-full shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
						onPress={() => handleImportSelected(true)}
						isDisabled={isImporting || selectedIds.size === 0}
					>
						<Sparkles className="w-3.5 h-3.5" />
						<span>导入并立即 AI 分类</span>
					</Button>
				</div>
			)}
		</div>
	);
}
