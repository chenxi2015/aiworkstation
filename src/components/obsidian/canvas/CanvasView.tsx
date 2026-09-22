import {
	applyEdgeChanges,
	applyNodeChanges,
	Background,
	BackgroundVariant,
	type ColorMode,
	type Connection,
	ConnectionMode,
	Controls,
	type Edge,
	type EdgeChange,
	type FinalConnectionState,
	MarkerType,
	MiniMap,
	type Node,
	type NodeChange,
	Panel,
	ReactFlow,
	ReactFlowProvider,
	useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle, FileText, Plus, Type } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanvasEdgeComponent } from "./CanvasFlowEdge";
import {
	type CanvasCardFlowNode,
	CanvasCardNode,
	type CanvasGroupFlowNode,
	CanvasGroupNode,
} from "./CanvasFlowNodes";
import {
	type CanvasData,
	type CanvasEdge,
	type CanvasNode,
	guessSides,
	resolveColor,
} from "./canvasUtils";

export interface CanvasViewProps {
	/** .canvas file JSON text */
	content: string;
	/** Callback when the canvas graph is edited (serialized JSON Canvas text) */
	onChange?: (json: string) => void;
	/** Callback when clicking a note/canvas file card */
	onNavigateNote?: (relPath: string) => void;
	/** Disable all editing interactions (e.g. truncated oversized file) */
	readOnly?: boolean;
	/**
	 * Create a new markdown note in the canvas file's directory.
	 * Returns the new note's relPath, or null on failure.
	 */
	onCreateNoteFile?: () => Promise<string | null>;
}

const nodeTypes = {
	canvasCard: CanvasCardNode,
	canvasGroup: CanvasGroupNode,
};

const edgeTypes = {
	canvasEdge: CanvasEdgeComponent,
};

function getColorMode(): ColorMode {
	return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Track the app's class-based dark mode (.dark on <html>) for React Flow colorMode */
function useColorMode(): ColorMode {
	const [mode, setMode] = useState<ColorMode>(getColorMode);

	useEffect(() => {
		const update = () => setMode(getColorMode());
		const observer = new MutationObserver(update);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
		return () => observer.disconnect();
	}, []);

	return mode;
}

function parseCanvas(content: string): {
	data: CanvasData | null;
	error: string | null;
} {
	try {
		const raw = JSON.parse(content || "{}") as Partial<CanvasData>;
		return {
			data: {
				nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
				edges: Array.isArray(raw.edges) ? raw.edges : [],
			},
			error: null,
		};
	} catch (err) {
		return {
			data: null,
			error: err instanceof Error ? err.message : "JSON 解析失败",
		};
	}
}

function genId(): string {
	return Math.random().toString(16).slice(2, 10) + Date.now().toString(16);
}

function sideOf(handle: string | null | undefined): CanvasEdge["fromSide"] {
	const side = handle?.replace(/^[st]-/, "");
	return side === "top" ||
		side === "right" ||
		side === "bottom" ||
		side === "left"
		? side
		: undefined;
}

const DEFAULT_EDGE_COLOR = "var(--muted, #8b8b8b)";

function defaultEdgeProps(): Pick<
	Edge,
	"type" | "style" | "labelStyle" | "markerEnd" | "interactionWidth"
> {
	return {
		type: "canvasEdge",
		style: { stroke: DEFAULT_EDGE_COLOR, strokeWidth: 1.5 },
		labelStyle: { fill: DEFAULT_EDGE_COLOR },
		markerEnd: {
			type: MarkerType.ArrowClosed,
			width: 16,
			height: 16,
			color: DEFAULT_EDGE_COLOR,
		},
		interactionWidth: 20,
	};
}

function toFlowEdge(
	edge: CanvasEdge,
	byId: Map<string, CanvasNode>,
): Edge | null {
	const from = byId.get(edge.fromNode);
	const to = byId.get(edge.toNode);
	if (!from || !to) return null;
	const guessed = guessSides(from, to);
	const color = resolveColor(edge.color) ?? DEFAULT_EDGE_COLOR;
	return {
		id: edge.id,
		type: "canvasEdge",
		source: edge.fromNode,
		target: edge.toNode,
		sourceHandle: `s-${edge.fromSide ?? guessed.fromSide}`,
		targetHandle: `t-${edge.toSide ?? guessed.toSide}`,
		style: { stroke: color, strokeWidth: 1.5 },
		markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color },
		interactionWidth: 20,
		data: { rawColor: edge.color, label: edge.label },
	};
}

