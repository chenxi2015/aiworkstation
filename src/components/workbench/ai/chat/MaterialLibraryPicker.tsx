import { Input, Modal } from "@heroui/react";
import {
	Check,
	Eye,
	FolderOpen,
	LibraryBig,
	Loader2,
	Paperclip,
	Play,
	Search,
	Star,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	fetchMaterialFolders,
	fetchMaterials,
} from "../../../../services/api/creatorClient";
import type { ChatContextItem } from "../../../../types/chatContext";
import { MaterialAudioModal } from "../../../creator/materials/MaterialAudioModal";
import { MaterialDocModal } from "../../../creator/materials/MaterialDocModal";
import { MaterialImageModal } from "../../../creator/materials/MaterialImageModal";
import { MaterialVideoModal } from "../../../creator/materials/MaterialVideoModal";
import {
	KIND_CONFIG,
	type MaterialKind,
	TYPE_TABS,
	type TypeTab,
} from "../../../creator/materials/types";
import {
	formatBytes,
	getAssetMediaUrl,
	getAudioAssets,
	getImageAssets,
	getMaterialKind,
	getVideoAssets,
} from "../../../creator/materials/utils";
import type { Material, MaterialFolder } from "../../../creator/types";

export interface MaterialLibraryPickerProps {
	isOpen: boolean;
	onClose: () => void;
	/** 选中单个素材后作为 material 类型 context item 附加 */
	onPick: (item: ChatContextItem) => void;
	/** 批量多选素材后附加（可选，未传时回退为循环调用 onPick） */
	onPickBatch?: (items: ChatContextItem[]) => void;
}

/** Initial page size and batch step for incremental scroll loading */
const INITIAL_PAGE_SIZE = 30;
const SCROLL_PAGE_SIZE = 30;

type PreviewState =
	| { kind: "video"; material: Material }
	| { kind: "image"; material: Material }
	| { kind: "audio"; material: Material }
	| { kind: "doc"; material: Material }
	| null;

/** Format clean brief description without system boilerplate */
function getMaterialBrief(
	m: Material,
	kind: MaterialKind,
): { text: string; isNote: boolean } {
	if (m.note?.trim()) {
		return { text: `批注：${m.note.trim()}`, isNote: true };
	}

	const raw = (m.content || "").trim();

	// Match system auto-generated boilerplate: "文件素材：xxx (size)，原位引用自：path"
	const match = raw.match(
		/^文件素材：.*?(?:\((.*?)\))?.*?(?:原位引用自：(.*?))?$/,
	);
	if (match) {
		const sizeStr = match[1]?.trim();
		const ext = m.title.split(".").pop()?.toUpperCase();
		if (kind === "image") {
			return {
				text: sizeStr
					? `${ext || "图片"} · ${sizeStr}`
					: `${ext || "图片"} 资产`,
				isNote: false,
			};
		}
		if (kind === "video") {
			return {
				text: sizeStr
					? `${ext || "视频"} 视频 · ${sizeStr}`
					: `${ext || "视频"} 素材`,
				isNote: false,
			};
		}
		if (kind === "audio") {
			return {
				text: sizeStr
					? `${ext || "音频"} 音频 · ${sizeStr}`
					: `${ext || "音频"} 素材`,
				isNote: false,
			};
		}
	}

	if (kind === "image" || kind === "video" || kind === "audio") {
		const size = formatBytes(m.assets?.[0]?.sizeBytes);
		const ext = m.title.split(".").pop()?.toUpperCase();
		const label =
			kind === "image" ? "图片" : kind === "video" ? "视频" : "音频";
		return {
			text: size ? `${ext || label} · ${size}` : `${ext || label} 资产`,
			isNote: false,
		};
	}

	if (kind === "bookmark") {
		return {
			text: raw ? raw.slice(0, 100) : "书签链接",
			isNote: false,
		};
	}

	return {
		text: raw ? raw.slice(0, 100) : "(无正文内容)",
		isNote: false,
	};
}

/** Format concise metadata line: folder, character count (docs only), and date */
function getMaterialMetaText(
	m: Material,
	kind: MaterialKind,
	folderName?: string,
): string {
	const parts: string[] = [];
	parts.push(folderName || "未归档");

	if (kind === "doc") {
		const len = (m.content || "").length;
		if (len > 0) parts.push(`${len} 字`);
	}

	const date = (m.updatedAt || m.createdAt || "").slice(0, 10);
	if (date) parts.push(date);

	return parts.join(" · ");
}

