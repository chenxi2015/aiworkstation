import {
	type Connection,
	type Edge,
	type FinalConnectionState,
	MarkerType,
	type Node,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getVaultFileCategory, vaultAssetUrl } from "../utils/vaultFileUtils";
import type { CanvasCardFlowNode } from "./CanvasFlowNodes";
import {
	DEFAULT_EDGE_COLOR,
	defaultEdgeProps,
	genId,
} from "./canvasSerializer";
import { type CanvasNode, guessSides, resolveColor } from "./canvasUtils";

export interface PendingConnection {
	screenX: number;
	screenY: number;
	flowX: number;
	flowY: number;
	fromNodeId: string;
	fromHandleId: string | null;
	fromHandleType: "source" | "target";
}

export interface NoteSearchTarget {
	flowX: number;
	flowY: number;
	fromNodeId?: string;
	fromHandleId?: string | null;
	fromHandleType?: "source" | "target";
}

function measureImageDimensions(
	src: string,
): Promise<{ width: number; height: number }> {
	return new Promise((resolve) => {
		if (typeof window === "undefined") {
			resolve({ width: 340, height: 260 });
			return;
		}
		const img = new window.Image();
		img.onload = () => {
			const nw = img.naturalWidth || 360;
			const nh = img.naturalHeight || 300;
			const maxDim = 400;
			let w = nw;
			let h = nh;
			if (nw >= nh) {
				w = Math.min(maxDim, nw);
				h = Math.round(w * (nh / nw));
			} else {
				h = Math.min(maxDim, nh);
				w = Math.round(h * (nw / nh));
			}
			resolve({ width: Math.max(160, w), height: Math.max(120, h) });
		};
		img.onerror = () => {
			resolve({ width: 340, height: 260 });
		};
		img.src = src;
	});
}

export interface UseCanvasConnectionsOptions {
	readOnly: boolean;
	edges: Edge[];
	setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
	setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
	nodesRef: React.MutableRefObject<Node[]>;
	edgesRef: React.MutableRefObject<Edge[]>;
	setEditingId: (id: string | null) => void;
	commitText: (id: string, text: string) => void;
	deleteNode: (id: string) => void;
	setNodeColor: (id: string, color: string | undefined) => void;
	startEdit: (id: string) => void;
	onNavigateNote?: (relPath: string) => void;
	screenToFlowPosition: (clientPos: { x: number; y: number }) => {
		x: number;
		y: number;
	};
	wrapperRef: React.RefObject<HTMLDivElement | null>;
	emit: (nextNodes: Node[], nextEdges: Edge[]) => void;
}

/**
 * Hook for managing canvas edge connections, reconnections, and pending drop interactions
 */