interface FlowBuildOptions {
	readOnly: boolean;
	editingId: string | null;
	onNavigateNote?: (relPath: string) => void;
	onCommitText: (id: string, text: string) => void;
	onCommitLabel: (id: string, label: string) => void;
	onDeleteNode: (id: string) => void;
	onSetColor: (id: string, color: string | undefined) => void;
	onStartEdit: (id: string) => void;
}

function toFlowNodes(
	canvasNodes: CanvasNode[],
	opts: FlowBuildOptions,
): Node[] {
	const groups: Node[] = [];
	const cards: Node[] = [];
	for (const node of canvasNodes) {
		if (node.type === "group") {
			const groupNode: CanvasGroupFlowNode = {
				id: node.id,
				type: "canvasGroup",
				position: { x: node.x, y: node.y },
				data: {
					label: node.label,
					color: node.color,
					readOnly: opts.readOnly,
					editing: opts.editingId === node.id,
					onCommitLabel: opts.onCommitLabel,
					onDeleteNode: opts.onDeleteNode,
					onSetColor: opts.onSetColor,
					onStartEdit: opts.onStartEdit,
				},
				width: node.width,
				height: node.height,
				draggable: !opts.readOnly,
				selectable: !opts.readOnly,
			};
			groups.push(groupNode);
		} else {
			const cardNode: CanvasCardFlowNode = {
				id: node.id,
				type: "canvasCard",
				position: { x: node.x, y: node.y },
				data: {
					canvasNode: node,
					onNavigateNote: opts.onNavigateNote,
					readOnly: opts.readOnly,
					editing: opts.editingId === node.id,
					onCommitText: opts.onCommitText,
					onDeleteNode: opts.onDeleteNode,
					onSetColor: opts.onSetColor,
					onStartEdit: opts.onStartEdit,
				},
				width: node.width,
				height: node.height,
				draggable: !opts.readOnly,
				selectable: !opts.readOnly,
			};
			cards.push(cardNode);
		}
	}
	// Groups render first so cards paint above them
	return [...groups, ...cards];
}

/** Serialize the current flow graph back to JSON Canvas text */
function serializeCanvas(nodes: Node[], edges: Edge[]): string {
	const canvasNodes: CanvasNode[] = [];
	for (const node of nodes) {
		const x = Math.round(node.position.x);
		const y = Math.round(node.position.y);
		const width = Math.round(node.measured?.width ?? node.width ?? 0);
		const height = Math.round(node.measured?.height ?? node.height ?? 0);
		if (node.type === "canvasGroup") {
			const data = node.data as { label?: string; color?: string };
			canvasNodes.push({
				id: node.id,
				type: "group",
				x,
				y,
				width,
				height,
				...(data.color ? { color: data.color } : {}),
				...(data.label ? { label: data.label } : {}),
			});
		} else {
			const { canvasNode } = node.data as { canvasNode: CanvasNode };
			canvasNodes.push({ ...canvasNode, x, y, width, height });
		}
	}
	const canvasEdges: CanvasEdge[] = edges.map((edge) => ({
		id: edge.id,
		fromNode: edge.source,
		...(sideOf(edge.sourceHandle)
			? { fromSide: sideOf(edge.sourceHandle) }
			: {}),
		toNode: edge.target,
		...(sideOf(edge.targetHandle) ? { toSide: sideOf(edge.targetHandle) } : {}),
		...((edge.data as { rawColor?: string } | undefined)?.rawColor
			? { color: (edge.data as { rawColor?: string }).rawColor }
			: {}),
		...((edge.data as { label?: string } | undefined)?.label
			? { label: (edge.data as { label?: string }).label }
			: {}),
	}));
	return JSON.stringify({ nodes: canvasNodes, edges: canvasEdges }, null, "\t");
}

