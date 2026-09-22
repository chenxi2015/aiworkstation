import {
	applyEdgeChanges,
	applyNodeChanges,
	type Edge,
	type EdgeChange,
	type Node,
	type NodeChange,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanvasCardFlowNode } from "./CanvasFlowNodes";
import {
	type AlignmentType,
	applyAlignment,
	getNodeDimensions,
	getNodesBoundingBox,
} from "./canvasAlignment";
import {
	type FlowBuildOptions,
	genId,
	parseCanvas,
	serializeCanvas,
	toFlowEdge,
	toFlowNodes,
} from "./canvasSerializer";
import type { CanvasNode } from "./canvasUtils";
import { useCanvasHistory } from "./useCanvasHistory";

export interface UseCanvasGraphOptions {
	content: string;
	onChange?: (json: string) => void;
	onNavigateNote?: (relPath: string) => void;
	readOnly?: boolean;
}

/**
 * Hook for managing the canvas graph state, node interactions, and JSON synchronization
 */
export function useCanvasGraph({
	content,
	onChange,
	onNavigateNote,
	readOnly = false,
}: UseCanvasGraphOptions) {
	const parsed = useMemo(() => parseCanvas(content), [content]);

	const [editingId, setEditingId] = useState<string | null>(null);

	// Direct mutable ref to current nodes/edges to avoid stale closures in callbacks
	const nodesRef = useRef<Node[]>([]);
	const edgesRef = useRef<Edge[]>([]);

	// Cache of group children during active drag to eliminate O(N*M) geometry checks per frame
	const groupChildIdsCacheRef = useRef<Map<string, string[]>>(new Map());

	// Forward declaration for buildOptions used during restore
	const buildOptionsRef = useRef<FlowBuildOptions | null>(null);

	const restoreFromJson = useCallback((json: string) => {
		const next = parseCanvas(json);
		if (next.data && buildOptionsRef.current) {
			const restoredNodes = toFlowNodes(
				next.data.nodes,
				buildOptionsRef.current,
			);
			const byId = new Map(next.data.nodes.map((node) => [node.id, node]));
			const restoredEdges = next.data.edges
				.map((edge) => toFlowEdge(edge, byId))
				.filter((edge): edge is Edge => edge !== null);

			setNodes(restoredNodes);
			setEdges(restoredEdges);
		}
	}, []);

	// Undo / Redo history management
	const {
		lastEmittedRef,
		initHistory,
		pushSnapshot,
		undo,
		redo,
		canUndo,
		canRedo,
	} = useCanvasHistory({
		readOnly,
		onRestore: restoreFromJson,
		onChange,
	});

	const emit = useCallback(
		(nextNodes: Node[], nextEdges: Edge[]) => {
			if (readOnly) return;
			const json = serializeCanvas(nextNodes, nextEdges);
			pushSnapshot(json);
		},
		[readOnly, pushSnapshot],
	);
	const emitRef = useRef(emit);
	emitRef.current = emit;

	// Commit updated text for text card
	const commitText = useCallback((id: string, text: string) => {
		setEditingId(null);
		const next = nodesRef.current.map((node) =>
			node.id === id && node.type === "canvasCard"
				? {
						...node,
						data: {
							...node.data,
							editing: false,
							canvasNode: {
								...(node.data as { canvasNode: CanvasNode }).canvasNode,
								text,
							},
						},
					}
				: node,
		);
		setNodes(next);
		emitRef.current(next, edgesRef.current);
	}, []);

	// Commit updated label for group
	const commitLabel = useCallback((id: string, label: string) => {
		setEditingId(null);
		const next = nodesRef.current.map((node) =>
			node.id === id && node.type === "canvasGroup"
				? { ...node, data: { ...node.data, editing: false, label } }
				: node,
		);
		setNodes(next);
		emitRef.current(next, edgesRef.current);
	}, []);

	// Delete a node and all connected edges
	const deleteNode = useCallback((id: string) => {
		const nextNodes = nodesRef.current.filter((node) => node.id !== id);
		const nextEdges = edgesRef.current.filter(
			(edge) => edge.source !== id && edge.target !== id,
		);
		setNodes(nextNodes);
		setEdges(nextEdges);
		emitRef.current(nextNodes, nextEdges);
	}, []);

	// Set or clear node color
	const setNodeColor = useCallback((id: string, color: string | undefined) => {
		const next = nodesRef.current.map((node) => {
			if (node.id !== id) return node;
			if (node.type === "canvasGroup") {
				return { ...node, data: { ...node.data, color } };
			}
			const { canvasNode } = node.data as { canvasNode: CanvasNode };
			const nextCanvasNode = { ...canvasNode };
			if (color) {
				nextCanvasNode.color = color;
			} else {
				delete nextCanvasNode.color;
			}
			return { ...node, data: { ...node.data, canvasNode: nextCanvasNode } };
		});
		setNodes(next);
		emitRef.current(next, edgesRef.current);
	}, []);

	// Batch delete multiple nodes and their connected edges
	const batchDeleteNodes = useCallback((ids: string[]) => {
		if (ids.length === 0) return;
		const idSet = new Set(ids);
		const nextNodes = nodesRef.current.filter((node) => !idSet.has(node.id));
		const nextEdges = edgesRef.current.filter(
			(edge) => !idSet.has(edge.source) && !idSet.has(edge.target),
		);
		setNodes(nextNodes);
		setEdges(nextEdges);
		emitRef.current(nextNodes, nextEdges);
	}, []);

	// Batch set color for multiple nodes
	const batchSetNodeColor = useCallback(
		(ids: string[], color: string | undefined) => {
			if (ids.length === 0) return;
			const idSet = new Set(ids);
			const next = nodesRef.current.map((node) => {
				if (!idSet.has(node.id)) return node;
				if (node.type === "canvasGroup") {
					return { ...node, data: { ...node.data, color } };
				}
				const { canvasNode } = node.data as { canvasNode: CanvasNode };
				const nextCanvasNode = { ...canvasNode };
				if (color) {
					nextCanvasNode.color = color;
				} else {
					delete nextCanvasNode.color;
				}
				return { ...node, data: { ...node.data, canvasNode: nextCanvasNode } };
			});
			setNodes(next);
			emitRef.current(next, edgesRef.current);
		},
		[],
	);

	const startEdit = useCallback((id: string) => setEditingId(id), []);

	// Align cards contained inside a group
	const alignGroupChildren = useCallback(
		(groupId: string, type: AlignmentType) => {
			const group = nodesRef.current.find((n) => n.id === groupId);
			if (!group) return;

			const gx = group.position.x;
			const gy = group.position.y;
			const gw =
				group.width ??
				(group.data as { canvasNode?: CanvasNode })?.canvasNode?.width ??
				300;
			const gh =
				group.height ??
				(group.data as { canvasNode?: CanvasNode })?.canvasNode?.height ??
				200;

			const childIds = new Set<string>();
			for (const node of nodesRef.current) {
				if (node.id === groupId || node.type === "canvasGroup") continue;
				const { width: nw, height: nh } = getNodeDimensions(node);
				const inside =
					node.position.x >= gx - 10 &&
					node.position.y >= gy - 10 &&
					node.position.x + nw <= gx + gw + 10 &&
					node.position.y + nh <= gy + gh + 10;
				if (inside) childIds.add(node.id);
			}

			if (childIds.size < 2) return;

			let nextNodes = applyAlignment(nodesRef.current, childIds, type);

			// Dynamically adjust group dimensions if arranged children exceed boundary
			const updatedChildren = nextNodes.filter((n) => childIds.has(n.id));
			const childBox = getNodesBoundingBox(updatedChildren);
			if (childBox) {
				const padding = 32;
				const newGx = Math.min(gx, Math.round(childBox.minX - padding));
				const newGy = Math.min(gy, Math.round(childBox.minY - padding));
				const newGw = Math.max(gw, Math.round(childBox.maxX + padding - newGx));
				const newGh = Math.max(gh, Math.round(childBox.maxY + padding - newGy));

				nextNodes = nextNodes.map((n) => {
					if (n.id !== groupId) return n;
					return {
						...n,
						position: { x: newGx, y: newGy },
						width: newGw,
						height: newGh,
					};
				});
			}

			setNodes(nextNodes);
			emitRef.current(nextNodes, edgesRef.current);
		},
		[],
	);

	// Create a new group enclosing selected nodes
	const createGroupFromSelection = useCallback(
		(
			ids: string[],
			box: { minX: number; minY: number; width: number; height: number },
		) => {
			if (ids.length === 0) return;
			const padding = 32;
			const groupId = genId();
			const groupCanvasNode: CanvasNode = {
				id: groupId,
				type: "group",
				label: "Group",
				x: Math.round(box.minX - padding),
				y: Math.round(box.minY - padding),
				width: Math.round(box.width + padding * 2),
				height: Math.round(box.height + padding * 2),
			};

			const newGroupNode: Node = {
				id: groupId,
				type: "canvasGroup",
				position: { x: groupCanvasNode.x, y: groupCanvasNode.y },
				data: {
					label: "Group",
					readOnly,
					editing: true,
					onCommitLabel: commitLabel,
					onDeleteNode: deleteNode,
					onSetColor: setNodeColor,
					onStartEdit: startEdit,
					onAlignGroup: alignGroupChildren,
				},
				width: groupCanvasNode.width,
				height: groupCanvasNode.height,
				draggable: !readOnly,
				selectable: !readOnly,
				selected: true,
			};

			// Deselect all previously selected cards so multi-selection box disappears immediately
			const unselectedPrev = nodesRef.current.map((n) => ({
				...n,
				selected: false,
			}));

			// Put group in front of list so cards render on top of it
			const nextNodes = [newGroupNode, ...unselectedPrev];
			setNodes(nextNodes);
			setEditingId(groupId);
			emitRef.current(nextNodes, edgesRef.current);
		},
		[
			readOnly,
			commitLabel,
			deleteNode,
			setNodeColor,
			startEdit,
			alignGroupChildren,
		],
	);

	// Align selected nodes according to alignment type
	const alignSelectedNodes = useCallback((type: AlignmentType) => {
		const selectedIds = new Set(
			nodesRef.current.filter((n) => n.selected).map((n) => n.id),
		);
		if (selectedIds.size < 2) return;

		const nextNodes = applyAlignment(nodesRef.current, selectedIds, type);
		setNodes(nextNodes);
		emitRef.current(nextNodes, edgesRef.current);
	}, []);

	const buildOptions = useMemo<FlowBuildOptions>(
		() => ({
			readOnly,
			editingId,
			onNavigateNote,
			onCommitText: commitText,
			onCommitLabel: commitLabel,
			onDeleteNode: deleteNode,
			onSetColor: setNodeColor,
			onStartEdit: startEdit,
			onAlignGroup: alignGroupChildren,
		}),
		[
			readOnly,
			editingId,
			onNavigateNote,
			commitText,
			commitLabel,
			deleteNode,
			setNodeColor,
			startEdit,
			alignGroupChildren,
		],
	);
	buildOptionsRef.current = buildOptions;

	// Initialize state
	const [nodes, setNodes] = useState<Node[]>(() =>
		toFlowNodes(parsed.data?.nodes ?? [], buildOptions),
	);
	const [edges, setEdges] = useState<Edge[]>(() => {
		const canvasNodes = parsed.data?.nodes ?? [];
		const byId = new Map(canvasNodes.map((node) => [node.id, node]));
		return (parsed.data?.edges ?? [])
			.map((edge) => toFlowEdge(edge, byId))
			.filter((edge): edge is Edge => edge !== null);
	});

	nodesRef.current = nodes;
	edgesRef.current = edges;

	// Targeted update for editingId changes: only re-create objects for affected nodes
	const prevEditingIdRef = useRef<string | null>(editingId);
	useEffect(() => {
		const prevId = prevEditingIdRef.current;
		prevEditingIdRef.current = editingId;
		if (prevId === editingId) return;

		setNodes((prev) =>
			prev.map((node) => {
				if (node.id === prevId) {
					return {
						...node,
						data: { ...node.data, editing: false },
					};
				}
				if (node.id === editingId) {
					return {
						...node,
						data: { ...node.data, editing: true },
					};
				}
				return node;
			}),
		);
	}, [editingId]);

	// Update readOnly / actions if readOnly or onNavigateNote changes
	useEffect(() => {
		setNodes((prev) =>
			prev.map((node) => ({
				...node,
				draggable: !readOnly,
				selectable: !readOnly,
				data: {
					...node.data,
					readOnly,
					onNavigateNote,
				},
			})),
		);
	}, [readOnly, onNavigateNote]);

	// External content sync
	useEffect(() => {
		if (content === lastEmittedRef.current) return;
		initHistory(content);

		const next = parseCanvas(content);
		if (!next.data) return;
		setNodes(toFlowNodes(next.data.nodes, buildOptions));
		const byId = new Map(next.data.nodes.map((node) => [node.id, node]));
		setEdges(
			next.data.edges
				.map((edge) => toFlowEdge(edge, byId))
				.filter((edge): edge is Edge => edge !== null),
		);
	}, [content, buildOptions, initHistory, lastEmittedRef]);

	/**
	 * Optimized group child shifting: moves cards fully enclosed inside a dragged group.
	 * Uses drag lifecycle caching to avoid redundant O(N*M) geometry tests during continuous drag.
	 */
	const shiftGroupChildren = useCallback(
		(prev: Node[], next: Node[], changes: NodeChange<Node>[]) => {
			const positionChanges = changes.filter(
				(c): c is Extract<NodeChange<Node>, { type: "position" }> =>
					c.type === "position" && Boolean(c.position),
			);
			if (positionChanges.length === 0) return next;

			const draggedIds = new Set(positionChanges.map((c) => c.id));
			const prevMap = new Map(prev.map((n) => [n.id, n]));
			let result = next;

			for (const change of positionChanges) {
				const prevGroup = prevMap.get(change.id);
				if (
					!prevGroup ||
					prevGroup.type !== "canvasGroup" ||
					!change.position
				) {
					continue;
				}

				const dx = change.position.x - prevGroup.position.x;
				const dy = change.position.y - prevGroup.position.y;
				if (dx === 0 && dy === 0) continue;

				// Retrieve or build cached child node IDs for this dragged group
				let childIds = groupChildIdsCacheRef.current.get(change.id);
				if (!childIds) {
					const gx = prevGroup.position.x;
					const gy = prevGroup.position.y;
					const gw = prevGroup.width ?? 0;
					const gh = prevGroup.height ?? 0;
					childIds = [];

					for (const node of prev) {
						if (node.type !== "canvasCard" || draggedIds.has(node.id)) {
							continue;
						}
						const nw = node.width ?? 0;
						const nh = node.height ?? 0;
						const inside =
							node.position.x >= gx &&
							node.position.y >= gy &&
							node.position.x + nw <= gx + gw &&
							node.position.y + nh <= gy + gh;
						if (inside) childIds.push(node.id);
					}
					groupChildIdsCacheRef.current.set(change.id, childIds);
				}

				if (childIds.length === 0) continue;
				const childIdSet = new Set(childIds);

				result = result.map((node) => {
					if (!childIdSet.has(node.id)) return node;
					return {
						...node,
						position: { x: node.position.x + dx, y: node.position.y + dy },
					};
				});
			}

			// Clear cache when drag finishes
			if (changes.some((c) => c.type === "position" && !c.dragging)) {
				groupChildIdsCacheRef.current.clear();
			}

			return result;
		},
		[],
	);

	const handleNodesChange = useCallback(
		(changes: NodeChange<Node>[]) => {
			const prev = nodesRef.current;
			let next = applyNodeChanges(changes, prev);
			next = shiftGroupChildren(prev, next, changes);
			setNodes(next);

			// Only emit when position drag completes or dimensions/add/remove occurs
			const shouldEmit = changes.some(
				(c) =>
					c.type === "remove" ||
					c.type === "add" ||
					(c.type === "position" && !c.dragging && c.position) ||
					(c.type === "dimensions" && c.resizing === false),
			);
			if (shouldEmit) emitRef.current(next, edgesRef.current);
		},
		[shiftGroupChildren],
	);

	const handleEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
		// Filter out select changes so edge selection is solely controlled explicitly via click
		const nonSelectChanges = changes.filter((c) => c.type !== "select");
		if (nonSelectChanges.length === 0) return;
		const next = applyEdgeChanges(nonSelectChanges, edgesRef.current);
		setEdges(next);
		if (nonSelectChanges.some((c) => c.type === "remove" || c.type === "add")) {
			emitRef.current(nodesRef.current, next);
		}
	}, []);

	// Add an empty text card at canvas coordinates
	const addCardAtPosition = useCallback(
		(flowX: number, flowY: number) => {
			const id = genId();
			const canvasNode: CanvasNode = {
				id,
				type: "text",
				text: "",
				x: Math.round(flowX - 125),
				y: Math.round(flowY - 30),
				width: 250,
				height: 60,
			};
			const next: CanvasCardFlowNode = {
				id,
				type: "canvasCard",
				position: { x: canvasNode.x, y: canvasNode.y },
				data: {
					canvasNode,
					onNavigateNote,
					readOnly,
					editing: true,
					onCommitText: commitText,
					onDeleteNode: deleteNode,
					onSetColor: setNodeColor,
					onStartEdit: startEdit,
				},
				width: canvasNode.width,
				height: canvasNode.height,
				draggable: true,
				selectable: true,
			};
			const nextNodes = [...nodesRef.current, next];
			setNodes(nextNodes);
			setEditingId(id);
			emitRef.current(nextNodes, edgesRef.current);
			return id;
		},
		[onNavigateNote, readOnly, commitText, deleteNode, setNodeColor, startEdit],
	);

	return {
		parsed,
		nodes,
		edges,
		setNodes,
		setEdges,
		nodesRef,
		edgesRef,
		editingId,
		setEditingId,
		commitText,
		commitLabel,
		deleteNode,
		batchDeleteNodes,
		setNodeColor,
		batchSetNodeColor,
		createGroupFromSelection,
		alignSelectedNodes,
		alignGroupChildren,
		startEdit,
		handleNodesChange,
		handleEdgesChange,
		addCardAtPosition,
		emit,
		undo,
		redo,
		canUndo,
		canRedo,
	};
}
