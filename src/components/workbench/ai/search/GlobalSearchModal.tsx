import { Button, Modal, Skeleton, toast } from "@heroui/react";
import {
	FolderInput,
	FolderPlus,
	Search,
	SearchX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useEmbeddingStats } from "../../../../hooks/ai/useEmbeddingStats";
import { useItemFolderAssign } from "../../../../hooks/ai/useItemFolderAssign";
import { WorkbenchStorageService } from "../../../../services/workbenchStorage";
import type {
	Category,
	Folder,
	SearchMode,
	SearchResultItem,
} from "../../types";
import { CATEGORIES } from "../../types";
import { EmbeddingStatusWidget } from "../shared/EmbeddingStatusWidget";
import { ItemFolderAssignPopover } from "../shared/ItemFolderAssignPopover";
import { SearchHeader } from "./SearchHeader";
import { SearchResultItemRow } from "./SearchResultItemRow";

export interface GlobalSearchModalProps {
	isOpen: boolean;
	onClose: () => void;
	folders?: Folder[];
	categories?: string[];
	onNavigateToFolder?: (folderId: number | null, category?: Category) => void;
	onDataChanged?: () => void;
}

/**
 * Modular Global Search Modal with In-Place Folder Assignment and Multi-Mode Search
 */
export function GlobalSearchModal({
	isOpen,
	onClose,
	folders = [],
	categories = CATEGORIES as unknown as string[],
	onNavigateToFolder,
	onDataChanged,
}: GlobalSearchModalProps) {
	const [query, setQuery] = useState("");
	const [mode, setMode] = useState<SearchMode>("hybrid");
	const [results, setResults] = useState<SearchResultItem[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState<number>(0);
	const inputRef = useRef<HTMLInputElement>(null);

	// 1. Vector Index Embedding Stats Hook
	const { stats, isIndexing, buildIndex, fetchStats } = useEmbeddingStats(isOpen);

	// 2. Folder Assignment Hook
	const folderAssign = useItemFolderAssign({
		onDataChanged,
	});

	// Reset state when modal opens/closes
	useEffect(() => {
		if (isOpen) {
			fetchStats();
			setSelectedIndex(0);
			folderAssign.clearSelection();
			folderAssign.closeAssign();
			setTimeout(() => {
				inputRef.current?.focus();
			}, 50);
		} else {
			setQuery("");
			setResults([]);
			folderAssign.clearSelection();
			folderAssign.closeAssign();
		}
	}, [isOpen]);

	// Debounced Search Request
	useEffect(() => {
		if (!isOpen) return;

		const q = query.trim();
		if (!q) {
			setResults([]);
			setIsLoading(false);
			return;
		}

		setIsLoading(true);
		const timer = setTimeout(async () => {
			try {
				const settings = WorkbenchStorageService.getSettings();
				const embeddingConfig = {
					apiKey: settings.embeddingApiKey || settings.deepseekApiKey || "",
					baseUrl: settings.embeddingBaseUrl,
					model: settings.embeddingModel,
				};

				const searchRes = await WorkbenchStorageService.searchItems({
					query: q,
					mode,
					embeddingConfig,
					limit: 40,
				});

				setResults(searchRes);
				setSelectedIndex(0);
			} catch (err) {
				console.error("[GlobalSearch] search error:", err);
				toast.danger("搜索执行失败");
			} finally {
				setIsLoading(false);
			}
		}, 180);

		return () => clearTimeout(timer);
	}, [query, mode, isOpen]);

	// Keyboard Navigation
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (folderAssign.assigningItems) {
			if (e.key === "Escape") {
				e.preventDefault();
				folderAssign.closeAssign();
			}
			return;
		}

		if (e.key === "ArrowDown") {
			e.preventDefault();
			setSelectedIndex((prev) =>
				results.length > 0 ? (prev + 1) % results.length : 0,
			);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setSelectedIndex((prev) =>
				results.length > 0 ? (prev - 1 + results.length) % results.length : 0,
			);
		} else if (e.key === "Enter") {
			if (results.length > 0 && results[selectedIndex]) {
				e.preventDefault();
				const item = results[selectedIndex];
				if (item.url) {
					window.open(item.url, "_blank");
					onClose();
				}
			}
		}
	};

	// Update results in memory when moved to a folder
	const handleItemsMoved = (movedItems: SearchResultItem[], targetFolder: Folder) => {
		const movedKeys = new Set(movedItems.map((i) => i.id || i.url));
		setResults((prev) =>
			prev.map((r) => {
				if (movedKeys.has(r.id || r.url)) {
					return {
						...r,
						folderId: targetFolder.id,
						folderName: targetFolder.name,
						category: targetFolder.category as Category,
					};
				}
				return r;
			}),
		);
	};

	const selectedCount = folderAssign.selectedItemKeys.size;
	const selectedItems = results.filter((r) =>
		folderAssign.selectedItemKeys.has(r.id || r.url || ""),
	);

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="lg" className="max-w-4xl w-full mx-auto p-4">
				<div
					className="bg-surface border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[85vh] outline-none"
					onKeyDown={handleKeyDown}
					tabIndex={-1}
				>
					{/* Search Topbar */}
					<SearchHeader
						query={query}
						mode={mode}
						inputRef={inputRef}
						onChangeQuery={setQuery}
						onChangeMode={setMode}
						onClose={onClose}
					/>

					{/* Embedding Coverage Status Subbar */}
					<div className="px-4 py-2 bg-surface-secondary/40 border-b border-border/60 flex items-center justify-between gap-4">
						<EmbeddingStatusWidget
							stats={stats}
							isIndexing={isIndexing}
							onBuildIndex={buildIndex}
							compact={false}
							className="bg-transparent border-none p-0"
						/>

						{/* Batch Operations Bar */}
						{selectedCount > 0 && (
							<div className="flex items-center gap-1.5 animate-in fade-in duration-200">
								<span className="text-xs text-foreground font-medium mr-1">
									已选中 {selectedCount} 项
								</span>
								<Button
									variant="secondary"
									size="sm"
									className="h-6 px-2 text-xs rounded-lg cursor-pointer flex items-center gap-1"
									onPress={() => folderAssign.openAssignMultiple(selectedItems, false)}
								>
									<FolderInput className="w-3 h-3" />
									<span>归入已有</span>
								</Button>
								<Button
									variant="primary"
									size="sm"
									className="h-6 px-2 text-xs rounded-lg cursor-pointer flex items-center gap-1"
									onPress={() => folderAssign.openAssignMultiple(selectedItems, true)}
								>
									<FolderPlus className="w-3 h-3" />
									<span>新建归入</span>
								</Button>
							</div>
						)}
					</div>

					{/* Results List or Drawer Container */}
					<div className="flex-1 overflow-y-auto p-4 min-h-[300px] relative">
						{/* In-Place Folder Assignment Drawer */}
						{folderAssign.assigningItems && (
							<ItemFolderAssignPopover
								assigningItems={folderAssign.assigningItems}
								folders={folders}
								categories={categories}
								isCreateMode={folderAssign.isCreateMode}
								newFolderName={folderAssign.newFolderName}
								newFolderCategory={folderAssign.newFolderCategory}
								folderFilterQuery={folderAssign.folderFilterQuery}
								isProcessingMove={folderAssign.isProcessingMove}
								onToggleCreateMode={() =>
									folderAssign.setIsCreateMode(!folderAssign.isCreateMode)
								}
								onChangeNewFolderName={folderAssign.setNewFolderName}
								onChangeNewFolderCategory={folderAssign.setNewFolderCategory}
								onChangeFilterQuery={folderAssign.setFolderFilterQuery}
								onClose={folderAssign.closeAssign}
								onMoveToExistingFolder={(targetFolder: Folder) =>
									folderAssign.moveToExistingFolder(targetFolder, (moved) =>
										handleItemsMoved(moved, targetFolder),
									)
								}
								onCreateFolderAndMove={() =>
									folderAssign.createFolderAndMove((newFolder: Folder, moved) =>
										handleItemsMoved(moved, newFolder),
									)
								}
								variant="drawer"
							/>
						)}

						{isLoading ? (
							<div className="space-y-3">
								<Skeleton className="h-16 w-full rounded-xl" />
								<Skeleton className="h-16 w-full rounded-xl" />
								<Skeleton className="h-16 w-full rounded-xl" />
							</div>
						) : !query.trim() ? (
							<div className="flex flex-col items-center justify-center text-center py-16 text-muted">
								<div className="w-12 h-12 rounded-2xl bg-surface-secondary border border-border flex items-center justify-center text-accent mb-3">
									<Search className="w-6 h-6" />
								</div>
								<h4 className="font-semibold text-sm text-foreground mb-1">
									输入关键词或自然语言意图
								</h4>
								<p className="text-xs max-w-sm leading-relaxed">
									支持向量语义检索，例如搜索「做自媒体好用的剪辑神器」即可智能召回相关工具。
								</p>
							</div>
						) : results.length === 0 ? (
							<div className="flex flex-col items-center justify-center text-center py-16 text-muted">
								<SearchX className="w-10 h-10 mb-2 opacity-50" />
								<p className="text-sm font-medium text-foreground">
									未找到与「{query}」相关的书签
								</p>
								<p className="text-xs mt-1">
									尝试切换为“向量语义”或“关键词”模式，或重新构建向量索引。
								</p>
							</div>
						) : (
							<div className="flex flex-col gap-2">
								<div className="flex items-center justify-between text-xs text-muted mb-1 px-1">
									<span>共找到 {results.length} 条相关结果</span>
									<button
										type="button"
										onClick={() => {
											if (selectedCount === results.length) {
												folderAssign.clearSelection();
											} else {
												folderAssign.selectAll(results);
											}
										}}
										className="text-accent hover:underline cursor-pointer"
									>
										{selectedCount === results.length ? "取消全选" : "全选结果"}
									</button>
								</div>

								{results.map((item, idx) => {
									const itemKey = item.id || item.url || idx;
									const isChecked = folderAssign.selectedItemKeys.has(itemKey);
									const isSelected = selectedIndex === idx;

									return (
										<SearchResultItemRow
											key={itemKey}
											item={item}
											isSelected={isSelected}
											isChecked={isChecked}
											onToggleCheck={(e) => {
												e.stopPropagation();
												folderAssign.toggleSelectItem(itemKey);
											}}
											onSelectRow={() => setSelectedIndex(idx)}
											onOpenAssign={(e) => folderAssign.openAssignSingle(item, e)}
											onNavigateToFolder={onNavigateToFolder}
											onCloseModal={onClose}
										/>
									);
								})}
							</div>
						)}
					</div>

					{/* Modal Footer / Shortcut Tips */}
					<div className="p-3 border-t border-border bg-surface-secondary/50 text-[11px] text-muted flex items-center justify-between px-4">
						<div className="flex items-center gap-3">
							<span>
								<kbd className="px-1.5 py-0.5 rounded bg-surface border border-border/80 font-mono text-[10px]">
									↑↓
								</kbd>{" "}
								选择条目
							</span>
							<span>
								<kbd className="px-1.5 py-0.5 rounded bg-surface border border-border/80 font-mono text-[10px]">
									Enter
								</kbd>{" "}
								打开链接
							</span>
							<span>
								<kbd className="px-1.5 py-0.5 rounded bg-surface border border-border/80 font-mono text-[10px]">
									ESC
								</kbd>{" "}
								关闭窗口
							</span>
						</div>
						<div className="text-[10px]">
							已集成本地 SQLite + Hybrid RAG 引擎
						</div>
					</div>
				</div>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