/**
 * 聊天附件的「素材库导入」对话框：从创作模块素材库中挑选已有素材附加为对话上下文。
 * 支持多选勾选、图片缩略图直接预览、精简元信息显示、滚动分页加载。
 */
export function MaterialLibraryPicker({
	isOpen,
	onClose,
	onPick,
	onPickBatch,
}: MaterialLibraryPickerProps) {
	const [materials, setMaterials] = useState<Material[]>([]);
	const [folders, setFolders] = useState<MaterialFolder[]>([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState("");
	const [folderFilter, setFolderFilter] = useState<number | "all">("all");
	const [typeTab, setTypeTab] = useState<TypeTab>("all");
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
	const [preview, setPreview] = useState<PreviewState>(null);
	const [displayLimit, setDisplayLimit] = useState(INITIAL_PAGE_SIZE);

	const sentinelRef = useRef<HTMLDivElement | null>(null);
	const listContainerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!isOpen) return;
		setQuery("");
		setFolderFilter("all");
		setTypeTab("all");
		setSelectedIds(new Set());
		setPreview(null);
		setDisplayLimit(INITIAL_PAGE_SIZE);
		setLoading(true);
		void Promise.all([fetchMaterials(), fetchMaterialFolders()])
			.then(([ms, fs]) => {
				setMaterials(ms);
				setFolders(fs);
			})
			.finally(() => setLoading(false));
	}, [isOpen]);

	// Reset pagination and scroll position when search query or filter changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset pagination when filter or query changes
	useEffect(() => {
		setDisplayLimit(INITIAL_PAGE_SIZE);
		listContainerRef.current?.scrollTo({ top: 0 });
	}, [query, folderFilter, typeTab]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return materials.filter((m) => {
			if (folderFilter !== "all" && m.folderId !== folderFilter) return false;
			if (typeTab !== "all" && getMaterialKind(m) !== typeTab) return false;
			if (!q) return true;
			return (
				m.title.toLowerCase().includes(q) ||
				(m.note ?? "").toLowerCase().includes(q) ||
				(m.content ?? "").toLowerCase().includes(q)
			);
		});
	}, [materials, query, folderFilter, typeTab]);

	const displayedMaterials = useMemo(
		() => filtered.slice(0, displayLimit),
		[filtered, displayLimit],
	);

	const hasMore = filtered.length > displayLimit;

	const loadMore = useCallback(() => {
		setDisplayLimit((prev) =>
			Math.min(prev + SCROLL_PAGE_SIZE, filtered.length),
		);
	}, [filtered.length]);

	// Auto load next batch when scrolling near bottom using IntersectionObserver
	useEffect(() => {
		const el = sentinelRef.current;
		if (!el || !hasMore) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					loadMore();
				}
			},
			{ rootMargin: "250px" },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [hasMore, loadMore]);

	// Count materials by type using single pass
	const typeCounts = useMemo(() => {
		const counts: Record<TypeTab, number> = {
			all: materials.length,
			video: 0,
			image: 0,
			audio: 0,
			doc: 0,
			bookmark: 0,
		};
		for (const m of materials) {
			const kind = getMaterialKind(m);
			if (kind in counts) {
				counts[kind]++;
			}
		}
		return counts;
	}, [materials]);

	const getTypeCount = (tabId: TypeTab) => typeCounts[tabId] ?? 0;

	const folderName = (id: number | null | undefined) =>
		folders.find((f) => f.id === id)?.name;

	const toggleSelect = useCallback((id: number) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}, []);

	const isAllFilteredSelected =
		filtered.length > 0 && filtered.every((m) => selectedIds.has(m.id));

	const toggleSelectAll = useCallback(() => {
		if (isAllFilteredSelected) {
			setSelectedIds((prev) => {
				const next = new Set(prev);
				for (const m of filtered) next.delete(m.id);
				return next;
			});
		} else {
			setSelectedIds((prev) => {
				const next = new Set(prev);
				for (const m of filtered) next.add(m.id);
				return next;
			});
		}
	}, [isAllFilteredSelected, filtered]);

	const toContextItem = (m: Material): ChatContextItem => {
		const kind = getMaterialKind(m);
		let thumbnail: string | undefined;
		if (kind === "image") {
			const imgAsset = getImageAssets(m)[0];
			if (imgAsset) {
				thumbnail = getAssetMediaUrl(imgAsset);
			}
		}
		return {
			id: `material_${m.id}`,
			type: "material",
			title: m.title,
			subtitle: folderName(m.folderId) ?? m.sourceType,
			materialId: m.id,
			thumbnail,
			data: { materialKind: kind },
		};
	};

	const handlePickSingle = (m: Material) => {
		onPick(toContextItem(m));
		onClose();
	};

	const handlePickBatch = () => {
		const picked = materials.filter((m) => selectedIds.has(m.id));
		if (picked.length === 0) return;
		const items = picked.map(toContextItem);
		if (onPickBatch) {
			onPickBatch(items);
		} else {
			for (const item of items) onPick(item);
		}
		onClose();
	};

	const handlePreview = (m: Material) => {
		const kind = getMaterialKind(m);
		if (kind === "video" && getVideoAssets(m).length > 0) {
			setPreview({ kind: "video", material: m });
			return;
		}
		if (kind === "image" && getImageAssets(m).length > 0) {
			setPreview({ kind: "image", material: m });
			return;
		}
		if (kind === "audio" && getAudioAssets(m).length > 0) {
			setPreview({ kind: "audio", material: m });
			return;
		}
		// 文档 / 书签（或无媒体附件）→ 正文预览
		setPreview({ kind: "doc", material: m });
	};

	const renderTypeTab = (tab: (typeof TYPE_TABS)[number]) => {
		const count = getTypeCount(tab.id);
		// 与素材库一致：仅全部/视频/图片/音频/文档/书签，空类型也展示便于切换
		const Icon = tab.icon;
		const active = typeTab === tab.id;
		return (
			<button
				key={tab.id}
				type="button"
				onClick={() => setTypeTab(tab.id)}
				className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1 ${
					active
						? "bg-accent text-accent-foreground"
						: "bg-surface-secondary text-muted hover:text-foreground"
				}`}
			>
				<Icon className="w-3 h-3" />
				{tab.label}（{count}）
			</button>
		);
	};

	return (
		<>
			<Modal.Backdrop
				isOpen={isOpen}
				onOpenChange={(open) => !open && onClose()}
				variant="blur"
			>
				<Modal.Container size="lg" className="w-full">
					<Modal.Dialog
						aria-label="从素材库导入"
						className="!max-w-2xl w-full max-h-[70vh] flex flex-col"
					>
						<Modal.CloseTrigger />
						<Modal.Header>
							<Modal.Heading className="flex items-center gap-2">
								<LibraryBig className="w-4 h-4 text-violet-500" />
								从素材库导入
							</Modal.Heading>
						</Modal.Header>
						<Modal.Body className="flex-1 overflow-hidden flex flex-col gap-2 mt-2">
							{/* 搜索 */}
							<div className="flex items-center gap-2 shrink-0">
								<Input
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									placeholder="搜索素材标题 / 批注 / 正文..."
									className="flex-1"
								/>
								<Search className="w-4 h-4 text-muted shrink-0 -ml-8 pointer-events-none" />
							</div>

							{/* 类型筛选（与素材库一致） */}
							<div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 pb-0.5">
								{TYPE_TABS.map(renderTypeTab)}
							</div>

							{/* 文件夹筛选 */}
							<div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 pb-0.5">
								<button
									type="button"
									onClick={() => setFolderFilter("all")}
									className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap cursor-pointer transition-colors ${
										folderFilter === "all"
											? "bg-accent text-accent-foreground"
											: "bg-surface-secondary text-muted hover:text-foreground"
									}`}
								>
									全部文件夹（{materials.length}）
								</button>
								{folders.map((f) => (
									<button
										key={f.id}
										type="button"
										onClick={() => setFolderFilter(f.id)}
										className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1 ${
											folderFilter === f.id
												? "bg-accent text-accent-foreground"
												: "bg-surface-secondary text-muted hover:text-foreground"
										}`}
									>
										<FolderOpen className="w-3 h-3" />
										{f.name}
										{typeof f.materialCount === "number" &&
											`（${f.materialCount}）`}
									</button>
								))}
							</div>

							{/* 统计与全选操作 */}
							<div className="flex items-center justify-between text-[11px] text-muted px-1 shrink-0 pt-0.5">
								<span>
									共 {filtered.length} 个素材
									{selectedIds.size > 0 && (
										<span className="text-accent font-medium ml-1.5">
											（已勾选 {selectedIds.size} 项）
										</span>
									)}
								</span>
								<div className="flex items-center gap-2.5">
									{filtered.length > 0 && (
										<button
											type="button"
											onClick={toggleSelectAll}
											className="text-muted hover:text-foreground cursor-pointer transition-colors"
										>
											{isAllFilteredSelected ? "取消全选" : "全选当前"}
										</button>
									)}
									{selectedIds.size > 0 && (
										<button
											type="button"
											onClick={() => setSelectedIds(new Set())}
											className="text-muted hover:text-foreground cursor-pointer transition-colors"
										>
											清空
										</button>
									)}
								</div>
							</div>

							{/* 素材列表 */}
							<div
								ref={listContainerRef}
								className="flex-1 overflow-y-auto -mx-1 px-1"
							>
								{loading ? (
									<div className="flex items-center justify-center py-10 text-muted">
										<Loader2 className="w-4 h-4 animate-spin mr-2" />
										<span className="text-xs">加载素材库...</span>
									</div>
								) : filtered.length === 0 ? (
									<div className="flex flex-col items-center justify-center py-10 text-muted gap-1">
										<LibraryBig className="w-6 h-6 opacity-50" />
										<span className="text-xs">
											{materials.length === 0
												? "素材库为空，可先在创作模块添加素材"
												: "没有匹配的素材"}
										</span>
									</div>
								) : (
									<div className="flex flex-col gap-1 py-0.5">
										{displayedMaterials.map((m) => {
											const kind: MaterialKind = getMaterialKind(m);
											const kindConfig = KIND_CONFIG[kind];
											const KindIcon = kindConfig.icon;
											const assetCount = m.assets?.length ?? 0;
											const isChecked = selectedIds.has(m.id);
											const hasMedia =
												getVideoAssets(m).length > 0 ||
												getImageAssets(m).length > 0 ||
												getAudioAssets(m).length > 0;
											const previewLabel =
												kind === "video"
													? "播放"
													: kind === "audio"
														? "试听"
														: "预览";
											const imageAssets = getImageAssets(m);
											const coverUrl =
												kind === "image" && imageAssets.length > 0
													? getAssetMediaUrl(imageAssets[0])
													: null;
											const briefInfo = getMaterialBrief(m, kind);
											const metaText = getMaterialMetaText(
												m,
												kind,
												folderName(m.folderId),
											);

											return (
												<div
													key={m.id}
													className={`relative flex items-center gap-2.5 text-left px-2.5 py-2 rounded-xl border transition-colors group overflow-hidden ${
														isChecked
															? "bg-accent/10 border-accent/40"
															: "border-transparent hover:bg-surface-secondary/80 hover:border-border/60"
													}`}
												>
													{/* 多选勾选框 */}
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															toggleSelect(m.id);
														}}
														className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer ${
															isChecked
																? "bg-accent border-accent text-accent-foreground"
																: "border-border/80 hover:border-accent/60 bg-surface/50"
														}`}
														title={isChecked ? "取消勾选" : "勾选此素材"}
													>
														{isChecked && (
															<Check className="w-3 h-3 stroke-[3]" />
														)}
													</button>

													{/* 缩略图或类型徽标 */}
													{kind === "image" && coverUrl ? (
														<div className="shrink-0 w-10 h-10 rounded-lg border border-border/70 overflow-hidden bg-surface-secondary/50 flex items-center justify-center relative">
															<img
																src={coverUrl}
																alt={m.title}
																loading="lazy"
																decoding="async"
																className="w-full h-full object-cover select-none"
																onError={(e) => {
																	(
																		e.currentTarget as HTMLElement
																	).style.display = "none";
																}}
															/>
															<div className="absolute inset-0 -z-10 flex items-center justify-center">
																<KindIcon
																	className={`w-4 h-4 ${kindConfig.iconClass}`}
																/>
															</div>
														</div>
													) : (
														<div
															className={`shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center ${kindConfig.badgeClass}`}
														>
															<KindIcon
																className={`w-4.5 h-4.5 ${kindConfig.iconClass}`}
															/>
														</div>
													)}

													{/* 内容文本：点击切换勾选，双击单选导入 */}
													<button
														type="button"
														onClick={() => toggleSelect(m.id)}
														onDoubleClick={() => handlePickSingle(m)}
														className="flex-1 min-w-0 text-left cursor-pointer"
													>
														<div className="flex items-center gap-1.5">
															<span
																className={`text-xs font-medium truncate transition-colors ${
																	isChecked
																		? "text-accent"
																		: "text-foreground group-hover:text-accent"
																}`}
															>
																{m.title}
															</span>
															{m.starred && (
																<Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
															)}
															{assetCount > 0 && kind !== "image" && (
																<span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] text-muted/70">
																	<Paperclip className="w-2.5 h-2.5" />
																	{assetCount}
																</span>
															)}
														</div>
														<div
															className={`text-[10px] truncate mt-0.5 ${
																briefInfo.isNote
																	? "text-amber-600 dark:text-amber-400 font-medium"
																	: "text-muted/80"
															}`}
														>
															{briefInfo.text}
														</div>
														<div className="text-[9px] text-muted/60 mt-0.5 truncate">
															{metaText}
														</div>
													</button>

													{/* 悬浮操作：预览 / 选择（快捷单选通道） */}
													<div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-opacity pl-8 py-1 rounded-r-xl z-10 bg-gradient-to-l from-surface-secondary/95 via-surface-secondary/90 to-transparent">
														{(hasMedia ||
															kind === "doc" ||
															kind === "bookmark") && (
															<button
																type="button"
																onClick={(e) => {
																	e.stopPropagation();
																	handlePreview(m);
																}}
																className="h-6 px-2 rounded-md text-[10px] flex items-center gap-1 text-muted hover:text-accent hover:bg-accent/15 cursor-pointer transition-colors bg-surface-secondary/80 border border-border/60 shadow-2xs backdrop-blur-xs"
																title={`${previewLabel}素材`}
															>
																{kind === "video" ? (
																	<Play className="w-3 h-3 text-accent fill-accent/20" />
																) : (
																	<Eye className="w-3 h-3 text-accent" />
																)}
																{previewLabel}
															</button>
														)}
														<button
															type="button"
															onClick={(e) => {
																e.stopPropagation();
																handlePickSingle(m);
															}}
															className="h-6 px-2.5 rounded-md text-[10px] font-medium bg-accent text-accent-foreground hover:bg-accent/90 cursor-pointer transition-colors shadow-2xs"
															title="快捷仅导入此项"
														>
															选择
														</button>
													</div>
												</div>
											);
										})}

										{/* 滚动加载指示器与哨兵 */}
										{hasMore && (
											<div
												ref={sentinelRef}
												className="py-3 flex items-center justify-center text-muted gap-1.5"
											>
												<Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
												<span className="text-[11px] text-muted">
													正在加载更多素材（已显示 {displayedMaterials.length} /
													共 {filtered.length} 条）...
												</span>
											</div>
										)}
										{!hasMore && filtered.length > INITIAL_PAGE_SIZE && (
											<div className="py-2.5 text-center text-[10px] text-muted/60">
												已显示全部（共 {filtered.length} 条）
											</div>
										)}
									</div>
								)}
							</div>
						</Modal.Body>
						{selectedIds.size > 0 && (
							<Modal.Footer className="flex items-center justify-between border-t border-border/60 pt-2.5 pb-1 px-1 shrink-0">
								<div className="text-xs text-muted flex items-center gap-1.5">
									<span>已选择</span>
									<span className="font-semibold text-accent">
										{selectedIds.size}
									</span>
									<span>项素材</span>
								</div>
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => setSelectedIds(new Set())}
										className="px-3 py-1.5 rounded-lg text-xs text-muted hover:text-foreground hover:bg-surface-secondary cursor-pointer transition-colors"
									>
										清空
									</button>
									<button
										type="button"
										onClick={handlePickBatch}
										className="px-4 py-1.5 rounded-lg text-xs font-medium bg-accent text-accent-foreground hover:bg-accent/90 cursor-pointer transition-colors shadow-xs flex items-center gap-1.5"
									>
										<Check className="w-3.5 h-3.5 stroke-[2.5]" />
										导入已选（{selectedIds.size}）
									</button>
								</div>
							</Modal.Footer>
						)}
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>

			{/* 预览弹窗：按素材类型分派 */}
			<MaterialVideoModal
				isOpen={preview?.kind === "video"}
				material={preview?.kind === "video" ? preview.material : null}
				onClose={() => setPreview(null)}
			/>
			<MaterialImageModal
				isOpen={preview?.kind === "image"}
				material={preview?.kind === "image" ? preview.material : null}
				materials={preview?.kind === "image" ? [preview.material] : []}
				onClose={() => setPreview(null)}
			/>
			<MaterialAudioModal
				isOpen={preview?.kind === "audio"}
				material={preview?.kind === "audio" ? preview.material : null}
				onClose={() => setPreview(null)}
			/>
			<MaterialDocModal
				isOpen={preview?.kind === "doc"}
				material={preview?.kind === "doc" ? preview.material : null}
				onClose={() => setPreview(null)}
			/>
		</>
	);
}
