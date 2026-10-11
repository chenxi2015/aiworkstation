import { Modal } from "@heroui/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	Check,
	FileText,
	FolderOpen,
	Image as ImageIcon,
	Library,
	Loader2,
	Music,
	Search,
	Video,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	fetchMaterialFolders,
	fetchMediaAssetsPage,
} from "../../../services/api/creatorClient";
import { formatBytes, getAssetMediaUrl } from "../../creator/materials/utils";
import type { MaterialAsset, MaterialFolder } from "../../creator/types";
import type { MaterialToolKind } from "../toolbar/materialTools";

/** 用户最终选中的素材资产（附带所属素材标题，插入音频时用作节点标题） */
export interface PickedMaterialAsset {
	asset: MaterialAsset;
	materialTitle: string;
}

type PickerTab = Exclude<MaterialToolKind, "all">;

/** 与素材库列表一致：每页 48 条；虚拟列表保证加载再多也不堆 DOM */
const PAGE_SIZE = 48;

const PICKER_TABS: Array<{
	id: PickerTab;
	label: string;
	icon: typeof ImageIcon;
}> = [
	{ id: "image", label: "图片", icon: ImageIcon },
	{ id: "video", label: "视频", icon: Video },
	{ id: "audio", label: "音频", icon: Music },
];

export interface MaterialPickerDialogProps {
	isOpen: boolean;
	/** 打开时预选的类型 Tab（"all" = 落在第一个有内容的 Tab） */
	initialKind: MaterialToolKind;
	/** 插入中（复制资产落盘）禁用交互 */
	inserting?: boolean;
	onClose: () => void;
	onInsert: (items: PickedMaterialAsset[]) => void;
}

/**
 * 素材库选择器：创作台编辑器内从素材库挑选图片/视频/音频插入当前文档。
 * 服务端分页（listMediaAssetsPage，每页 48）+ TanStack Virtual 行虚拟化 +
 * 滚动到底自动加载下一页——千级素材不堆 DOM、不卡滚动。
 */
