import { toast } from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	fetchMaterialFolders,
	fetchMaterials,
} from "../../../../../services/api/creatorClient";
import { MAX_CHAT_ATTACHMENTS } from "../../../../../types/chatContext";
import type { TypeTab } from "../../../../creator/materials/types";
import { getMaterialKind } from "../../../../creator/materials/utils";
import type { Material, MaterialFolder } from "../../../../creator/types";

export const INITIAL_PAGE_SIZE = 30;
export const SCROLL_PAGE_SIZE = 30;

export interface UseMaterialPickerOptions {
	isOpen: boolean;
	maxSelectable?: number;
}

export function useMaterialPicker({
	isOpen,
	maxSelectable = MAX_CHAT_ATTACHMENTS,
}: UseMaterialPickerOptions) {
	const [materials, setMaterials] = useState<Material[]>([]);
	const [folders, setFolders] = useState<MaterialFolder[]>([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState("");
	const [folderFilter, setFolderFilter] = useState<number | "all">("all");
	const [typeTab, setTypeTab] = useState<TypeTab>("all");
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
	const [displayLimit, setDisplayLimit] = useState(INITIAL_PAGE_SIZE);

	const sentinelRef = useRef<HTMLDivElement | null>(null);
	const listContainerRef = useRef<HTMLDivElement | null>(null);

	// Fetch data when modal opens
	useEffect(() => {
		if (!isOpen) return;
		setQuery("");
		setFolderFilter("all");
		setTypeTab("all");
		setSelectedIds(new Set());
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

	// Filter materials by folder, type, and keyword
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

	// Calculate counts by type in a single pass
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

	const folderName = useCallback(
		(id: number | null | undefined) => folders.find((f) => f.id === id)?.name,
		[folders],
	);

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
				let reachedMax = false;
				for (const m of filtered) {
					if (next.has(m.id)) continue;
					if (maxSelectable !== undefined && next.size >= maxSelectable) {
						reachedMax = true;
						break;
					}
					next.add(m.id);
				}
				if (reachedMax) {
					toast.warning(`已选满可用附件上限（${maxSelectable} 个）`);
				}
				return next;
			});
		}
	}, [isAllFilteredSelected, filtered, maxSelectable]);

	const clearSelection = useCallback(() => {
		setSelectedIds(new Set());
	}, []);

	return {
		materials,
		folders,
		loading,
		query,
		setQuery,
		folderFilter,
		setFolderFilter,
		typeTab,
		setTypeTab,
		selectedIds,
		setSelectedIds,
		displayLimit,
		displayedMaterials,
		filtered,
		hasMore,
		sentinelRef,
		listContainerRef,
		typeCounts,
		folderName,
		toggleSelect,
		toggleSelectAll,
		isAllFilteredSelected,
		clearSelection,
	};
}

