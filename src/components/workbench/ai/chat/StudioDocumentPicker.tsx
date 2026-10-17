import { Input, Modal, toast } from "@heroui/react";
import {
	Archive,
	Check,
	FileText,
	FolderOpen,
	Loader2,
	PenSquare,
	Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	fetchArchivedDocuments,
	fetchDocumentFolders,
	fetchDocuments,
} from "../../../../services/api/editorClient";
import {
	type ChatContextItem,
	MAX_CHAT_ATTACHMENTS,
} from "../../../../types/chatContext";
import type { EditorDocFolder, EditorDocument } from "../../../editor/types";

export interface StudioDocumentPickerProps {
	isOpen: boolean;
	onClose: () => void;
	/** Select single document and attach as context item */
	onPick: (item: ChatContextItem) => void;
	/** Batch select multiple documents */
	onPickBatch?: (items: ChatContextItem[]) => void;
	/** Maximum selectable count based on remaining quota */
	maxSelectable?: number;
}

const INITIAL_PAGE_SIZE = 30;
const SCROLL_PAGE_SIZE = 30;

function formatDocMeta(
	doc: EditorDocument,
	folderName?: string,
): {
	folderText?: string;
	countText: string;
	dateText: string;
} {
	const charCount = (doc.contentText || "").length;
	const countText = charCount > 0 ? `${charCount} 字` : "空文档";
	const dateText = (doc.updatedAt || doc.createdAt || "").slice(0, 10);
	return {
		folderText: folderName,
		countText,
		dateText,
	};
}

/**
 * Dialog for selecting documents from Studio / Editor into chat context attachments.
 */
