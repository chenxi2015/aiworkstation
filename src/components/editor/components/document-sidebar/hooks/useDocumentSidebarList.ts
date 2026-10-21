import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActiveFolderId } from "../../../hooks/useDocumentManager";
import type { EditorDocument } from "../../../types";

const PAGE_SIZE = 20;

export interface UseDocumentSidebarListOptions {
	documents: EditorDocument[];
	activeId: number | null;
	activeFolderId: ActiveFolderId;
	search: string;
}

export function useDocumentSidebarList({
	documents,
	activeId,
	activeFolderId,
	search,
}: UseDocumentSidebarListOptions) {
	const keyword = search.trim().toLowerCase();
	const searching = keyword.length > 0;

	// Filter documents globally by title or content text when searching, otherwise filter by active folder
	const visibleDocs = useMemo(() => {
		if (searching) {
			return documents.filter(
				(doc) =>
					doc.title.toLowerCase().includes(keyword) ||
					doc.contentText.toLowerCase().includes(keyword),
			);
		}
		if (activeFolderId === "all") return documents;
		if (activeFolderId === "unfiled")
			return documents.filter((doc) => doc.folderId == null);
		return documents.filter((doc) => doc.folderId === activeFolderId);
	}, [documents, searching, keyword, activeFolderId]);

	const pinnedDocs = useMemo(
		() => visibleDocs.filter((doc) => doc.pinned),
		[visibleDocs],
	);
	const unpinnedDocs = useMemo(
		() => visibleDocs.filter((doc) => !doc.pinned),
		[visibleDocs],
	);

	// Paginated incremental loading
	const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);

	// Reset display limit when activeFolderId or search changes, ensuring activeId is covered
	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset limit only when folder or search query changes
	useEffect(() => {
		const activeIndex = unpinnedDocs.findIndex((d) => d.id === activeId);
		const minNeeded =
			activeIndex >= 0
				? Math.ceil((activeIndex + 1) / PAGE_SIZE) * PAGE_SIZE
				: PAGE_SIZE;
		setDisplayLimit(minNeeded);
	}, [activeFolderId, keyword]);

	// Automatically expand display window to cover selected document if beyond initial page
	useEffect(() => {
		if (activeId == null) return;
		const activeIndex = unpinnedDocs.findIndex((d) => d.id === activeId);
		if (activeIndex >= 0) {
			const needed = Math.ceil((activeIndex + 1) / PAGE_SIZE) * PAGE_SIZE;
			setDisplayLimit((prev) => Math.max(prev, needed));
		}
	}, [activeId, unpinnedDocs]);

	const displayedUnpinnedDocs = useMemo(
		() => unpinnedDocs.slice(0, displayLimit),
		[unpinnedDocs, displayLimit],
	);
	const hasMore = displayedUnpinnedDocs.length < unpinnedDocs.length;

	const loadMore = useCallback(() => {
		if (!hasMore || isLoadingMore) return;
		setIsLoadingMore(true);
		setTimeout(() => {
			setDisplayLimit((prev) =>
				Math.min(prev + PAGE_SIZE, unpinnedDocs.length),
			);
			setIsLoadingMore(false);
		}, 150);
	}, [hasMore, isLoadingMore, unpinnedDocs.length]);

	// IntersectionObserver on bottom sentinel
	useEffect(() => {
		const sentinel = sentinelRef.current;
		const root = scrollContainerRef.current;
		if (!sentinel || !root || !hasMore) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					loadMore();
				}
			},
			{ root, rootMargin: "120px" },
		);

		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [hasMore, loadMore]);

	// Fallback scroll listener on container for fast scroll wheels
	const handleScroll = useCallback(
		(e: React.UIEvent<HTMLDivElement>) => {
			if (!hasMore || isLoadingMore) return;
			const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
			if (scrollTop + clientHeight >= scrollHeight - 80) {
				loadMore();
			}
		},
		[hasMore, isLoadingMore, loadMore],
	);

	return {
		keyword,
		searching,
		visibleDocs,
		pinnedDocs,
		unpinnedDocs,
		displayedUnpinnedDocs,
		hasMore,
		isLoadingMore,
		pageSize: PAGE_SIZE,
		scrollContainerRef,
		sentinelRef,
		handleScroll,
	};
}
