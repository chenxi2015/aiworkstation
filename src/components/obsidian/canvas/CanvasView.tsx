import {
	Background,
	BackgroundVariant,
	type ColorMode,
	ConnectionMode,
	Controls,
	MiniMap,
	type Node,
	ReactFlow,
	ReactFlowProvider,
	useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { CanvasEdgeComponent } from "./CanvasFlowEdge";
import { CanvasCardNode, CanvasGroupNode } from "./CanvasFlowNodes";
import { CanvasNoteSearchModal } from "./CanvasNoteSearchModal";
import {
	CanvasEmptyHint,
	CanvasParseError,
	CanvasTopToolbar,
	PendingConnectionMenu,
} from "./CanvasToolbar";
import { resolveColor } from "./canvasUtils";
import { useCanvasConnections } from "./useCanvasConnections";
import { useCanvasGraph } from "./useCanvasGraph";

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
	onCreateNoteFile?: (name?: string) => Promise<string | null>;
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

	const {
		parsed,
		nodes,
		edges,
		setNodes,
		setEdges,
		nodesRef,
		edgesRef,
		setEditingId,
		commitText,
		deleteNode,
		setNodeColor,
		startEdit,
		handleNodesChange,
		handleEdgesChange,
		addCardAtPosition,
		emit,
	} = useCanvasGraph({
		content,
		onChange,
		onNavigateNote,
		readOnly,
	});

	const {
		pendingConn,
		setPendingConn,
		noteSearchTarget,
		setNoteSearchTarget,
		displayEdges,
		handleConnect,
		handleConnectEnd,
		handleReconnect,
		handleEdgeDoubleClick,
		handleOpenNoteSearch,
		addConnectedTextCard,
		addFileNode,
	} = useCanvasConnections({
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
	});

	const addCardAt = useCallback(
		(clientX: number, clientY: number) => {
			const point = screenToFlowPosition({ x: clientX, y: clientY });
			addCardAtPosition(point.x, point.y);
		},
		[screenToFlowPosition, addCardAtPosition],
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
				const { canvasNode } = node.data as { canvasNode?: { type?: string } };
				if (canvasNode?.type === "text") setEditingId(node.id);
			} else if (node.type === "canvasGroup") {
				setEditingId(node.id);
			}
		},
		[readOnly, setEditingId],
	);

	if (parsed.error) {
		return <CanvasParseError error={parsed.error} />;
	}

	return (
		<div
			ref={wrapperRef}
			className="relative h-full bg-surface/40 dark:bg-black/20"
		>
			<CanvasEmptyHint count={nodes.length} readOnly={readOnly} />

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
					<PendingConnectionMenu
						pendingConn={pendingConn}
						onAddText={addConnectedTextCard}
						onOpenNoteSearch={handleOpenNoteSearch}
					/>
				)}

				<CanvasNoteSearchModal
					isOpen={Boolean(noteSearchTarget)}
					onClose={() => setNoteSearchTarget(null)}
					onSelect={(relPath) => {
						if (noteSearchTarget) {
							addFileNode(relPath, noteSearchTarget);
						}
						setNoteSearchTarget(null);
					}}
					onCreate={onCreateNoteFile}
				/>

				<CanvasTopToolbar readOnly={readOnly} onAddCard={addCardAt} />
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