export function useCanvasConnections({
	readOnly,
	edges,
	setEdges,
	setNodes,
	nodesRef,
	edgesRef,
	setEditingId,
	commitText,
	deleteNode,
	setNodeColor,
	startEdit,
	onNavigateNote,
	screenToFlowPosition,
	wrapperRef,
	emit,
}: UseCanvasConnectionsOptions) {
	const [pendingConn, setPendingConn] = useState<PendingConnection | null>(
		null,
	);
	const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
	const [noteSearchTarget, setNoteSearchTarget] =
		useState<NoteSearchTarget | null>(null);

	// Standard edge connection between two existing handles
	const handleConnect = useCallback(
		(connection: Connection) => {
			if (!connection.source || !connection.target) return;
			const id = genId();
			const next: Edge = {
				id,
				source: connection.source,
				target: connection.target,
				sourceHandle: connection.sourceHandle,
				targetHandle: connection.targetHandle,
				...defaultEdgeProps(),
				data: {},
			};
			const nextEdges = [...edgesRef.current, next];
			edgesRef.current = nextEdges;
			setEdges(nextEdges);
			emit(nodesRef.current, nextEdges);
		},
		[edgesRef, nodesRef, setEdges, emit],
	);

	// Edge label editing
	const commitEdgeLabel = useCallback(
		(id: string, label: string) => {
			setEditingEdgeId(null);
			const next = edgesRef.current.map((edge) =>
				edge.id === id
					? { ...edge, data: { ...edge.data, label: label || undefined } }
					: edge,
			);
			edgesRef.current = next;
			setEdges(next);
			emit(nodesRef.current, next);
		},
		[edgesRef, nodesRef, setEdges, emit],
	);

	// Delete an edge
	const deleteEdge = useCallback(
		(id: string) => {
			const next = edgesRef.current.filter((edge) => edge.id !== id);
			edgesRef.current = next;
			setEdges(next);
			emit(nodesRef.current, next);
		},
		[edgesRef, nodesRef, setEdges, emit],
	);

	// Set or clear edge color
	const setEdgeColor = useCallback(
		(id: string, color: string | undefined) => {
			const next = edgesRef.current.map((edge) => {
				if (edge.id !== id) return edge;
				const resolved = resolveColor(color) ?? DEFAULT_EDGE_COLOR;
				const nextData = { ...(edge.data ?? {}), rawColor: color };
				if (!color) delete nextData.rawColor;

				const hasMarkerEnd =
					edge.data?.toEnd !== "none" && Boolean(edge.markerEnd);
				const hasMarkerStart =
					edge.data?.fromEnd === "arrow" && Boolean(edge.markerStart);

				return {
					...edge,
					style: { ...edge.style, stroke: resolved },
					markerEnd: hasMarkerEnd
						? {
								type: MarkerType.ArrowClosed,
								width: 16,
								height: 16,
								color: resolved,
							}
						: undefined,
					markerStart: hasMarkerStart
						? {
								type: MarkerType.ArrowClosed,
								width: 16,
								height: 16,
								color: resolved,
							}
						: undefined,
					data: nextData,
				};
			});
			edgesRef.current = next;
			setEdges(next);
			emit(nodesRef.current, next);
		},
		[edgesRef, nodesRef, setEdges, emit],
	);

	// Set edge direction: "none" | "one-way" | "bidirectional"
	const setEdgeDirection = useCallback(
		(id: string, direction: "none" | "one-way" | "bidirectional") => {
			const next = edgesRef.current.map((edge) => {
				if (edge.id !== id) return edge;
				const color = (edge.style?.stroke as string) ?? DEFAULT_EDGE_COLOR;
				const fromEnd: "none" | "arrow" =
					direction === "bidirectional" ? "arrow" : "none";
				const toEnd: "none" | "arrow" = direction === "none" ? "none" : "arrow";

				return {
					...edge,
					markerStart:
						fromEnd === "arrow"
							? { type: MarkerType.ArrowClosed, width: 16, height: 16, color }
							: undefined,
					markerEnd:
						toEnd === "arrow"
							? { type: MarkerType.ArrowClosed, width: 16, height: 16, color }
							: undefined,
					data: {
						...(edge.data ?? {}),
						fromEnd,
						toEnd,
					},
				};
			});
			edgesRef.current = next;
			setEdges(next);
			emit(nodesRef.current, next);
		},
		[edgesRef, nodesRef, setEdges, emit],
	);

	// Clear edge label
	const clearEdgeLabel = useCallback(
		(id: string) => {
			commitEdgeLabel(id, "");
		},
		[commitEdgeLabel],
	);

	// Start editing edge label
	const startEditEdge = useCallback((id: string) => {
		setEditingEdgeId(id);
	}, []);

	const handleEdgeDoubleClick = useCallback(
		(_: React.MouseEvent, edge: Edge) => {
			if (!readOnly) setEditingEdgeId(edge.id);
		},
		[readOnly],
	);

	// Reconnecting existing edge endpoint
	const handleReconnect = useCallback(
		(oldEdge: Edge, conn: Connection) => {
			const normalize = (
				handle: string | null | undefined,
				end: "s" | "t",
			): string | null | undefined =>
				handle ? `${end}-${handle.replace(/^[st]-/, "")}` : handle;

			const next = edgesRef.current.map((edge) =>
				edge.id === oldEdge.id
					? {
							...edge,
							source: conn.source,
							target: conn.target,
							sourceHandle: normalize(conn.sourceHandle, "s"),
							targetHandle: normalize(conn.targetHandle, "t"),
						}
					: edge,
			);
			edgesRef.current = next;
			setEdges(next);
			emit(nodesRef.current, next);
		},
		[edgesRef, nodesRef, setEdges, emit],
	);

	// Handle dragging connection line and dropping onto empty canvas pane
	const handleConnectEnd = useCallback(
		(event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
			if (readOnly || connectionState.isValid || !connectionState.fromNode) {
				return;
			}
			const point =
				"changedTouches" in event
					? event.changedTouches[0]
					: (event as MouseEvent);
			const flow = screenToFlowPosition({ x: point.clientX, y: point.clientY });
			const rect = wrapperRef.current?.getBoundingClientRect();

			setPendingConn({
				screenX: point.clientX - (rect?.left ?? 0),
				screenY: point.clientY - (rect?.top ?? 0),
				flowX: flow.x,
				flowY: flow.y,
				fromNodeId: connectionState.fromNode.id,
				fromHandleId: connectionState.fromHandle?.id ?? null,
				fromHandleType:
					connectionState.fromHandle?.type === "target" ? "target" : "source",
			});
		},
		[readOnly, screenToFlowPosition, wrapperRef],
	);

	// Dismiss connection dropdown on Escape
	useEffect(() => {
		if (!pendingConn) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") setPendingConn(null);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [pendingConn]);

	// Open note search modal from pending connection
	const handleOpenNoteSearch = useCallback(() => {
		if (!pendingConn) return;
		setNoteSearchTarget({
			flowX: pendingConn.flowX,
			flowY: pendingConn.flowY,
			fromNodeId: pendingConn.fromNodeId,
			fromHandleId: pendingConn.fromHandleId,
			fromHandleType: pendingConn.fromHandleType,
		});
		setPendingConn(null);
	}, [pendingConn]);

	// Helper to extract canvas node bounds
	const getCanvasNodeFromFlow = useCallback((flowNode: Node): CanvasNode => {
		if (flowNode.type === "canvasGroup") {
			return {
				id: flowNode.id,
				type: "group",
				x: flowNode.position.x,
				y: flowNode.position.y,
				width: flowNode.width ?? 0,
				height: flowNode.height ?? 0,
			};
		}
		return (flowNode.data as { canvasNode: CanvasNode }).canvasNode;
	}, []);

	// Add connected text card from pending connection
	const addConnectedTextCard = useCallback(() => {
		const pending = pendingConn;
		setPendingConn(null);
		if (!pending) return;

		const id = genId();
		const canvasNode: CanvasNode = {
			id,
			type: "text",
			text: "",
			x: Math.round(pending.flowX - 125),
			y: Math.round(pending.flowY - 30),
			width: 250,
			height: 60,
		};

		const fromFlowNode = nodesRef.current.find(
			(node) => node.id === pending.fromNodeId,
		);
		if (!fromFlowNode) return;
		const fromCanvas = getCanvasNodeFromFlow(fromFlowNode);
		const sides = guessSides(fromCanvas, canvasNode);

		const edge: Edge =
			pending.fromHandleType === "source"
				? {
						id: genId(),
						source: pending.fromNodeId,
						sourceHandle: pending.fromHandleId ?? `s-${sides.fromSide}`,
						target: id,
						targetHandle: `t-${sides.toSide}`,
						...defaultEdgeProps(),
						data: {},
					}
				: {
						id: genId(),
						source: id,
						sourceHandle: `s-${sides.toSide}`,
						target: pending.fromNodeId,
						targetHandle: pending.fromHandleId ?? `t-${sides.fromSide}`,
						...defaultEdgeProps(),
						data: {},
					};

		const newNode: CanvasCardFlowNode = {
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

		const nextNodes = [...nodesRef.current, newNode];
		const nextEdges = [...edgesRef.current, edge];
		setNodes(nextNodes);
		setEdges(nextEdges);
		setEditingId(id);
		emit(nextNodes, nextEdges);
	}, [
		pendingConn,
		nodesRef,
		edgesRef,
		getCanvasNodeFromFlow,
		onNavigateNote,
		readOnly,
		commitText,
		deleteNode,
		setNodeColor,
		startEdit,
		setNodes,
		setEdges,
		setEditingId,
		emit,
	]);

	// Add file card (markdown/image/canvas) selected from modal
	const addFileNode = useCallback(
		async (relPath: string, target: NoteSearchTarget) => {
			const id = genId();
			const category = getVaultFileCategory(relPath);
			let width = 280;
			let height = 180;

			if (category === "image") {
				const dims = await measureImageDimensions(vaultAssetUrl(relPath));
				width = dims.width;
				height = dims.height;
			} else if (category === "markdown") {
				width = 360;
				height = 280;
			}

			const canvasNode: CanvasNode = {
				id,
				type: "file",
				file: relPath,
				x: Math.round(target.flowX - width / 2),
				y: Math.round(target.flowY - height / 2),
				width,
				height,
			};

			const newNode: CanvasCardFlowNode = {
				id,
				type: "canvasCard",
				position: { x: canvasNode.x, y: canvasNode.y },
				data: {
					canvasNode,
					onNavigateNote,
					readOnly,
					editing: false,
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

			let nextEdges = edgesRef.current;
			if (target.fromNodeId) {
				const fromFlowNode = nodesRef.current.find(
					(node) => node.id === target.fromNodeId,
				);
				if (fromFlowNode) {
					const fromCanvas = getCanvasNodeFromFlow(fromFlowNode);
					const sides = guessSides(fromCanvas, canvasNode);
					const edge: Edge =
						target.fromHandleType === "source"
							? {
									id: genId(),
									source: target.fromNodeId,
									sourceHandle: target.fromHandleId ?? `s-${sides.fromSide}`,
									target: id,
									targetHandle: `t-${sides.toSide}`,
									...defaultEdgeProps(),
									data: {},
								}
							: {
									id: genId(),
									source: id,
									sourceHandle: `s-${sides.toSide}`,
									target: target.fromNodeId,
									targetHandle: target.fromHandleId ?? `t-${sides.fromSide}`,
									...defaultEdgeProps(),
									data: {},
								};
					nextEdges = [...edgesRef.current, edge];
				}
			}

			const nextNodes = [...nodesRef.current, newNode];
			setNodes(nextNodes);
			setEdges(nextEdges);
			emit(nextNodes, nextEdges);
		},
		[
			nodesRef,
			edgesRef,
			getCanvasNodeFromFlow,
			onNavigateNote,
			readOnly,
			commitText,
			deleteNode,
			setNodeColor,
			startEdit,
			setNodes,
			setEdges,
			emit,
		],
	);

	// Display edges injected with transient editing flag and action handlers
	const displayEdges = useMemo(
		() =>
			edges.map((edge) => ({
				...edge,
				selectable: false,
				data: {
					...edge.data,
					editing: edge.id === editingEdgeId,
					onCommitEdgeLabel: commitEdgeLabel,
					onDeleteEdge: deleteEdge,
					onSetEdgeColor: setEdgeColor,
					onSetEdgeDirection: setEdgeDirection,
					onClearEdgeLabel: clearEdgeLabel,
					onStartEditEdge: startEditEdge,
				},
			})),
		[
			edges,
			editingEdgeId,
			commitEdgeLabel,
			deleteEdge,
			setEdgeColor,
			setEdgeDirection,
			clearEdgeLabel,
			startEditEdge,
		],
	);

	return {
		pendingConn,
		setPendingConn,
		editingEdgeId,
		noteSearchTarget,
		setNoteSearchTarget,
		displayEdges,
		handleConnect,
		handleConnectEnd,
		handleReconnect,
		handleEdgeDoubleClick,
		commitEdgeLabel,
		deleteEdge,
		setEdgeColor,
		setEdgeDirection,
		clearEdgeLabel,
		startEditEdge,
		handleOpenNoteSearch,
		addConnectedTextCard,
		addFileNode,
	};
}
