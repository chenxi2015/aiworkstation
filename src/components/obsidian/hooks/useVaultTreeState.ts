import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchObsidianTree } from "../../../services/api/obsidianClient";
import type { ObsidianTree } from "../types";
import { collectFolderPaths, filterVaultTree } from "../VaultTree";

const AUTO_REVEAL_STORAGE_KEY = "obsidian_auto_reveal";

export interface UseVaultTreeStateOptions {
	selectedNotePath: string | null;
}

/**
 * Manages Obsidian vault tree fetching, search debouncing, folder expansions, and auto-reveal.
 */
export function useVaultTreeState({ selectedNotePath }: UseVaultTreeStateOptions) {
	const [treeData, setTreeData] = useState<ObsidianTree | null>(null);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const [currentDir, setCurrentDir] = useState("");
	const [expanded, setExpanded] = useState<Set<string>>(new Set());

	// Auto-reveal: auto expand ancestor folders and scroll into view when note changes
	const [autoReveal, setAutoReveal] = useState(
		() =>
			typeof window === "undefined" ||
			window.localStorage.getItem(AUTO_REVEAL_STORAGE_KEY) !== "0",
	);

	const handleToggleAutoReveal = useCallback(() => {
		setAutoReveal((prev) => {
			const next = !prev;
			try {
				window.localStorage.setItem(AUTO_REVEAL_STORAGE_KEY, next ? "1" : "0");
			} catch {
				// Ignore localStorage errors
			}
			return next;
		});
	}, []);

	const load = useCallback(async (force: boolean) => {
		if (force) setRefreshing(true);
		try {
			const data = await fetchObsidianTree(force);
			setTreeData(data);
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		load(false);
	}, [load]);

	const handleQueryChange = useCallback((value: string) => {
		setQuery(value);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => setDebouncedQuery(value), 300);
	}, []);

	const filteredTree = useMemo(
		() => (treeData ? filterVaultTree(treeData.tree, debouncedQuery) : []),
		[treeData, debouncedQuery],
	);

	// Cache all folder paths independently of query (only recompute on tree change)
	const allFolderPaths = useMemo(
		() => (treeData ? collectFolderPaths(treeData.tree) : []),
		[treeData],
	);

	// Force-expand all folders during search so hits are visible
	const effectiveExpanded = useMemo(() => {
		if (!debouncedQuery.trim()) return expanded;
		return new Set([...expanded, ...allFolderPaths]);
	}, [debouncedQuery, allFolderPaths, expanded]);

	const toggleFolder = useCallback((relPath: string) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(relPath)) {
				next.delete(relPath);
			} else {
				next.add(relPath);
			}
			return next;
		});
	}, []);

	/** Expand a folder and all its ancestor folders */
	const expandDirChain = useCallback((dir: string) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			let cur = dir;
			while (cur) {
				next.add(cur);
				const idx = cur.lastIndexOf("/");
				cur = idx > 0 ? cur.slice(0, idx) : "";
			}
			return next;
		});
	}, []);

	/** Toggle expand all / collapse all folders */
	const handleToggleExpandAll = useCallback(() => {
		setExpanded((prev) =>
			prev.size > 0 ? new Set() : new Set(allFolderPaths),
		);
	}, [allFolderPaths]);

	/** Breadcrumb selects folder: highlight in tree and expand ancestors */
	const handleSelectFolder = useCallback(
		(dir: string) => {
			setCurrentDir(dir);
			expandDirChain(dir);
		},
		[expandDirChain],
	);

	// Auto-reveal effect
	useEffect(() => {
		if (!autoReveal || !selectedNotePath) return;
		const parent = selectedNotePath.includes("/")
			? selectedNotePath.split("/").slice(0, -1).join("/")
			: "";
		expandDirChain(parent);

		const timer = setTimeout(() => {
			document
				.querySelector(`[data-reveal-path="${CSS.escape(selectedNotePath)}"]`)
				?.scrollIntoView({ block: "nearest" });
		}, 50);
		return () => clearTimeout(timer);
	}, [autoReveal, selectedNotePath, expandDirChain]);

	const resetTreeSelection = useCallback(() => {
		setCurrentDir("");
		setExpanded(new Set());
	}, []);

	return {
		treeData,
		loading,
		refreshing,
		load,
		query,
		handleQueryChange,
		currentDir,
		setCurrentDir,
		expanded,
		setExpanded,
		effectiveExpanded,
		toggleFolder,
		expandDirChain,
		handleToggleExpandAll,
		handleSelectFolder,
		resetTreeSelection,
		filteredTree,
		allFolderPaths,
		autoReveal,
		handleToggleAutoReveal,
	};
}