export function StudioDocumentPicker({
	isOpen,
	onClose,
	onPick,
	onPickBatch,
	maxSelectable = MAX_CHAT_ATTACHMENTS,
}: StudioDocumentPickerProps) {
	const [documents, setDocuments] = useState<EditorDocument[]>([]);
	const [folders, setFolders] = useState<EditorDocFolder[]>([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState("");
	const [folderFilter, setFolderFilter] = useState<
		number | "all" | "unorganized"
	>("all");
	const [statusFilter, setStatusFilter] = useState<
		"all" | "editing" | "archived"
	>("all");
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
	const [displayLimit, setDisplayLimit] = useState(INITIAL_PAGE_SIZE);

	const sentinelRef = useRef<HTMLDivElement | null>(null);
	const listContainerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!isOpen) return;
		setQuery("");
		setFolderFilter("all");
		setStatusFilter("all");
		setSelectedIds(new Set());
		setDisplayLimit(INITIAL_PAGE_SIZE);
		setLoading(true);

		void Promise.all([
			fetchDocuments(),
			fetchArchivedDocuments(),
			fetchDocumentFolders(),
		])
			.then(([activeDocs, archivedDocs, fs]) => {
				const merged = [...(activeDocs ?? []), ...(archivedDocs ?? [])];
				// Sort by updatedAt descending
				merged.sort((a, b) =>
					(b.updatedAt || "").localeCompare(a.updatedAt || ""),
				);
				setDocuments(merged);
				setFolders(fs ?? []);
			})
			.finally(() => setLoading(false));
	}, [isOpen]);

	// Reset pagination on filter or query changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset pagination on filter or query changes
	useEffect(() => {
		setDisplayLimit(INITIAL_PAGE_SIZE);
		listContainerRef.current?.scrollTo({ top: 0 });
	}, [query, folderFilter, statusFilter]);

	const folderNameMap = useMemo(() => {
		const map = new Map<number, string>();
		for (const f of folders) {
			map.set(f.id, f.name);
		}
		return map;
	}, [folders]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return documents.filter((doc) => {
			if (statusFilter !== "all" && doc.status !== statusFilter) return false;
			if (folderFilter === "unorganized" && doc.folderId != null) return false;
			if (
				folderFilter !== "all" &&
				folderFilter !== "unorganized" &&
				doc.folderId !== folderFilter
			) {
				return false;
			}
			if (!q) return true;
			return (
				(doc.title || "").toLowerCase().includes(q) ||
				(doc.contentText || "").toLowerCase().includes(q)
			);
		});
	}, [documents, query, folderFilter, statusFilter]);

	const displayedDocs = useMemo(
		() => filtered.slice(0, displayLimit),
		[filtered, displayLimit],
	);

	const hasMore = filtered.length > displayLimit;

	const loadMore = useCallback(() => {
		setDisplayLimit((prev) =>
			Math.min(prev + SCROLL_PAGE_SIZE, filtered.length),
		);
	}, [filtered.length]);

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

	const toggleSelect = useCallback(
		(id: number) => {
			setSelectedIds((prev) => {
				const next = new Set(prev);
				if (next.has(id)) {
					next.delete(id);
				} else {
					if (maxSelectable !== undefined && next.size >= maxSelectable) {
						toast.warning(
							`最多还能选择 ${maxSelectable} 个附件（上限 ${MAX_CHAT_ATTACHMENTS} 个）`,
						);
						return prev;
					}
					next.add(id);
				}
				return next;
			});
		},
		[maxSelectable],
	);

	const isAllFilteredSelected =
		filtered.length > 0 && filtered.every((d) => selectedIds.has(d.id));

	const toggleSelectAll = useCallback(() => {
		if (isAllFilteredSelected) {
			setSelectedIds((prev) => {
				const next = new Set(prev);
				for (const d of filtered) next.delete(d.id);
				return next;
			});
		} else {
			setSelectedIds((prev) => {
				const next = new Set(prev);
				let reachedMax = false;
				for (const d of filtered) {
					if (next.has(d.id)) continue;
					if (maxSelectable !== undefined && next.size >= maxSelectable) {
						reachedMax = true;
						break;
					}
					next.add(d.id);
				}
				if (reachedMax) {
					toast.warning(`已选满可用附件上限（${maxSelectable} 篇）`);
				}
				return next;
			});
		}
	}, [isAllFilteredSelected, filtered, maxSelectable]);

	const toContextItem = (doc: EditorDocument): ChatContextItem => {
		const folderName = doc.folderId
			? folderNameMap.get(doc.folderId)
			: undefined;
		const meta = formatDocMeta(doc, folderName);
		const subtitleParts = [
			meta.folderText || (doc.status === "archived" ? "已归档" : "创作台"),
			meta.countText,
		];
		return {
			id: `document_${doc.id}`,
			type: "document",
			title: doc.title || "未命名文档",
			subtitle: subtitleParts.join(" · "),
			documentId: doc.id,
			data: {
				contentPreview: doc.contentText?.slice(0, 3000) ?? "",
			},
		};
	};

	const handlePickSingle = (doc: EditorDocument) => {
		if (maxSelectable !== undefined && maxSelectable <= 0) {
			toast.warning(
				`最多只能添加 ${MAX_CHAT_ATTACHMENTS} 个附件，请先移除已有附件`,
			);
			return;
		}
		onPick(toContextItem(doc));
		onClose();
	};

	const handlePickBatch = () => {
		const picked = documents.filter((d) => selectedIds.has(d.id));
		if (picked.length === 0) return;
		const safePicked =
			maxSelectable !== undefined && picked.length > maxSelectable
				? picked.slice(0, maxSelectable)
				: picked;
		const items = safePicked.map(toContextItem);
		if (onPickBatch) {
			onPickBatch(items);
		} else {
			for (const item of items) onPick(item);
		}
		onClose();
	};

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="lg" className="w-full">
				<Modal.Dialog
					aria-label="从创作台导入"
					className="!max-w-2xl w-full max-h-[70vh] flex flex-col"
				>
					<Modal.CloseTrigger />
					<Modal.Header>
						<Modal.Heading className="flex items-center gap-2">
							<PenSquare className="w-4 h-4 text-amber-500" />
							从创作台导入
						</Modal.Heading>
					</Modal.Header>
					<Modal.Body className="flex-1 overflow-hidden flex flex-col gap-2 mt-2">
						{/* Upper Limit Warning Banner */}
						{maxSelectable <= 0 && (
							<div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between shrink-0">
								<span>当前附件已达上限（{MAX_CHAT_ATTACHMENTS} 个），请先在对话框中移除部分附件</span>
							</div>
						)}

						{/* Search Bar */}
						<div className="flex items-center gap-2 shrink-0">
							<Input
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="搜索创作文档标题 / 正文内容..."
								className="flex-1"
							/>
							<Search className="w-4 h-4 text-muted shrink-0 -ml-8 pointer-events-none" />
						</div>

						{/* Status Filters */}
						<div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 pb-0.5">
							<button
								type="button"
								onClick={() => setStatusFilter("all")}
								className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1 ${
									statusFilter === "all"
										? "bg-accent text-accent-foreground"
										: "bg-surface-secondary text-muted hover:text-foreground"
								}`}
							>
								全部文档（{documents.length}）
							</button>
							<button
								type="button"
								onClick={() => setStatusFilter("editing")}
								className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1 ${
									statusFilter === "editing"
										? "bg-accent text-accent-foreground"
										: "bg-surface-secondary text-muted hover:text-foreground"
								}`}
							>
								<PenSquare className="w-3 h-3" />
								创作中（
								{documents.filter((d) => d.status !== "archived").length}）
							</button>
							<button
								type="button"
								onClick={() => setStatusFilter("archived")}
								className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1 ${
									statusFilter === "archived"
										? "bg-accent text-accent-foreground"
										: "bg-surface-secondary text-muted hover:text-foreground"
								}`}
							>
								<Archive className="w-3 h-3" />
								已归档（
								{documents.filter((d) => d.status === "archived").length}）
							</button>
						</div>

						{/* Folder Filters */}
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
								全部文件夹
							</button>
							<button
								type="button"
								onClick={() => setFolderFilter("unorganized")}
								className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap cursor-pointer transition-colors ${
									folderFilter === "unorganized"
										? "bg-accent text-accent-foreground"
										: "bg-surface-secondary text-muted hover:text-foreground"
								}`}
							>
								未归档文件夹
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
								</button>
							))}
						</div>

						{/* Counter & Select All */}
						<div className="flex items-center justify-between text-[11px] text-muted px-1 shrink-0 pt-0.5">
							<span>
								共 {filtered.length} 篇文档
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

						{/* Document List */}
						<div
							ref={listContainerRef}
							className="flex-1 overflow-y-auto -mx-1 px-1"
						>
							{loading ? (
								<div className="flex items-center justify-center py-10 text-muted">
									<Loader2 className="w-4 h-4 animate-spin mr-2" />
									<span className="text-xs">加载创作台文档...</span>
								</div>
							) : filtered.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-10 text-muted gap-1">
									<PenSquare className="w-6 h-6 opacity-50" />
									<span className="text-xs">
										{documents.length === 0
											? "暂无创作台文档，可在创作台新建"
											: "没有匹配的文档"}
									</span>
								</div>
							) : (
								<div className="flex flex-col gap-1 py-0.5">
									{displayedDocs.map((doc) => {
										const isChecked = selectedIds.has(doc.id);
										const folderName = doc.folderId
											? folderNameMap.get(doc.folderId)
											: undefined;
										const meta = formatDocMeta(doc, folderName);

										return (
											<div
												key={doc.id}
												className={`relative flex items-center gap-2.5 text-left px-2.5 py-1.5 rounded-xl border transition-colors group overflow-hidden ${
													isChecked
														? "bg-accent/10 border-accent/40"
														: "border-transparent hover:bg-surface-secondary/80 hover:border-border/60"
												}`}
											>
												{/* Checkbox */}
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														toggleSelect(doc.id);
													}}
													className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer ${
														isChecked
															? "bg-accent border-accent text-accent-foreground"
															: "border-border/80 hover:border-accent/60 bg-surface/50"
													}`}
													title={isChecked ? "取消勾选" : "勾选此文档"}
												>
													{isChecked && (
														<Check className="w-3 h-3 stroke-[3]" />
													)}
												</button>

												{/* Icon badge */}
												<div className="shrink-0 w-7 h-7 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
													<FileText className="w-3.5 h-3.5" />
												</div>

												{/* Text Info */}
												<button
													type="button"
													onClick={() => toggleSelect(doc.id)}
													onDoubleClick={() => handlePickSingle(doc)}
													className="flex-1 min-w-0 text-left cursor-pointer py-0.5"
												>
													<div className="flex items-center gap-1.5">
														<span
															className={`text-xs font-medium truncate transition-colors ${
																isChecked
																	? "text-accent"
																	: "text-foreground group-hover:text-accent"
															}`}
														>
															{doc.title || "未命名文档"}
														</span>
														{doc.status === "archived" && (
															<span className="shrink-0 text-[9px] px-1.5 py-0.2 rounded bg-zinc-500/15 text-zinc-500 font-medium">
																已归档
															</span>
														)}
													</div>
													<div className="flex items-center gap-1.5 text-[10px] text-muted/70 mt-0.5 truncate">
														{meta.folderText && (
															<span className="px-1.5 py-0.2 rounded-full bg-accent/10 text-accent font-medium text-[9px]">
																{meta.folderText}
															</span>
														)}
														<span>{meta.countText}</span>
														{meta.dateText && (
															<>
																<span>·</span>
																<span>{meta.dateText}</span>
															</>
														)}
													</div>
												</button>

												{/* Hover action button */}
												<div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-opacity pl-8 py-1 rounded-r-xl z-10 bg-gradient-to-l from-surface-secondary/95 via-surface-secondary/90 to-transparent">
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															handlePickSingle(doc);
														}}
														className="h-6 px-2.5 rounded-md text-[10px] font-medium bg-accent text-accent-foreground hover:bg-accent/90 cursor-pointer transition-colors shadow-2xs"
														title="快捷仅导入此篇"
													>
														选择
													</button>
												</div>
											</div>
										);
									})}

									{/* Scroll Loading Indicator */}
									{hasMore && (
										<div
											ref={sentinelRef}
											className="py-3 flex items-center justify-center text-muted gap-1.5"
										>
											<Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
											<span className="text-[11px] text-muted">
												正在加载更多文档...
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
								<span>篇文档</span>
								{maxSelectable !== undefined && (
									<span className="text-[11px] text-muted/70">
										（最多可选 {maxSelectable} 篇）
									</span>
								)}
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
	);
}
