import { Button, toast } from "@heroui/react";
import {
	FolderInput,
	FolderPlus,
	RotateCcw,
	Search,
	SearchX,
	Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useItemFolderAssign } from "../../../../hooks/ai/useItemFolderAssign";
import { EmbeddingService } from "../../../../services/embeddingService";
import { WorkbenchStorageService } from "../../../../services/workbenchStorage";
import type {
	Category,
	Folder,
	ItemType,
	SearchFacets,
	SearchMode,
	SearchResultItem,
	SearchScope,
} from "../../types";
import { CATEGORIES, ITEM_TYPES } from "../../types";
import { ItemFolderAssignPopover } from "../shared/ItemFolderAssignPopover";
import { SearchHeader } from "./SearchHeader";
import { SearchResultItemRow } from "./SearchResultItemRow";
import { SearchResultsSkeleton } from "./SearchResultsSkeleton";
import { getSearchTabSnapshot, saveSearchTabSnapshot } from "./searchTabState";

export interface SearchTabContentProps {
	folders?: Folder[];
	categories?: string[];
	selectedFolder?: Folder | null;
	activeCategory?: Category;
	scopeMode?: "global" | "folder";
	onNavigateToFolder?: (folderId: number | null, category?: Category) => void;
	onTransferToAiChat: (query: string) => void;
	onDataChanged?: () => void;
}

/**
 * Embedded Search Tab Content for the Right-side Resident Panel
 */
