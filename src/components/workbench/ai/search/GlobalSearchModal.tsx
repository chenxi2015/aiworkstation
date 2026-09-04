import { Button, Modal, toast } from "@heroui/react";
import { FolderInput, FolderPlus, Search, SearchX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useEmbeddingStats } from "../../../../hooks/ai/useEmbeddingStats";
import { useItemFolderAssign } from "../../../../hooks/ai/useItemFolderAssign";
import { EmbeddingService } from "../../../../services/embeddingService";
import { WorkbenchStorageService } from "../../../../services/workbenchStorage";
import type {
	Category,
	Folder,
	ItemType,
	SearchFacets,
	SearchResultItem,
	SearchScope,
} from "../../types";
import { CATEGORIES, ITEM_TYPES } from "../../types";
import { EmbeddingStatusWidget } from "../shared/EmbeddingStatusWidget";
import { ItemFolderAssignPopover } from "../shared/ItemFolderAssignPopover";
import { SearchHeader } from "./SearchHeader";
import { SearchResultItemRow } from "./SearchResultItemRow";
import { SearchResultsSkeleton } from "./SearchResultsSkeleton";

export interface GlobalSearchModalProps {
	isOpen: boolean;
	onClose: () => void;
	folders?: Folder[];
	categories?: string[];
	initialScope?: SearchScope;
	onNavigateToFolder?: (folderId: number | null, category?: Category) => void;
	onDataChanged?: () => void;
}

/**
 * Universal Global Search Modal with In-Place Folder Assignment
 */
