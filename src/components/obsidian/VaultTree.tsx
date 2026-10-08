import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ObsidianTreeNode } from "./types";
import { FlatRow } from "./tree/VaultTreeRow";
import {
	canMoveEntry,
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
	/** Move entry (drag & drop target) */
	onMoveEntry?: (sourceRelPath: string, targetDir: string) => void;
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
	onMoveEntry,
}: VaultTreeProps) {
	const internalRef = useRef<HTMLDivElement | null>(null);

	// Drag & Drop states
	const [draggedNode, setDraggedNode] = useState<ObsidianTreeNode | null>(null);
	const [dropTargetRelPath, setDropTargetRelPath] = useState<string | null>(
		null,
	);
	const hoverExpandTimerRef = useRef<NodeJS.Timeout | null>(null);

	const clearHoverTimer = useCallback(() => {
		if (hoverExpandTimerRef.current) {
			clearTimeout(hoverExpandTimerRef.current);
			hoverExpandTimerRef.current = null;
		}
	}, []);

	const handleDragStart = useCallback(
		(e: React.DragEvent, node: ObsidianTreeNode) => {
			e.dataTransfer.setData("text/plain", node.relPath);
			e.dataTransfer.effectAllowed = "move";
			setDraggedNode(node);
		},
		[],
	);

	const handleDragOverRow = useCallback(
		(e: React.DragEvent, targetNode: ObsidianTreeNode) => {
			if (!draggedNode) return;
			// Only folders can be drop targets
			if (targetNode.kind !== "folder") return;

			const check = canMoveEntry(draggedNode, targetNode.relPath);
			if (!check.allowed) {
				e.dataTransfer.dropEffect = "none";
				return;
			}

			e.preventDefault();
			e.stopPropagation();
			e.dataTransfer.dropEffect = "move";

			if (dropTargetRelPath !== targetNode.relPath) {
				setDropTargetRelPath(targetNode.relPath);

				// Auto-expand folder if hovered for > 600ms
				clearHoverTimer();
				if (!expanded.has(targetNode.relPath)) {
					hoverExpandTimerRef.current = setTimeout(() => {
						onToggleFolder(targetNode.relPath);
					}, 600);
				}
			}
		},
		[draggedNode, dropTargetRelPath, expanded, clearHoverTimer, onToggleFolder],
	);

	const handleDragLeaveRow = useCallback(
		(e: React.DragEvent, targetNode: ObsidianTreeNode) => {
			// Check if we actually left this row rather than moving to a child
			const related = e.relatedTarget as Node | null;
			if (e.currentTarget.contains(related)) return;

			if (dropTargetRelPath === targetNode.relPath) {
				clearHoverTimer();
				setDropTargetRelPath(null);
			}
		},
		[dropTargetRelPath, clearHoverTimer],
	);

	const handleDropOnRow = useCallback(
		(e: React.DragEvent, targetNode: ObsidianTreeNode) => {
			e.preventDefault();
			e.stopPropagation();
			clearHoverTimer();
			setDropTargetRelPath(null);

			if (targetNode.kind === "folder" && draggedNode) {
				const check = canMoveEntry(draggedNode, targetNode.relPath);
				if (check.allowed) {
					onMoveEntry?.(draggedNode.relPath, targetNode.relPath);
				}
			}
			setDraggedNode(null);
		},
		[clearHoverTimer, draggedNode, onMoveEntry],
	);

	const handleDragEnd = useCallback(() => {
		clearHoverTimer();
		setDraggedNode(null);
		setDropTargetRelPath(null);
	}, [clearHoverTimer]);

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
						isDragging={draggedNode?.relPath === item.node.relPath}
						isDropTarget={dropTargetRelPath === item.node.relPath}
						draggedNodeName={draggedNode?.name ?? null}
						draggedNodeKind={draggedNode?.kind}
						onToggleFolder={onToggleFolder}
						onSelectFolder={onSelectFolder}
						onSelectNote={onSelectNote}
						onOpenMenu={onOpenMenu}
						onRenameCommit={onRenameCommit}
						onRenameCancel={onRenameCancel}
						onDragStart={handleDragStart}
						onDragOver={handleDragOverRow}
						onDragLeave={handleDragLeaveRow}
						onDrop={handleDropOnRow}
						onDragEnd={handleDragEnd}
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
							isDragging={draggedNode?.relPath === item.node.relPath}
							isDropTarget={dropTargetRelPath === item.node.relPath}
							draggedNodeName={draggedNode?.name ?? null}
							draggedNodeKind={draggedNode?.kind}
							onToggleFolder={onToggleFolder}
							onSelectFolder={onSelectFolder}
							onSelectNote={onSelectNote}
							onOpenMenu={onOpenMenu}
							onRenameCommit={onRenameCommit}
							onRenameCancel={onRenameCancel}
							onDragStart={handleDragStart}
							onDragOver={handleDragOverRow}
							onDragLeave={handleDragLeaveRow}
							onDrop={handleDropOnRow}
							onDragEnd={handleDragEnd}
						/>
					</div>
				);
			})}
		</div>
	);
});