export function SearchTabContent({
	folders = [],
	categories = CATEGORIES as unknown as string[],
	selectedFolder,
	activeCategory: _activeCategory,
	scopeMode = "global",
	onNavigateToFolder,
	onTransferToAiChat,
	onDataChanged,
}: SearchTabContentProps) {
	// Restore the last search session (survives tab switches & route navigation)
	const [snapshot] = useState(getSearchTabSnapshot);

	const [query, setQuery] = useState(snapshot.query);
	const [mode, setMode] = useState<SearchMode>(snapshot.mode || "keyword");
	const [scope, setScope] = useState<SearchScope>(() => {
		if (scopeMode === "folder" && selectedFolder) {
			return {
				type: "folder",
				folderId: selectedFolder.id,
				folderName: selectedFolder.name,
			};
		}
		return { type: "global" };
	});

	const [rawResults, setRawResults] = useState<SearchResultItem[]>(
		snapshot.results,
	);
	// Derive facets directly from actual rawResults so category/type counts always match result items exactly
	const facets: SearchFacets = useMemo(() => {
		return EmbeddingService.computeFacets(rawResults);
	}, [rawResults]);

	const [activeCategoryFacet, setActiveCategoryFacet] = useState<string | null>(
		snapshot.activeCategoryFacet,
	);
	const [activeFolderFacet, setActiveFolderFacet] = useState<string | null>(
		snapshot.activeFolderFacet,
	);
	const [activeTypeFacet, setActiveTypeFacet] = useState<string | null>(
		snapshot.activeTypeFacet,
	);

	const [isLoading, setIsLoading] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState<number>(0);
	const inputRef = useRef<HTMLInputElement>(null);

	// Folder Assignment Hook
	const folderAssign = useItemFolderAssign({
		onDataChanged,
	});

	// Persist the search session so tab switches / route navigation restore it
	useEffect(() => {
		saveSearchTabSnapshot({
			query,
			mode,
			scope,
			results: rawResults,
			activeCategoryFacet,
			activeFolderFacet,
			activeTypeFacet,
		});
	}, [
		query,
		mode,
		scope,
		rawResults,
		activeCategoryFacet,
		activeFolderFacet,
		activeTypeFacet,
	]);

	// Sync scope when scopeMode or selected folder changes externally
	useEffect(() => {
		if (scopeMode === "folder" && selectedFolder) {
			setScope({
				type: "folder",
				folderId: selectedFolder.id,
				folderName: selectedFolder.name,
			});
		} else {
			setScope({ type: "global" });
		}
	}, [scopeMode, selectedFolder]);

	// Debounced Search Request
	useEffect(() => {
		const q = query.trim();
		if (!q) {
			setRawResults([]);
			setActiveCategoryFacet(null);
			setActiveFolderFacet(null);
			setActiveTypeFacet(null);
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
					limit: 200,
					scope,
				});

				setRawResults(searchRes.items);
				setSelectedIndex(0);
			} catch (err) {
				console.error("[SearchTabContent] search error:", err);
				toast.danger("搜索执行失败");
			} finally {
				setIsLoading(false);
			}
		}, 180);

		return () => clearTimeout(timer);
	}, [query, scope, mode]);

	// Filtered results based on client-side active facet pills
	const results = rawResults.filter((item) => {
		const itemCat = item.category || "未分类";
		if (activeCategoryFacet && itemCat !== activeCategoryFacet) {
			return false;
		}
		const itemFolder = item.folderName || "未分类";
		if (activeFolderFacet && itemFolder !== activeFolderFacet) {
			return false;
		}
		const itemType = item.type || "link";
		if (activeTypeFacet && itemType !== activeTypeFacet) {
			return false;
		}
		return true;
	});

	const hasActiveFacets = Boolean(
		activeCategoryFacet || activeFolderFacet || activeTypeFacet,
	);

	const resetFacets = () => {
		setActiveCategoryFacet(null);
		setActiveFolderFacet(null);
		setActiveTypeFacet(null);
	};

	// Update results in memory when moved to a folder
	const handleItemsMoved = (
		movedItems: SearchResultItem[],
		targetFolder: Folder,
	) => {
		const movedKeys = new Set(movedItems.map((i) => i.id || i.url));
		setRawResults((prev) =>
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
		<div className="flex flex-col h-full overflow-hidden relative">
			{/* Search Header */}
			<SearchHeader
				query={query}
				mode={mode}
				inputRef={inputRef}
				onChangeQuery={setQuery}
				onChangeMode={setMode}
			/>

			{/* Batch Selection Action Bar */}
			{selectedCount > 0 && (
				<div className="px-3 py-1.5 bg-accent-soft/40 border-b border-accent/30 flex items-center justify-between gap-2 shrink-0">
					<span className="text-xs text-foreground font-medium">
						已选中 {selectedCount} 项
					</span>
					<div className="flex items-center gap-1">
						<Button
							variant="secondary"
							size="sm"
							className="h-6 px-2 text-xs rounded-lg cursor-pointer flex items-center gap-1"
							onPress={() =>
								folderAssign.openAssignMultiple(selectedItems, false)
							}
						>
							<FolderInput className="w-3 h-3" />
							<span>归入已有</span>
						</Button>
						<Button
							variant="primary"
							size="sm"
							className="h-6 px-2 text-xs rounded-lg cursor-pointer flex items-center gap-1"
							onPress={() =>
								folderAssign.openAssignMultiple(selectedItems, true)
							}
						>
							<FolderPlus className="w-3 h-3" />
							<span>新建归入</span>
						</Button>
					</div>
				</div>
			)}

			{/* Main Scrollable Results Area */}
			<div className="flex-1 overflow-y-auto p-3 space-y-2.5 relative">
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

				{isLoading && rawResults.length === 0 ? (
					<SearchResultsSkeleton rows={4} />
				) : !query.trim() ? (
					<div className="flex flex-col items-center justify-center text-center py-12 px-3 text-muted">
						<div className="w-10 h-10 rounded-xl bg-surface-secondary border border-border flex items-center justify-center text-accent mb-2.5">
							<Search className="w-5 h-5" />
						</div>
						<h4 className="font-semibold text-xs text-foreground mb-1">
							本地极速检索
						</h4>
						<p className="text-[11px] leading-relaxed max-w-[240px]">
							输入关键词即刻秒级过滤，亦可在搜索框开启「语义增强」进行智能召回。
						</p>
					</div>
				) : rawResults.length === 0 ? (
					<div className="flex flex-col items-center justify-center text-center py-10 px-3 text-muted">
						<SearchX className="w-8 h-8 mb-2 opacity-50" />
						<p className="text-xs font-medium text-foreground">
							本地未找到与「{query}」相关的书签
						</p>
						<button
							type="button"
							onClick={() => onTransferToAiChat(query)}
							className="mt-3 px-3 py-1.5 rounded-xl bg-accent-soft/70 hover:bg-accent-soft text-accent text-xs font-medium border border-accent/40 flex items-center gap-1.5 cursor-pointer transition-colors"
						>
							<Sparkles className="w-3.5 h-3.5" />
							<span>向 AI 深入提问此内容</span>
						</button>
					</div>
				) : (
					<div className="flex flex-col gap-2.5">
						{/* Facet Filters Bar */}
						{(facets.categories.length > 1 ||
							facets.folders.length > 1 ||
							facets.types.length > 1) && (
							<div className="flex flex-col gap-1.5 p-2 rounded-xl bg-surface-secondary/50 border border-border/60 text-xs">
								{hasActiveFacets && (
									<div className="flex items-center justify-between pb-1 border-b border-border/40 text-[10px]">
										<span className="text-muted">已应用自定义筛选</span>
										<button
											type="button"
											onClick={resetFacets}
											className="text-accent hover:underline flex items-center gap-1 cursor-pointer font-medium"
										>
											<RotateCcw className="w-2.5 h-2.5" />
											<span>重置筛选</span>
										</button>
									</div>
								)}

								{/* Category Facets */}
								{facets.categories.length > 1 && (
									<div className="flex items-center gap-1 flex-wrap">
										<span className="text-[10px] text-muted shrink-0 mr-0.5">
											分类:
										</span>
										<button
											type="button"
											onClick={() => setActiveCategoryFacet(null)}
											className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
												activeCategoryFacet === null
													? "bg-accent text-accent-foreground font-semibold"
													: "bg-surface text-muted hover:text-foreground border border-border/60"
											}`}
										>
											全部
										</button>
										{facets.categories.slice(0, 5).map((c) => {
											const isActive = activeCategoryFacet === c.name;
											return (
												<button
													key={c.name}
													type="button"
													onClick={() =>
														setActiveCategoryFacet(isActive ? null : c.name)
													}
													className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1 ${
														isActive
															? "bg-accent text-accent-foreground font-semibold"
															: "bg-surface text-muted hover:text-foreground border border-border/60"
													}`}
												>
													<span>{c.name}</span>
													<span className="opacity-60">{c.count}</span>
												</button>
											);
										})}
									</div>
								)}

								{/* Folder Facets */}
								{facets.folders.length > 1 && (
									<div className="flex items-center gap-1 flex-wrap">
										<span className="text-[10px] text-muted shrink-0 mr-0.5">
											文件夹:
										</span>
										<button
											type="button"
											onClick={() => setActiveFolderFacet(null)}
											className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
												activeFolderFacet === null
													? "bg-accent text-accent-foreground font-semibold"
													: "bg-surface text-muted hover:text-foreground border border-border/60"
											}`}
										>
											全部
										</button>
										{facets.folders.slice(0, 5).map((f) => {
											const isActive = activeFolderFacet === f.name;
											return (
												<button
													key={f.name}
													type="button"
													onClick={() =>
														setActiveFolderFacet(isActive ? null : f.name)
													}
													className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1 ${
														isActive
															? "bg-accent text-accent-foreground font-semibold"
															: "bg-surface text-muted hover:text-foreground border border-border/60"
													}`}
												>
													<span>{f.name}</span>
													<span className="opacity-60">{f.count}</span>
												</button>
											);
										})}
									</div>
								)}

								{/* Type Facets */}
								{facets.types.length > 1 && (
									<div className="flex items-center gap-1 flex-wrap">
										<span className="text-[10px] text-muted shrink-0 mr-0.5">
											类型:
										</span>
										<button
											type="button"
											onClick={() => setActiveTypeFacet(null)}
											className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
												activeTypeFacet === null
													? "bg-accent text-accent-foreground font-semibold"
													: "bg-surface text-muted hover:text-foreground border border-border/60"
											}`}
										>
											全部
										</button>
										{facets.types.map((t) => {
											const isActive = activeTypeFacet === t.name;
											const typeLabel =
												ITEM_TYPES[t.name as ItemType]?.label || t.name;
											return (
												<button
													key={t.name}
													type="button"
													onClick={() =>
														setActiveTypeFacet(isActive ? null : t.name)
													}
													className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1 ${
														isActive
															? "bg-accent text-accent-foreground font-semibold"
															: "bg-surface text-muted hover:text-foreground border border-border/60"
													}`}
												>
													<span>{typeLabel}</span>
													<span className="opacity-60">{t.count}</span>
												</button>
											);
										})}
									</div>
								)}
							</div>
						)}

						{/* Results Count & Select All */}
						<div className="flex items-center justify-between text-[11px] text-muted px-1">
							<span>
								找到 {results.length} 项
								{results.length !== rawResults.length && (
									<span className="text-accent ml-1 font-medium">(筛选后)</span>
								)}
							</span>
							{results.length > 0 && (
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
									{selectedCount === results.length ? "取消全选" : "全选"}
								</button>
							)}
						</div>

						{/* Results Rows or Empty Filter State */}
						{results.length === 0 ? (
							<div className="flex flex-col items-center justify-center text-center py-8 px-3 text-muted bg-surface-secondary/20 rounded-xl border border-dashed border-border/80">
								<SearchX className="w-7 h-7 mb-2 opacity-50 text-muted" />
								<p className="text-xs font-medium text-foreground">
									当前筛选组合下无匹配书签
								</p>
								<p className="text-[11px] text-muted mt-1 max-w-[240px]">
									可点击上方已选中的标签取消筛选，或一键恢复全部结果。
								</p>
								<button
									type="button"
									onClick={resetFacets}
									className="mt-3 px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:opacity-90 flex items-center gap-1.5 cursor-pointer transition-opacity"
								>
									<RotateCcw className="w-3 h-3" />
									<span>清除筛选条件 (共 {rawResults.length} 项)</span>
								</button>
							</div>
						) : (
							results.map((item, idx) => {
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
										onCloseModal={() => {}}
									/>
								);
							})
						)}

						{/* Transfer to AI Deep Chat Action Banner */}
						<div className="mt-2 p-3 rounded-xl bg-accent-soft/30 border border-accent/30 flex flex-col gap-2">
							<div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
								<Sparkles className="w-3.5 h-3.5 text-accent" />
								<span>需要深入盘点与场景推荐？</span>
							</div>
							<p className="text-[11px] text-muted leading-relaxed">
								将当前关键词「{query}」与匹配的书签一键转入 AI
								问答，自动获得深度分析报告。
							</p>
							<button
								type="button"
								onClick={() => onTransferToAiChat(query)}
								className="w-full py-1.5 px-3 rounded-lg bg-accent text-accent-foreground text-xs font-medium shadow-xs hover:opacity-95 transition-opacity cursor-pointer flex items-center justify-center gap-1.5"
							>
								<span>转入 AI 深度分析问答</span>
								<span className="text-[10px] opacity-80 font-mono">→</span>
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
