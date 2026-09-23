import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useEffect, useMemo, useRef } from "react";
import type { ObsidianTreeNode } from "./types";
import { FlatRow } from "./tree/VaultTreeRow";
import {
	collectFolderPaths,
	filterVaultTree,
	flattenVaultTree,
	type FlatTreeNode,
} from "./tree/vaultTreeUtils";

export {
	collectFolderPaths,
	filterVaultTree,
	flattenVaultTree,
	type FlatTreeNode,
};

export interface VaultTreeProps {
	nodes: ObsidianTreeNode[];
	scrollElement?: HTMLDivElement | null;
	scrollRef?: React.RefObject<HTMLDivElement | null>;
	selectedNotePath: string | null;
	currentDir: string;
	expanded: Set<string>;
	/** Currently renaming entry relative path (auto-focuses after creation) */
	renamingPath?: string | null;
	autoReveal?: boolean;
	onToggleFolder: (relPath: string) => void;
	onSelectFolder: (relPath: string) => void;
	onSelectNote: (relPath: string) => void;
	/** Open entry context/action menu at clientX/Y coordinates */
	onOpenMenu: (node: ObsidianTreeNode, x: number, y: number) => void;
	/** Inline rename commit (newName excludes .md suffix for notes) */
	onRenameCommit: (relPath: string, newName: string, isFolder: boolean) => void;
	onRenameCancel: () => void;
}

/**
 * Vault directory tree with virtual list rendering.
 * Only visible DOM elements are mounted during deep vault traversal.
 */
export const VaultTree = memo(function VaultTree({
	nodes,
	scrollElement,
	scrollRef,
	selectedNotePath,
	currentDir,
	expanded,
	renamingPath,
	autoReveal,
	onToggleFolder,
	onSelectFolder,
	onSelectNote,
	onOpenMenu,
	onRenameCommit,
	onRenameCancel,
}: VaultTreeProps) {
	const internalRef = useRef<HTMLDivElement | null>(null);

	const flatNodes = useMemo(
		() => flattenVaultTree(nodes, expanded),
		[nodes, expanded],
	);

	const rowVirtualizer = useVirtualizer({
		count: flatNodes.length,
		getScrollElement: () =>
			scrollElement ?? scrollRef?.current ?? internalRef.current,
		estimateSize: () => 28,
		overscan: 10,
		getItemKey: (index) => flatNodes[index]?.node.relPath ?? index,
	});

	const prevSelectedNotePathRef = useRef<string | null>(null);
	const prevAutoRevealRef = useRef(autoReveal);
	const pendingRevealRef = useRef<string | null>(null);

	// Record pending reveal target only when note selection changes or autoReveal is toggled on
	useEffect(() => {
		if (!autoReveal || !selectedNotePath) {
			pendingRevealRef.current = null;
			prevSelectedNotePathRef.current = selectedNotePath;
			prevAutoRevealRef.current = autoReveal;
			return;
		}

		const noteChanged = selectedNotePath !== prevSelectedNotePathRef.current;
		const autoRevealTurnedOn = !prevAutoRevealRef.current && autoReveal;

		if (noteChanged || autoRevealTurnedOn) {
			prevSelectedNotePathRef.current = selectedNotePath;
			prevAutoRevealRef.current = autoReveal;
			pendingRevealRef.current = selectedNotePath;
		}
	}, [autoReveal, selectedNotePath]);

	// Auto-reveal: scroll virtual row into view only once per note switch / autoReveal trigger
	useEffect(() => {
		if (!pendingRevealRef.current || !autoReveal) return;
		// Do not disrupt user view when renaming is active
		if (renamingPath) return;

		const target = pendingRevealRef.current;
		const index = flatNodes.findIndex(
			(item) => !item.isFolder && item.node.relPath === target,
		);
		if (index !== -1) {
			rowVirtualizer.scrollToIndex(index, { align: "auto" });
			pendingRevealRef.current = null;
		}
	}, [autoReveal, flatNodes, renamingPath, rowVirtualizer]);

	const virtualRows = rowVirtualizer.getVirtualItems();
	// Initial frame fallback: if virtualizer hasn't measured yet but nodes exist, render directly
	const shouldFallback = virtualRows.length === 0 && flatNodes.length > 0;

	if (shouldFallback) {
		return (
			<div ref={internalRef} className="w-full">
				{flatNodes.map((item) => (
					<FlatRow
						key={item.node.relPath}
						item={item}
						isCurrent={item.isFolder && currentDir === item.node.relPath}
						isSelected={
							!item.isFolder && selectedNotePath === item.node.relPath
						}
						isRenaming={renamingPath === item.node.relPath}
						onToggleFolder={onToggleFolder}
						onSelectFolder={onSelectFolder}
						onSelectNote={onSelectNote}
						onOpenMenu={onOpenMenu}
						onRenameCommit={onRenameCommit}
						onRenameCancel={onRenameCancel}
					/>
				))}
			</div>
		);
	}

	return (
		<div
			ref={scrollElement ? undefined : scrollRef ? undefined : internalRef}
			style={{
				height: `${rowVirtualizer.getTotalSize()}px`,
				width: "100%",
				position: "relative",
			}}
		>
			{virtualRows.map((virtualRow) => {
				const item = flatNodes[virtualRow.index];
				if (!item) return null;

				return (
					<div
						key={item.node.relPath}
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							width: "100%",
							height: `${virtualRow.size}px`,
							transform: `translateY(${virtualRow.start}px)`,
						}}
					>
						<FlatRow
							item={item}
							isCurrent={item.isFolder && currentDir === item.node.relPath}
							isSelected={
								!item.isFolder && selectedNotePath === item.node.relPath
							}
							isRenaming={renamingPath === item.node.relPath}
							onToggleFolder={onToggleFolder}
							onSelectFolder={onSelectFolder}
							onSelectNote={onSelectNote}
							onOpenMenu={onOpenMenu}
							onRenameCommit={onRenameCommit}
							onRenameCancel={onRenameCancel}
						/>
					</div>
				);
			})}
		</div>
	);
});