function CanvasFlow({
	content,
	onChange,
	onNavigateNote,
	readOnly = false,
	onCreateNoteFile,
}: CanvasViewProps) {
	const colorMode = useColorMode();
	const { screenToFlowPosition } = useReactFlow();
	const wrapperRef = useRef<HTMLDivElement>(null);

	const parsed = useMemo(() => parseCanvas(content), [content]);

	const [editingId, setEditingId] = useState<string | null>(null);

	const commitText = useCallback((id: string, text: string) => {
		setEditingId(null);
		const next = nodesRef.current.map((node) =>
			node.id === id && node.type === "canvasCard"
				? {
						...node,
						data: {
							...node.data,
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

	const commitLabel = useCallback((id: string, label: string) => {
		setEditingId(null);
		const next = nodesRef.current.map((node) =>
			node.id === id && node.type === "canvasGroup"
				? { ...node, data: { ...node.data, label } }
				: node,
		);
		setNodes(next);
		emitRef.current(next, edgesRef.current);
	}, []);

	const deleteNode = useCallback((id: string) => {
		const nextNodes = nodesRef.current.filter((node) => node.id !== id);
		const nextEdges = edgesRef.current.filter(
			(edge) => edge.source !== id && edge.target !== id,
		);
		setNodes(nextNodes);
		setEdges(nextEdges);
		emitRef.current(nextNodes, nextEdges);
	}, []);

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

	const nodesRef = useRef(nodes);
	nodesRef.current = nodes;
	const edgesRef = useRef(edges);
	edgesRef.current = edges;

	// Last JSON text we emitted upward, to distinguish own edits from external changes
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

	// Rebuild node data (editing flag, callbacks) without touching geometry
	useEffect(() => {
		setNodes((prev) =>
			prev.map((node) => {
				if (node.type === "canvasGroup") {
					return {
						...node,
						draggable: !readOnly,
						selectable: !readOnly,
						data: {
							...node.data,
							readOnly,
							editing: editingId === node.id,
							onCommitLabel: commitLabel,
							onDeleteNode: deleteNode,
							onSetColor: setNodeColor,
							onStartEdit: startEdit,
						},
					};
				}
				return {
					...node,
					draggable: !readOnly,
					selectable: !readOnly,
					data: {
						...node.data,
						readOnly,
						editing: editingId === node.id,
						onNavigateNote,
						onCommitText: commitText,
						onDeleteNode: deleteNode,
						onSetColor: setNodeColor,
						onStartEdit: startEdit,
					},
				};
			}),
		);
	}, [
		readOnly,
		editingId,
		onNavigateNote,
		commitText,
		commitLabel,
		deleteNode,
		setNodeColor,
		startEdit,
	]);

	// Sync inward when content changes externally (source mode edits, merge results)
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

	// Shift cards fully inside a moved group (Obsidian group-drag semantics)
	const shiftGroupChildren = useCallback(
		(prev: Node[], next: Node[], changes: NodeChange<Node>[]) => {
			const positionChanges = changes.filter(
				(c): c is Extract<NodeChange<Node>, { type: "position" }> =>
					c.type === "position" && Boolean(c.position),
			);
			if (positionChanges.length === 0) return next;
			const draggedIds = new Set(positionChanges.map((c) => c.id));
			let result = next;
			for (const change of positionChanges) {
				const prevGroup = prev.find(
					(node) => node.id === change.id && node.type === "canvasGroup",
				);
				if (!prevGroup || !change.position) continue;
				const dx = change.position.x - prevGroup.position.x;
				const dy = change.position.y - prevGroup.position.y;
				if (dx === 0 && dy === 0) continue;
				const gx = prevGroup.position.x;
				const gy = prevGroup.position.y;
				const gw = prevGroup.width ?? 0;
				const gh = prevGroup.height ?? 0;
				result = result.map((node) => {
					if (node.type !== "canvasCard" || draggedIds.has(node.id))
						return node;
					const prevNode = prev.find((candidate) => candidate.id === node.id);
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

	const handleConnect = useCallback((connection: Connection) => {
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
		setEdges(nextEdges);
		emitRef.current(nodesRef.current, nextEdges);
	}, []);

	const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);

	const commitEdgeLabel = useCallback((id: string, label: string) => {
		setEditingEdgeId(null);
		const next = edgesRef.current.map((edge) =>
			edge.id === id
				? { ...edge, data: { ...edge.data, label: label || undefined } }
				: edge,
		);
		setEdges(next);
		emitRef.current(nodesRef.current, next);
	}, []);

	const handleEdgeDoubleClick = useCallback(
		(_: React.MouseEvent, edge: Edge) => {
			if (!readOnly) setEditingEdgeId(edge.id);
		},
		[readOnly],
	);

	// Inject transient editing flag and commit callback into edge data at render time
	const displayEdges = useMemo(
		() =>
			edges.map((edge) => ({
				...edge,
				data: {
					...edge.data,
					editing: edge.id === editingEdgeId,
					onCommitEdgeLabel: commitEdgeLabel,
				},
			})),
		[edges, editingEdgeId, commitEdgeLabel],
	);

	const [pendingConn, setPendingConn] = useState<{
		screenX: number;
		screenY: number;
		flowX: number;
		flowY: number;
		fromNodeId: string;
		fromHandleId: string | null;
		fromHandleType: "source" | "target";
	} | null>(null);

	// Dropped a connection on empty pane: offer to create a connected node (Obsidian-style)
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
		[readOnly, screenToFlowPosition],
	);

	// Dismiss the connection-drop menu with Escape
	useEffect(() => {
		if (!pendingConn) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") setPendingConn(null);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [pendingConn]);

	const addConnectedNode = useCallback(
		async (kind: "text" | "note") => {
			const pending = pendingConn;
			setPendingConn(null);
			if (!pending) return;

			const id = genId();
			let canvasNode: CanvasNode;
			if (kind === "text") {
				canvasNode = {
					id,
					type: "text",
					text: "",
					x: Math.round(pending.flowX - 125),
					y: Math.round(pending.flowY - 30),
					width: 250,
					height: 60,
				};
			} else {
				const relPath = await onCreateNoteFile?.();
				if (!relPath) return;
				canvasNode = {
					id,
					type: "file",
					file: relPath,
					x: Math.round(pending.flowX - 110),
					y: Math.round(pending.flowY - 60),
					width: 220,
					height: 120,
				};
			}

			const fromFlowNode = nodesRef.current.find(
				(node) => node.id === pending.fromNodeId,
			);
			if (!fromFlowNode) return;
			const fromCanvas: CanvasNode =
				fromFlowNode.type === "canvasGroup"
					? {
							id: fromFlowNode.id,
							type: "group",
							x: fromFlowNode.position.x,
							y: fromFlowNode.position.y,
							width: fromFlowNode.width ?? 0,
							height: fromFlowNode.height ?? 0,
						}
					: (fromFlowNode.data as { canvasNode: CanvasNode }).canvasNode;
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
					editing: kind === "text",
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
			if (kind === "text") setEditingId(id);
			emitRef.current(nextNodes, nextEdges);
		},
		[
			pendingConn,
			onCreateNoteFile,
			onNavigateNote,
			readOnly,
			commitText,
			deleteNode,
			setNodeColor,
			startEdit,
		],
	);

	// Edge endpoint reconnection; normalize handle prefixes per end (s- source, t- target)
	const handleReconnect = useCallback((oldEdge: Edge, conn: Connection) => {
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
		setEdges(next);
		emitRef.current(nodesRef.current, next);
	}, []);

	const addCardAt = useCallback(
		(clientX: number, clientY: number) => {
			const point = screenToFlowPosition({ x: clientX, y: clientY });
			const id = genId();
			const canvasNode: CanvasNode = {
				id,
				type: "text",
				text: "",
				x: Math.round(point.x - 125),
				y: Math.round(point.y - 30),
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
		},
		[screenToFlowPosition, onNavigateNote, readOnly, commitText],
	);

	const handleDoubleClick = useCallback(
		(e: React.MouseEvent) => {
			if (readOnly) return;
			if (!(e.target as HTMLElement).classList.contains("react-flow__pane")) {
				return;
			}
			addCardAt(e.clientX, e.clientY);
		},
		[readOnly, addCardAt],
	);

	const handleNodeDoubleClick = useCallback(
		(_: React.MouseEvent, node: Node) => {
			if (readOnly) return;
			if (node.type === "canvasCard") {
				const { canvasNode } = node.data as { canvasNode: CanvasNode };
				if (canvasNode.type === "text") setEditingId(node.id);
			} else if (node.type === "canvasGroup") {
				setEditingId(node.id);
			}
		},
		[readOnly],
	);

	if (parsed.error) {
		return (
			<div className="h-full flex flex-col items-center justify-center text-center px-8">
				<AlertTriangle className="w-6 h-6 text-warning mb-3" />
				<p className="text-xs text-muted leading-relaxed">
					Canvas JSON 解析失败：{parsed.error}
					<br />
					可切换到源码模式修复
				</p>
			</div>
		);
	}

	return (
		<div
			ref={wrapperRef}
			className="relative h-full bg-surface/40 dark:bg-black/20"
		>
			{nodes.length === 0 && (
				<div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
					<p className="text-xs text-muted">
						{readOnly ? "空画布" : "空画布，双击空白处创建卡片"}
					</p>
				</div>
			)}
			<ReactFlow
				nodes={nodes}
				edges={displayEdges}
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				colorMode={colorMode}
				onNodesChange={handleNodesChange}
				onEdgesChange={handleEdgesChange}
				onConnect={readOnly ? undefined : handleConnect}
				onConnectEnd={readOnly ? undefined : handleConnectEnd}
				onReconnect={readOnly ? undefined : handleReconnect}
				edgesReconnectable={!readOnly}
				onPaneClick={() => setPendingConn(null)}
				onDoubleClick={handleDoubleClick}
				onNodeDoubleClick={handleNodeDoubleClick}
				onEdgeDoubleClick={handleEdgeDoubleClick}
				connectionMode={ConnectionMode.Loose}
				fitView
				fitViewOptions={{ padding: 0.1, maxZoom: 1 }}
				minZoom={0.1}
				maxZoom={4}
				nodesDraggable={!readOnly}
				nodesConnectable={!readOnly}
				elementsSelectable={!readOnly}
				deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
				zoomOnDoubleClick={false}
				panOnScroll
				zoomOnScroll={false}
				onlyRenderVisibleElements
			>
				<Background variant={BackgroundVariant.Dots} gap={24} size={1.5} />
				<Controls showInteractive={false} position="bottom-right" />
				<MiniMap
					pannable
					zoomable
					position="bottom-left"
					nodeColor={(node) =>
						node.type === "canvasGroup"
							? "rgba(128,128,128,0.2)"
							: (resolveColor(
									(node.data as { canvasNode?: { color?: string } }).canvasNode
										?.color,
								) ?? "#8b8b8b")
					}
				/>
				{pendingConn && (
					<div
						className="absolute z-20 flex flex-col rounded-lg border border-border bg-surface p-1 shadow-md"
						style={{ left: pendingConn.screenX, top: pendingConn.screenY }}
					>
						<button
							type="button"
							onClick={() => void addConnectedNode("text")}
							className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-surface-secondary/60 transition-colors cursor-pointer"
						>
							<Type className="w-3.5 h-3.5 text-muted" />
							添加文本
						</button>
						<button
							type="button"
							onClick={() => void addConnectedNode("note")}
							className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-surface-secondary/60 transition-colors cursor-pointer"
						>
							<FileText className="w-3.5 h-3.5 text-muted" />
							添加笔记
						</button>
					</div>
				)}
				{!readOnly && (
					<Panel position="top-right" className="flex items-center gap-2">
						<span className="text-[10px] text-muted select-none">
							双击空白新建卡片，悬停卡片边缘拖拽连线
						</span>
						<button
							type="button"
							aria-label="添加卡片"
							title="添加卡片"
							onClick={(e) =>
								addCardAt(
									e.currentTarget.getBoundingClientRect().left - 200,
									e.currentTarget.getBoundingClientRect().top + 120,
								)
							}
							className="p-1.5 rounded-md border border-border bg-surface text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors"
						>
							<Plus className="w-3.5 h-3.5" />
						</button>
					</Panel>
				)}
			</ReactFlow>
		</div>
	);
}

/**
 * JSON Canvas editor powered by @xyflow/react:
 * - Drag cards/groups (group drag moves contained cards), inline text editing
 * - Side-anchored edge drawing, Backspace/Delete removal, double-click to add cards
 * - Changes serialize back to .canvas JSON through onChange
 */
export function CanvasView(props: CanvasViewProps) {
	return (
		<ReactFlowProvider>
			<CanvasFlow {...props} />
		</ReactFlowProvider>
	);
}