export function GlobalSearchModal({
	isOpen,
	onClose,
	folders = [],
	categories = CATEGORIES as unknown as string[],
	initialScope,
	onNavigateToFolder,
	onDataChanged,
}: GlobalSearchModalProps) {
	const [query, setQuery] = useState("");
	const [scope, setScope] = useState<SearchScope>(
		initialScope || { type: "global" },
	);
	const [rawResults, setRawResults] = useState<SearchResultItem[]>([]);
	// Derive facets directly from actual rawResults so category/type counts always match result items exactly
	const facets: SearchFacets = useMemo(() => {
		return EmbeddingService.computeFacets(rawResults);
	}, [rawResults]);

	const [activeCategoryFacet, setActiveCategoryFacet] = useState<string | null>(
		null,
	);
	const [activeFolderFacet, setActiveFolderFacet] = useState<string | null>(
		null,
	);
	const [activeTypeFacet, setActiveTypeFacet] = useState<string | null>(null);

	const [isLoading, setIsLoading] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState<number>(0);
	const inputRef = useRef<HTMLInputElement>(null);

	// 1. Vector Index Embedding Stats Hook
	const { stats, isIndexing, buildIndex, fetchStats } =
		useEmbeddingStats(isOpen);

	// 2. Folder Assignment Hook
	const folderAssign = useItemFolderAssign({
		onDataChanged,
	});

	// Reset state when modal opens/closes or initialScope changes
	useEffect(() => {
		if (isOpen) {
			fetchStats();
			setSelectedIndex(0);
			setScope(initialScope || { type: "global" });
			setActiveCategoryFacet(null);
			setActiveFolderFacet(null);
			setActiveTypeFacet(null);
			folderAssign.clearSelection();
			folderAssign.closeAssign();
			setTimeout(() => {
				inputRef.current?.focus();
			}, 50);
		} else {
			setQuery("");
			setRawResults([]);
			setActiveCategoryFacet(null);
			setActiveFolderFacet(null);
			setActiveTypeFacet(null);
			folderAssign.clearSelection();
			folderAssign.closeAssign();
		}
	}, [isOpen, initialScope]);

	// Debounced Search Request
	useEffect(() => {
		if (!isOpen) return;

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
					mode: "hybrid",
					embeddingConfig,
					limit: 200,
					scope,
				});

				setRawResults(searchRes.items);
				setSelectedIndex(0);
			} catch (err) {
				console.error("[GlobalSearch] search error:", err);
				toast.danger("搜索执行失败");
			} finally {
				setIsLoading(false);
			}
		}, 180);

		return () => clearTimeout(timer);
	}, [query, scope, isOpen]);

	// Filtered results based on client-side active facet pills
	const results = rawResults.filter((item) => {
		if (activeCategoryFacet && item.category !== activeCategoryFacet) {
			return false;
		}
		if (
			activeFolderFacet &&
			(item.folderName || "未分类") !== activeFolderFacet
		) {
			return false;
		}
		if (activeTypeFacet && item.type !== activeTypeFacet) {
			return false;
		}
		return true;
	});

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
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="lg" className="max-w-4xl w-full mx-auto p-4">
				<Modal.Dialog
					aria-label="全局智能搜索"
					className="p-0 border-none bg-transparent shadow-none max-w-none w-full"
				>
					<div
						className="bg-surface border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[85vh] outline-none w-full"
						onKeyDown={handleKeyDown}
						onClick={(e) => e.stopPropagation()}
						tabIndex={-1}
					>
						<SearchHeader
							query={query}
							scope={scope}
							folders={folders}
							inputRef={inputRef}
							onChangeQuery={setQuery}
							onChangeScope={setScope}
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
										已选 {selectedCount} 项
									</span>
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
										folderAssign.createFolderAndMove(
											(newFolder: Folder, moved) =>
												handleItemsMoved(moved, newFolder),
										)
									}
									variant="drawer"
								/>
							)}

							{isLoading ? (
								<SearchResultsSkeleton rows={4} />
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
										尝试更换搜索关键词，或在上方重新构建向量索引。
									</p>
								</div>
							) : (
								<div className="flex flex-col gap-3">
									{/* Facet Filters Bar */}
									{rawResults.length > 0 && (
										<div className="flex flex-col gap-2 p-2.5 rounded-xl bg-surface-secondary/40 border border-border/50 text-xs">
											{/* Category Facets */}
											{facets.categories.length > 1 && (
												<div className="flex items-center gap-1.5 flex-wrap">
													<span className="text-[11px] text-muted shrink-0 mr-0.5">
														分类:
													</span>
													<button
														type="button"
														onClick={() => setActiveCategoryFacet(null)}
														className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
															activeCategoryFacet === null
																? "bg-accent text-accent-foreground font-semibold"
																: "bg-surface text-muted hover:text-foreground border border-border/60"
														}`}
													>
														全部 ({rawResults.length})
													</button>
													{facets.categories.map((c) => {
														const isActive = activeCategoryFacet === c.name;
														return (
															<button
																key={c.name}
																type="button"
																onClick={() =>
																	setActiveCategoryFacet(
																		isActive ? null : c.name,
																	)
																}
																className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1 ${
																	isActive
																		? "bg-accent text-accent-foreground font-semibold"
																		: "bg-surface text-muted hover:text-foreground border border-border/60"
																}`}
															>
																<span>{c.name}</span>
																<span
																	className={`text-[10px] ${
																		isActive ? "opacity-90" : "opacity-60"
																	}`}
																>
																	{c.count}
																</span>
															</button>
														);
													})}
												</div>
											)}

											{/* Folder Facets */}
											{facets.folders.length > 1 && (
												<div className="flex items-center gap-1.5 flex-wrap">
													<span className="text-[11px] text-muted shrink-0 mr-0.5">
														文件夹:
													</span>
													<button
														type="button"
														onClick={() => setActiveFolderFacet(null)}
														className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
															activeFolderFacet === null
																? "bg-accent text-accent-foreground font-semibold"
																: "bg-surface text-muted hover:text-foreground border border-border/60"
														}`}
													>
														全部
													</button>
													{facets.folders.slice(0, 8).map((f) => {
														const isActive = activeFolderFacet === f.name;
														return (
															<button
																key={f.name}
																type="button"
																onClick={() =>
																	setActiveFolderFacet(isActive ? null : f.name)
																}
																className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1 ${
																	isActive
																		? "bg-accent text-accent-foreground font-semibold"
																		: "bg-surface text-muted hover:text-foreground border border-border/60"
																}`}
															>
																<span>{f.name}</span>
																<span
																	className={`text-[10px] ${
																		isActive ? "opacity-90" : "opacity-60"
																	}`}
																>
																	{f.count}
																</span>
															</button>
														);
													})}
												</div>
											)}

											{/* Type Facets */}
											{facets.types.length > 1 && (
												<div className="flex items-center gap-1.5 flex-wrap">
													<span className="text-[11px] text-muted shrink-0 mr-0.5">
														类型:
													</span>
													<button
														type="button"
														onClick={() => setActiveTypeFacet(null)}
														className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
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
																className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1 ${
																	isActive
																		? "bg-accent text-accent-foreground font-semibold"
																		: "bg-surface text-muted hover:text-foreground border border-border/60"
																}`}
															>
																<span>{typeLabel}</span>
																<span
																	className={`text-[10px] ${
																		isActive ? "opacity-90" : "opacity-60"
																	}`}
																>
																	{t.count}
																</span>
															</button>
														);
													})}
												</div>
											)}
										</div>
									)}

									<div className="flex items-center justify-between text-xs text-muted mb-0.5 px-1">
										<div className="flex items-center gap-2">
											<span>
												共找到 {results.length} 条相关结果
												{results.length !== rawResults.length && (
													<span className="text-[10px] text-accent ml-1">
														(已通过 Facet 过滤，原 {rawResults.length} 条)
													</span>
												)}
											</span>
										</div>
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
											{selectedCount === results.length
												? "取消全选"
												: "全选结果"}
										</button>
									</div>

									{results.map((item, idx) => {
										const itemKey = item.id || item.url || idx;
										const isChecked =
											folderAssign.selectedItemKeys.has(itemKey);
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
												onOpenAssign={(e) =>
													folderAssign.openAssignSingle(item, e)
												}
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
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
