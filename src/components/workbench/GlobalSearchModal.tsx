import { Button, Modal, Skeleton, Tooltip, toast } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { ItemFavicon } from "./ItemFavicon";
import type {
	Category,
	EmbeddingStats,
	SearchMode,
	SearchResultItem,
} from "./types";
import { WorkbenchStorageService } from "../../services/workbenchStorage";

interface GlobalSearchModalProps {
	isOpen: boolean;
	onClose: () => void;
	onNavigateToFolder?: (folderId: number | null, category?: Category) => void;
}

export function GlobalSearchModal({
	isOpen,
	onClose,
	onNavigateToFolder,
}: GlobalSearchModalProps) {
	const [query, setQuery] = useState("");
	const [mode, setMode] = useState<SearchMode>("hybrid");
	const [results, setResults] = useState<SearchResultItem[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState<number>(0);
	const [stats, setStats] = useState<EmbeddingStats>({
		total: 0,
		embedded: 0,
		percentage: 0,
	});
	const [isIndexing, setIsIndexing] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	// Load stats whenever modal opens
	useEffect(() => {
		if (isOpen) {
			WorkbenchStorageService.getEmbeddingStats().then(setStats);
			setSelectedIndex(0);
			setTimeout(() => {
				inputRef.current?.focus();
			}, 50);
		} else {
			setQuery("");
			setResults([]);
		}
	}, [isOpen]);

	// Debounced search
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

	// Keyboard navigation (Up, Down, Enter, Esc)
	const handleKeyDown = (e: React.KeyboardEvent) => {
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

	// Trigger batch embedding index builder
	const handleBuildVectorIndex = async () => {
		const settings = WorkbenchStorageService.getSettings();
		const apiKey = settings.embeddingApiKey || settings.deepseekApiKey;

		if (!apiKey) {
			toast.warning("请先在「设置」中配置 Embedding API Key");
			return;
		}

		setIsIndexing(true);
		const config = {
			apiKey,
			baseUrl: settings.embeddingBaseUrl,
			model: settings.embeddingModel,
		};

		try {
			let remaining = 1;
			let totalProcessed = 0;

			while (remaining > 0) {
				const res = await WorkbenchStorageService.batchProcessEmbeddings({
					config,
					batchSize: 20,
				});
				totalProcessed += res.processed;
				remaining = res.remaining;
				setStats(res.stats);

				if (res.processed === 0) break;
			}

			toast.success(`🎉 向量索引构建完成！已向量化 ${totalProcessed} 条书签`);
		} catch (err: any) {
			console.error("[GlobalSearch] Build index error:", err);
			toast.danger(`构建向量索引失败: ${err.message || err}`);
		} finally {
			setIsIndexing(false);
		}
	};

	// Handle item jump to folder in workbench
	const handleJumpToFolder = (item: SearchResultItem) => {
		if (onNavigateToFolder) {
			onNavigateToFolder(item.folderId || null, item.category as Category);
			onClose();
		}
	};

	// Copy item URL
	const handleCopyUrl = (item: SearchResultItem) => {
		if (item.url) {
			navigator.clipboard.writeText(item.url);
			toast.success("已复制链接到剪贴板");
		}
	};

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="lg" className="max-w-3xl">
				<Modal.Dialog className="p-0 overflow-hidden flex flex-col max-h-[85vh] bg-surface border border-border shadow-2xl rounded-2xl">
					{/* Search Header Bar */}
					<div className="p-4 border-b border-border bg-surface-secondary/40 flex flex-col gap-3">
						{/* Input Bar */}
						<div className="relative flex items-center">
							<span className="absolute left-3.5 text-muted pointer-events-none text-sm">
								🔍
							</span>
							<input
								ref={inputRef}
								type="text"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder="全局搜索书签、意图、工具、标签或网址... (支持自然语言)"
								className="w-full bg-surface border border-border/80 rounded-xl pl-10 pr-24 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all shadow-xs"
							/>
							{query && (
								<button
									type="button"
									onClick={() => setQuery("")}
									className="absolute right-10 w-5 h-5 rounded-full flex items-center justify-center text-xs text-muted hover:text-foreground cursor-pointer"
								>
									✕
								</button>
							)}
							<div className="absolute right-3.5 pointer-events-none flex items-center gap-1">
								<kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-surface-secondary border border-border rounded text-muted">
									ESC
								</kbd>
							</div>
						</div>

						{/* Subheader: Mode selector & Vector stats */}
						<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
							{/* Search Mode Tabs */}
							<div className="flex items-center gap-1 bg-surface p-0.5 rounded-lg border border-border">
								<button
									type="button"
									onClick={() => setMode("hybrid")}
									className={`px-2.5 py-1 rounded-md font-medium text-xs transition-all cursor-pointer ${
										mode === "hybrid"
											? "bg-accent-soft text-accent shadow-xs font-semibold"
											: "text-muted hover:text-foreground"
									}`}
								>
									⚡ 混合检索 (推荐)
								</button>
								<button
									type="button"
									onClick={() => setMode("semantic")}
									className={`px-2.5 py-1 rounded-md font-medium text-xs transition-all cursor-pointer ${
										mode === "semantic"
											? "bg-accent-soft text-accent shadow-xs font-semibold"
											: "text-muted hover:text-foreground"
									}`}
								>
									🧠 AI 语义检索
								</button>
								<button
									type="button"
									onClick={() => setMode("keyword")}
									className={`px-2.5 py-1 rounded-md font-medium text-xs transition-all cursor-pointer ${
										mode === "keyword"
											? "bg-accent-soft text-accent shadow-xs font-semibold"
											: "text-muted hover:text-foreground"
									}`}
								>
									🔤 关键词匹配
								</button>
							</div>

							{/* Vector Coverage & Build Index Button */}
							<div className="flex items-center gap-2">
								<span className="text-[11px] text-muted">
									向量索引: {stats.embedded}/{stats.total} ({stats.percentage}%)
								</span>
								<Button
									variant="ghost"
									size="sm"
									className="text-[11px] rounded-full border border-border/80 h-6 px-2 hover:border-accent hover:text-accent"
									onPress={handleBuildVectorIndex}
									isDisabled={isIndexing || stats.total === 0}
								>
									{isIndexing ? "⏳ 向量化中..." : "⚡ 构建向量索引"}
								</Button>
							</div>
						</div>
					</div>

					{/* Search Results Area */}
					<div className="flex-1 overflow-y-auto p-3 min-h-[300px] max-h-[58vh]">
						{/* Loading state */}
						{isLoading ? (
							<div className="flex flex-col gap-2 p-2">
								<div className="flex items-center gap-3 p-3 rounded-xl border border-border/40">
									<Skeleton className="w-8 h-8 rounded-lg" />
									<div className="flex-1 flex flex-col gap-1.5">
										<Skeleton className="w-1/3 h-4 rounded" />
										<Skeleton className="w-2/3 h-3 rounded" />
									</div>
								</div>
								<div className="flex items-center gap-3 p-3 rounded-xl border border-border/40">
									<Skeleton className="w-8 h-8 rounded-lg" />
									<div className="flex-1 flex flex-col gap-1.5">
										<Skeleton className="w-1/2 h-4 rounded" />
										<Skeleton className="w-3/4 h-3 rounded" />
									</div>
								</div>
							</div>
						) : !query.trim() ? (
							/* Initial Guide / Suggestions */
							<div className="flex flex-col items-center justify-center text-center py-12 px-4 gap-4">
								<div className="w-12 h-12 rounded-2xl bg-accent-soft flex items-center justify-center text-accent text-2xl shadow-xs">
									🔍
								</div>
								<div>
									<h3 className="font-semibold text-sm text-foreground">
										AI 语义与全局快速检索
									</h3>
									<p className="text-xs text-muted max-w-sm mt-1 leading-relaxed">
										输入关键词、标签、或者像“剪辑视频的开源库”、“好用的提示词”等自然语言直接搜索你的收藏库。
									</p>
								</div>
								<div className="flex flex-wrap items-center justify-center gap-1.5 max-w-md mt-1">
									{[
										"视频剪辑",
										"Claude 提示词",
										"前端动画",
										"GitHub 热门",
										"AI 工具",
									].map((tag) => (
										<button
											key={tag}
											type="button"
											onClick={() => setQuery(tag)}
											className="px-2.5 py-1 text-[11px] rounded-full bg-surface-secondary text-muted hover:text-foreground hover:bg-surface-secondary/80 border border-border/60 transition-all cursor-pointer"
										>
											{tag}
										</button>
									))}
								</div>
							</div>
						) : results.length === 0 ? (
							/* Empty Results State */
							<div className="py-12 text-center flex flex-col items-center justify-center gap-2">
								<div className="text-3xl">🧩</div>
								<div className="text-sm font-medium text-foreground">
									未找到匹配的书签或内容
								</div>
								<p className="text-xs text-muted max-w-xs leading-relaxed">
									尝试更换搜索词，或者点击右上角「⚡
									构建向量索引」更新语义特征。
								</p>
							</div>
						) : (
							/* Results List */
							<div className="flex flex-col gap-1.5">
								<div className="text-[11px] font-medium text-muted px-2 py-1 flex items-center justify-between">
									<span>找到 {results.length} 条相关结果</span>
									<span>按相关度智能排序</span>
								</div>

								{results.map((item, idx) => {
									const isSelected = idx === selectedIndex;
									return (
										<div
											key={item.id || item.url || idx}
											onMouseEnter={() => setSelectedIndex(idx)}
											className={`group p-3 rounded-xl border transition-all duration-150 flex items-start gap-3 cursor-pointer ${
												isSelected
													? "bg-accent-soft/40 border-accent/40 shadow-xs"
													: "bg-surface border-border/60 hover:bg-surface-secondary/50 hover:border-border"
											}`}
										>
											{/* Favicon / Icon */}
											<div className="w-8 h-8 rounded-lg bg-surface border border-border/60 flex items-center justify-center shrink-0 mt-0.5 overflow-hidden shadow-xs">
												<ItemFavicon
													url={item.url}
													favicon={item.favicon}
													type={item.type}
													size="sm"
												/>
											</div>

											{/* Content */}
											<div className="flex-1 min-w-0 flex flex-col gap-1">
												{/* Title and Badges */}
												<div className="flex items-center gap-2 flex-wrap">
													<a
														href={item.url}
														target="_blank"
														rel="noreferrer"
														onClick={(e) => {
															e.stopPropagation();
															onClose();
														}}
														className="font-medium text-sm text-foreground hover:text-accent truncate max-w-md tracking-tight"
													>
														{item.name}
													</a>

													{/* Match Type Badge */}
													{item.matchType === "semantic" && (
														<span className="px-1.5 py-0.2 text-[10px] font-medium rounded-full bg-accent/15 text-accent border border-accent/20">
															🧠 {item.similarityPercent}% 语义匹配
														</span>
													)}
													{item.matchType === "hybrid" && (
														<span className="px-1.5 py-0.2 text-[10px] font-medium rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
															⚡ {item.similarityPercent}% 混合命中
														</span>
													)}
													{item.matchType === "keyword" && item.matchReason && (
														<span className="px-1.5 py-0.2 text-[10px] font-medium rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20">
															🎯 {item.matchReason}
														</span>
													)}

													{/* Folder location tag */}
													{item.folderName && (
														<span className="text-[10px] text-muted px-1.5 py-0.2 rounded bg-surface-secondary border border-border/40 truncate max-w-[140px]">
															📁 {item.folderName}
														</span>
													)}
												</div>

												{/* Summary / Description */}
												{(item.summary || item.description) && (
													<p className="text-xs text-muted line-clamp-1 leading-relaxed">
														{item.summary || item.description}
													</p>
												)}

												{/* URL and tags */}
												<div className="flex items-center justify-between gap-3 mt-1 text-[11px] text-muted min-w-0">
													{item.url && (
														<span
															className="truncate text-[10px] font-mono opacity-60 min-w-0 shrink hover:opacity-90 transition-opacity"
															title={item.url}
														>
															{item.url}
														</span>
													)}
													{item.tags && item.tags.length > 0 && (
														<div className="flex items-center gap-1.5 shrink-0 ml-auto">
															{item.tags.slice(0, 3).map((tag) => (
																<span
																	key={tag}
																	className="text-[10px] leading-tight px-1.5 py-0.5 rounded-md bg-surface-secondary text-muted/90 border border-border/40 whitespace-nowrap shrink-0"
																>
																	#{tag}
																</span>
															))}
															{item.tags.length > 3 && (
																<span className="text-[10px] text-muted/60 whitespace-nowrap shrink-0">
																	+{item.tags.length - 3}
																</span>
															)}
														</div>
													)}
												</div>
											</div>

											{/* Action Buttons */}
											<div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 self-center">
												{/* Copy URL */}
												<Tooltip>
													<Tooltip.Trigger>
														<Button
															variant="ghost"
															size="sm"
															className="h-7 w-7 p-0 rounded-lg text-muted hover:text-foreground"
															onPress={() => handleCopyUrl(item)}
															aria-label="复制链接"
														>
															📋
														</Button>
													</Tooltip.Trigger>
													<Tooltip.Content className="text-xs py-1 px-2">
														复制链接
													</Tooltip.Content>
												</Tooltip>

												{/* Jump to folder */}
												{item.folderId !== undefined && (
													<Tooltip>
														<Tooltip.Trigger>
															<Button
																variant="ghost"
																size="sm"
																className="h-7 w-7 p-0 rounded-lg text-muted hover:text-foreground"
																onPress={() => handleJumpToFolder(item)}
																aria-label="在工作台中定位"
															>
																📂
															</Button>
														</Tooltip.Trigger>
														<Tooltip.Content className="text-xs py-1 px-2">
															在工作台中定位
														</Tooltip.Content>
													</Tooltip>
												)}

												{/* Open Link */}
												{item.url && (
													<Button
														variant="secondary"
														size="sm"
														className="h-7 px-2.5 rounded-lg text-xs font-medium"
														onPress={() => {
															window.open(item.url, "_blank");
															onClose();
														}}
													>
														打开 ↗
													</Button>
												)}
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>

					{/* Modal Footer Key Hints */}
					<div className="p-3 px-4 border-t border-border bg-surface-secondary/40 flex items-center justify-between text-[11px] text-muted">
						<div className="flex items-center gap-3">
							<span className="flex items-center gap-1">
								<kbd className="px-1 py-0.2 text-[10px] font-mono bg-surface border border-border rounded">
									↑
								</kbd>
								<kbd className="px-1 py-0.2 text-[10px] font-mono bg-surface border border-border rounded">
									↓
								</kbd>
								<span>选择</span>
							</span>
							<span className="flex items-center gap-1">
								<kbd className="px-1 py-0.2 text-[10px] font-mono bg-surface border border-border rounded">
									↵
								</kbd>
								<span>打开链接</span>
							</span>
							<span className="flex items-center gap-1">
								<kbd className="px-1 py-0.2 text-[10px] font-mono bg-surface border border-border rounded">
									Esc
								</kbd>
								<span>退出</span>
							</span>
						</div>

						<span className="text-[10px] opacity-70">
							AI Workstation 混合检索内核
						</span>
					</div>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