export function MaterialPickerDialog({
	isOpen,
	initialKind,
	inserting = false,
	onClose,
	onInsert,
}: MaterialPickerDialogProps) {
	const [folders, setFolders] = useState<MaterialFolder[]>([]);
	const [items, setItems] = useState<PickedMaterialAsset[]>([]);
	const [total, setTotal] = useState(0);
	const [counts, setCounts] = useState({ image: 0, video: 0, audio: 0 });
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const [tab, setTab] = useState<PickerTab>("image");
	const [folderFilter, setFolderFilter] = useState<number | "all">("all");
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [selected, setSelected] = useState<Map<number, PickedMaterialAsset>>(
		new Map(),
	);
	// 用户手动切过 Tab 后，不再按 initialKind 自动落 Tab
	const userPickedTabRef = useRef(false);
	const autoTabFixedRef = useRef(false);
	// 请求序号：丢弃过期的响应（快速切换 Tab/搜索时防串页）
	const requestSeqRef = useRef(0);

	const scrollRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState(0);

	// 搜索防抖（250ms）
	useEffect(() => {
		const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
		return () => clearTimeout(timer);
	}, [query]);

	// 打开时重置状态；加载文件夹（轻量）
	useEffect(() => {
		if (!isOpen) return;
		userPickedTabRef.current = false;
		autoTabFixedRef.current = initialKind !== "all";
		setSelected(new Map());
		setQuery("");
		setDebouncedQuery("");
		setFolderFilter("all");
		setItems([]);
		setTotal(0);
		setPage(1);
		if (initialKind !== "all") setTab(initialKind);
		void fetchMaterialFolders().then(setFolders);
	}, [isOpen, initialKind]);

	// 响应式列数：窄屏 3 列，桌面（max-w-4xl 弹窗）5 列小图
	useEffect(() => {
		const el = scrollRef.current;
		if (!isOpen || !el) return;
		const update = () => setContainerWidth(el.clientWidth);
		update();
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => ro.disconnect();
	}, [isOpen]);

	const lanes = containerWidth > 0 && containerWidth < 640 ? 3 : 5;

	const loadPage = useCallback(
		async (targetPage: number, append: boolean) => {
			const seq = ++requestSeqRef.current;
			if (append) setLoadingMore(true);
			else setLoading(true);
			try {
				const result = await fetchMediaAssetsPage({
					kind: tab,
					folderId: folderFilter === "all" ? null : folderFilter,
					query: debouncedQuery || undefined,
					page: targetPage,
					pageSize: PAGE_SIZE,
				});
				if (seq !== requestSeqRef.current) return; // 已过期
				setCounts(result.counts);
				setTotal(result.total);
				setPage(targetPage);
				setItems((prev) =>
					append ? [...prev, ...result.items] : result.items,
				);
				if (!append) scrollRef.current?.scrollTo({ top: 0 });
			} catch (err) {
				if (seq === requestSeqRef.current) {
					console.warn("[MaterialPickerDialog] 加载素材失败:", err);
				}
			} finally {
				if (seq === requestSeqRef.current) {
					setLoading(false);
					setLoadingMore(false);
				}
			}
		},
		[tab, folderFilter, debouncedQuery],
	);

	// 筛选条件变化 → 回到第一页重新加载
	useEffect(() => {
		if (!isOpen) return;
		void loadPage(1, false);
	}, [isOpen, loadPage]);

	// "all" 入口：首次拿到计数后落到第一个有内容的 Tab（仅打开时自动修正一次）
	useEffect(() => {
		if (!isOpen || autoTabFixedRef.current || userPickedTabRef.current) return;
		if (counts.image + counts.video + counts.audio === 0) return;
		if (counts[tab] > 0) {
			autoTabFixedRef.current = true;
			return;
		}
		const first = PICKER_TABS.find((t) => counts[t.id] > 0);
		if (first) {
			autoTabFixedRef.current = true;
			setTab(first.id);
		}
	}, [isOpen, counts, tab]);

	const hasMore = items.length < total;
	const rowCount = Math.ceil(items.length / lanes);
	// hasMore 时末尾追加一行 sentinel，滚到即触发下一页
	const virtualRowCount = rowCount + (hasMore ? 1 : 0);

	// 行高估算：缩略图 aspect-video + 卡片脚注 + 行间距
	const laneWidth =
		containerWidth > 0 ? (containerWidth - 16 - (lanes - 1) * 8) / lanes : 140;
	const rowEstimate = Math.round((laneWidth * 9) / 16 + 42 + 8);

	const virtualizer = useVirtualizer({
		count: virtualRowCount,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => rowEstimate,
		overscan: 3,
	});

	// 列数/宽度变化后清缓存重新测量
	// biome-ignore lint/correctness/useExhaustiveDependencies: 仅需在尺寸口径变化时重测
	useEffect(() => {
		virtualizer.measure();
	}, [lanes, rowEstimate, virtualizer.measure]);

	const virtualItems = virtualizer.getVirtualItems();

	// sentinel 行进入渲染窗口 → 自动加载下一页
	const lastVirtualIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;
	useEffect(() => {
		if (lastVirtualIndex >= rowCount && hasMore && !loading && !loadingMore) {
			void loadPage(page + 1, true);
		}
	}, [
		lastVirtualIndex,
		rowCount,
		hasMore,
		loading,
		loadingMore,
		loadPage,
		page,
	]);

	const toggleSelect = (item: PickedMaterialAsset) => {
		setSelected((prev) => {
			const next = new Map(prev);
			if (next.has(item.asset.id)) next.delete(item.asset.id);
			else next.set(item.asset.id, item);
			return next;
		});
	};

	const handleInsert = () => {
		if (selected.size === 0) return;
		onInsert(Array.from(selected.values()));
	};

	const renderCard = (item: PickedMaterialAsset) => {
		const isSelected = selected.has(item.asset.id);
		return (
			<button
				key={item.asset.id}
				type="button"
				onClick={() => toggleSelect(item)}
				className={`group relative flex flex-col rounded-lg border overflow-hidden text-left transition-all cursor-pointer ${
					isSelected
						? "border-accent ring-2 ring-accent/30"
						: "border-border hover:border-accent/40"
				}`}
			>
				<div className="relative aspect-video bg-muted/10 flex items-center justify-center overflow-hidden">
					{tab === "image" ? (
						<img
							src={getAssetMediaUrl(item.asset)}
							alt={item.asset.filename}
							loading="lazy"
							className="w-full h-full object-cover"
						/>
					) : tab === "video" ? (
						<video
							src={getAssetMediaUrl(item.asset)}
							muted
							preload="metadata"
							className="w-full h-full object-cover"
						>
							<track kind="captions" />
						</video>
					) : (
						<Music className="w-6 h-6 text-muted" />
					)}
					{isSelected && (
						<div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-accent text-accent-foreground flex items-center justify-center">
							<Check className="w-3 h-3" />
						</div>
					)}
				</div>
				<div className="px-1.5 py-1 bg-surface">
					<div className="text-[10px] text-foreground/85 truncate">
						{item.asset.filename}
					</div>
					<div className="text-[9px] text-muted truncate flex items-center gap-1">
						<FolderOpen className="w-2.5 h-2.5 shrink-0" />
						<span className="truncate">{item.materialTitle}</span>
						{item.asset.sizeBytes
							? ` · ${formatBytes(item.asset.sizeBytes)}`
							: ""}
					</div>
				</div>
			</button>
		);
	};

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="lg" className="w-full">
				<Modal.Dialog aria-label="从素材库插入" className="!max-w-4xl w-full">
					<Modal.CloseTrigger />
					<Modal.Header>
						<Modal.Heading className="flex items-center gap-2">
							<Library className="w-4 h-4 text-accent" />
							从素材库插入
						</Modal.Heading>
					</Modal.Header>
					<Modal.Body className="flex flex-col gap-3 mt-2">
						{/* 类型 Tab + 搜索 + 文件夹筛选 */}
						<div className="flex items-center gap-2 flex-wrap">
							<div className="flex items-center gap-1 rounded-lg bg-muted/10 p-0.5">
								{PICKER_TABS.map((t) => (
									<button
										key={t.id}
										type="button"
										onClick={() => {
											userPickedTabRef.current = true;
											setTab(t.id);
										}}
										className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
											tab === t.id
												? "bg-surface text-foreground shadow-sm font-medium"
												: "text-muted hover:text-foreground"
										}`}
									>
										<t.icon className="w-3.5 h-3.5" />
										{t.label}
										<span className="text-[10px] text-muted tabular-nums">
											{counts[t.id]}
										</span>
									</button>
								))}
							</div>
							<div className="flex items-center gap-1.5 flex-1 min-w-36 rounded-lg border border-border bg-surface px-2 py-1">
								<Search className="w-3.5 h-3.5 text-muted shrink-0" />
								<input
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									placeholder="搜索文件名 / 素材标题…"
									className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted"
								/>
							</div>
							{folders.length > 0 && (
								<select
									value={folderFilter === "all" ? "all" : String(folderFilter)}
									onChange={(e) =>
										setFolderFilter(
											e.target.value === "all" ? "all" : Number(e.target.value),
										)
									}
									className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground/80 outline-none cursor-pointer"
								>
									<option value="all">全部文件夹</option>
									{folders.map((f) => (
										<option key={f.id} value={String(f.id)}>
											{f.name}
										</option>
									))}
								</select>
							)}
						</div>

						{/* 资产网格（虚拟滚动 + 无限加载） */}
						<div
							ref={scrollRef}
							className="min-h-48 max-h-[50vh] overflow-y-auto rounded-lg border border-border/60 bg-muted/5 p-2"
						>
							{loading ? (
								<div className="h-48 flex items-center justify-center gap-2 text-xs text-muted">
									<Loader2 className="w-4 h-4 animate-spin" />
									正在加载素材库…
								</div>
							) : items.length === 0 ? (
								<div className="h-48 flex flex-col items-center justify-center gap-2 text-muted">
									<FileText className="w-6 h-6 opacity-40" />
									<p className="text-xs">
										{counts.image + counts.video + counts.audio === 0
											? "素材库还没有媒体素材，先去素材库 Tab 导入"
											: "当前筛选下没有匹配的素材"}
									</p>
								</div>
							) : (
								<div
									style={{
										height: virtualizer.getTotalSize(),
										position: "relative",
									}}
								>
									{virtualItems.map((vRow) => {
										const isSentinel = vRow.index >= rowCount;
										return (
											<div
												key={isSentinel ? "sentinel" : vRow.key}
												data-index={vRow.index}
												ref={virtualizer.measureElement}
												style={{
													position: "absolute",
													top: 0,
													left: 0,
													width: "100%",
													transform: `translateY(${vRow.start}px)`,
												}}
											>
												{isSentinel ? (
													<div className="flex items-center justify-center gap-1.5 py-2 text-[11px] text-muted">
														{loadingMore && (
															<Loader2 className="w-3 h-3 animate-spin" />
														)}
														加载更多（剩余 {total - items.length}）…
													</div>
												) : (
													<div
														className="grid gap-2 pb-2"
														style={{
															gridTemplateColumns: `repeat(${lanes}, minmax(0, 1fr))`,
														}}
													>
														{items
															.slice(
																vRow.index * lanes,
																vRow.index * lanes + lanes,
															)
															.map(renderCard)}
													</div>
												)}
											</div>
										);
									})}
								</div>
							)}
						</div>

						{/* 底部动作 */}
						<div className="flex items-center justify-between pt-1">
							<span className="text-[11px] text-muted">
								{selected.size > 0
									? `已选 ${selected.size} 项，插入时将复制到当前文档`
									: "点击卡片选择素材，可多选"}
							</span>
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={onClose}
									disabled={inserting}
									className="px-3 py-1.5 rounded-lg text-xs text-muted hover:text-foreground hover:bg-muted/10 transition-colors cursor-pointer disabled:opacity-50"
								>
									取消
								</button>
								<button
									type="button"
									onClick={handleInsert}
									disabled={selected.size === 0 || inserting}
									className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-accent text-accent-foreground font-medium hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
								>
									{inserting && <Loader2 className="w-3 h-3 animate-spin" />}
									插入{selected.size > 0 ? ` ${selected.size} 项` : ""}
								</button>
							</div>
						</div>
					</Modal.Body>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
