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
	type FlowBuildOptions,
	genId,
	parseCanvas,
	serializeCanvas,
	toFlowEdge,
	toFlowNodes,
} from "./canvasSerializer";
import type { CanvasNode } from "./canvasUtils";

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

	// Last JSON text emitted to parent, preventing self-echo re-renders
	const lastEmittedRef = useRef(content);

	const emit = useCallback(
		(nextNodes: Node[], nextEdges: Edge[]) => {
			if (readOnly) return;
			const json = serializeCanvas(nextNodes, nextEdges);
			lastEmittedRef.current = json;
			onChange?.(json);
		},
		[onChange, readOnly],
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

	const startEdit = useCallback((id: string) => setEditingId(id), []);

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
		],
	);

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
		lastEmittedRef.current = content;
		const next = parseCanvas(content);
		if (!next.data) return;
		setNodes(toFlowNodes(next.data.nodes, buildOptions));
		const byId = new Map(next.data.nodes.map((node) => [node.id, node]));
		setEdges(
			next.data.edges
				.map((edge) => toFlowEdge(edge, byId))
				.filter((edge): edge is Edge => edge !== null),
		);
	}, [content, buildOptions]);

	/**
	 * Optimized group child shifting: moves cards fully enclosed inside a dragged group
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

				const gx = prevGroup.position.x;
				const gy = prevGroup.position.y;
				const gw = prevGroup.width ?? 0;
				const gh = prevGroup.height ?? 0;

				result = result.map((node) => {
					if (node.type !== "canvasCard" || draggedIds.has(node.id)) {
						return node;
					}
					const prevNode = prevMap.get(node.id);
					if (!prevNode) return node;

					const nw = prevNode.width ?? 0;
					const nh = prevNode.height ?? 0;
					const inside =
						prevNode.position.x >= gx &&
						prevNode.position.y >= gy &&
						prevNode.position.x + nw <= gx + gw &&
						prevNode.position.y + nh <= gy + gh;

					if (!inside) return node;
					return {
						...node,
						position: { x: node.position.x + dx, y: node.position.y + dy },
					};
				});
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
		const next = applyEdgeChanges(changes, edgesRef.current);
		setEdges(next);
		if (changes.some((c) => c.type === "remove" || c.type === "add")) {
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
		setNodeColor,
		startEdit,
		handleNodesChange,
		handleEdgesChange,
		addCardAtPosition,
		emit,
	};
}
