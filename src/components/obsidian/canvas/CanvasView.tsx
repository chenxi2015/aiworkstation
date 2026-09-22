import {
	Background,
	BackgroundVariant,
	type ColorMode,
	ConnectionMode,
	type Edge,
	MiniMap,
	type Node,
	ReactFlow,
	ReactFlowProvider,
	SelectionMode,
	useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	CanvasActionContext,
	type CanvasActionContextValue,
} from "./CanvasActionContext";
import { CanvasEdgeComponent } from "./CanvasFlowEdge";
import { CanvasCardNode, CanvasGroupNode } from "./CanvasFlowNodes";
import { CanvasMultiSelectionToolbar } from "./CanvasMultiSelectionToolbar";
import { CanvasNoteSearchModal } from "./CanvasNoteSearchModal";
import { CanvasSelectionContext } from "./CanvasSelectionContext";
import {
	CanvasBottomBar,
	CanvasEmptyHint,
	CanvasParseError,
	CanvasViewControls,
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
	const [searchCategory, setSearchCategory] = useState<
		"all" | "note" | "media"
	>("all");
	const [interactionMode, setInteractionMode] = useState<"select" | "pan">(
		"select",
	);
	const [isSpacePressed, setIsSpacePressed] = useState(false);
	const [isSelecting, setIsSelecting] = useState(false);

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
	} = useCanvasGraph({
		content,
		onChange,
		onNavigateNote,
		readOnly,
	});

	// Space key and V/H mode shortcuts
	useEffect(() => {
		if (readOnly) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable)
			) {
				return;
			}

			if (e.code === "Space" && !e.repeat) {
				setIsSpacePressed(true);
			} else if (e.key.toLowerCase() === "v" && !e.metaKey && !e.ctrlKey) {
				setInteractionMode("select");
			} else if (e.key.toLowerCase() === "h" && !e.metaKey && !e.ctrlKey) {
				setInteractionMode("pan");
			}
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (e.code === "Space") {
				setIsSpacePressed(false);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
		};
	}, [readOnly]);

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
		deleteEdge,
		setEdgeColor,
		setEdgeDirection,
		clearEdgeLabel,
		startEditEdge,
		commitEdgeLabel,
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

	const getViewportCenterFlowPos = useCallback(() => {
		const rect = wrapperRef.current?.getBoundingClientRect();
		const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
		const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
		return screenToFlowPosition({ x: cx, y: cy });
	}, [screenToFlowPosition]);

	const handleAddCardCenter = useCallback(() => {
		if (readOnly) return;
		const pos = getViewportCenterFlowPos();
		addCardAtPosition(pos.x, pos.y);
	}, [readOnly, getViewportCenterFlowPos, addCardAtPosition]);

	const handleAddNoteCenter = useCallback(() => {
		if (readOnly) return;
		const pos = getViewportCenterFlowPos();
		setSearchCategory("note");
		setNoteSearchTarget({ flowX: pos.x, flowY: pos.y });
	}, [readOnly, getViewportCenterFlowPos, setNoteSearchTarget]);

	const handleAddMediaCenter = useCallback(() => {
		if (readOnly) return;
		const pos = getViewportCenterFlowPos();
		setSearchCategory("media");
		setNoteSearchTarget({ flowX: pos.x, flowY: pos.y });
	}, [readOnly, getViewportCenterFlowPos, setNoteSearchTarget]);

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

	const handleEdgeClick = useCallback(
		(_: React.MouseEvent, clickedEdge: Edge) => {
			if (readOnly) return;
			// Explicitly select the clicked edge, deselect other edges and nodes
			setEdges((prev) =>
				prev.map((e) => ({
					...e,
					selected: e.id === clickedEdge.id,
				})),
			);
			setNodes((prev) =>
				prev.some((n) => n.selected)
					? prev.map((n) => (n.selected ? { ...n, selected: false } : n))
					: prev,
			);
		},
		[readOnly, setEdges, setNodes],
	);

	const handleNodeClick = useCallback(() => {
		if (readOnly) return;
		// Clicking a card deselects all edges
		setEdges((prev) =>
			prev.some((e) => e.selected)
				? prev.map((e) => (e.selected ? { ...e, selected: false } : e))
				: prev,
		);
	}, [readOnly, setEdges]);

	const handlePaneClick = useCallback(() => {
		setPendingConn(null);
		// Clicking canvas empty area deselects all edges
		setEdges((prev) =>
			prev.some((e) => e.selected)
				? prev.map((e) => (e.selected ? { ...e, selected: false } : e))
				: prev,
		);
	}, [setPendingConn, setEdges]);

	const selectedNodesCount = useMemo(
		() => nodes.filter((n) => n.selected).length,
		[nodes],
	);

	const actionContextValue = useMemo<CanvasActionContextValue>(
		() => ({
			deleteNode,
			batchDeleteNodes,
			setNodeColor,
			batchSetNodeColor,
			startEdit,
			commitText,
			commitLabel,
			alignGroupChildren,
			createGroupFromSelection,
			alignSelectedNodes,
			onNavigateNote,
			deleteEdge,
			setEdgeColor,
			setEdgeDirection,
			clearEdgeLabel,
			startEditEdge,
			commitEdgeLabel,
		}),
		[
			deleteNode,
			batchDeleteNodes,
			setNodeColor,
			batchSetNodeColor,
			startEdit,
			commitText,
			commitLabel,
			alignGroupChildren,
			createGroupFromSelection,
			alignSelectedNodes,
			onNavigateNote,
			deleteEdge,
			setEdgeColor,
			setEdgeDirection,
			clearEdgeLabel,
			startEditEdge,
			commitEdgeLabel,
		],
	);

	useEffect(() => {
		const handlePointerUp = () => setIsSelecting(false);
		window.addEventListener("pointerup", handlePointerUp);
		return () => window.removeEventListener("pointerup", handlePointerUp);
	}, []);

	if (parsed.error) {
		return <CanvasParseError error={parsed.error} />;
	}

	const isPanning = isSpacePressed || interactionMode === "pan";

	return (
		<CanvasSelectionContext.Provider
			value={{ isSelecting, selectedNodesCount }}
		>
			<CanvasActionContext.Provider value={actionContextValue}>
				<div
					ref={wrapperRef}
					className={`relative h-full bg-surface/40 dark:bg-black/20 canvas-flow-container ${
						isPanning ? "cursor-grab active:cursor-grabbing" : ""
					}`}
				>
				{/* Obsidian-styled box selection (marquee) styling */}
				<style>{`
					.canvas-flow-container .react-flow__selection {
						background-color: rgba(120, 83, 238, 0.08) !important;
						border: 1.5px solid #7853ee !important;
						border-radius: 4px !important;
						box-shadow: 0 0 12px rgba(120, 83, 238, 0.15);
					}
				`}</style>

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
					onPaneClick={handlePaneClick}
					onNodeClick={handleNodeClick}
					onEdgeClick={handleEdgeClick}
					onDoubleClick={handleDoubleClick}
					onNodeDoubleClick={handleNodeDoubleClick}
					onEdgeDoubleClick={handleEdgeDoubleClick}
					onSelectionStart={() => {
						setIsSelecting(true);
						setEdges((prev) =>
							prev.some((e) => e.selected)
								? prev.map((e) => (e.selected ? { ...e, selected: false } : e))
								: prev,
						);
					}}
					onSelectionDragStart={() => {
						setIsSelecting(true);
						setEdges((prev) =>
							prev.some((e) => e.selected)
								? prev.map((e) => (e.selected ? { ...e, selected: false } : e))
								: prev,
						);
					}}
					onSelectionDrag={() => {
						setIsSelecting(true);
					}}
					onSelectionEnd={() => {
						setIsSelecting(false);
						setEdges((prev) =>
							prev.some((e) => e.selected)
								? prev.map((e) => (e.selected ? { ...e, selected: false } : e))
								: prev,
						);
					}}
					connectionMode={ConnectionMode.Loose}
					fitView
					fitViewOptions={{ padding: 0.1, maxZoom: 1 }}
					minZoom={0.1}
					maxZoom={4}
					nodesDraggable={!readOnly && !isPanning}
					nodesConnectable={!readOnly && !isPanning}
					elementsSelectable={!readOnly}
					selectionMode={SelectionMode.Partial}
					selectionOnDrag={
						!readOnly && interactionMode === "select" && !isSpacePressed
					}
					panOnDrag={
						readOnly || interactionMode === "pan" || isSpacePressed
							? true
							: [1, 2]
					}
					deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
					zoomOnDoubleClick={false}
					panOnScroll
					zoomOnScroll={false}
					onlyRenderVisibleElements
				>
					<Background variant={BackgroundVariant.Dots} gap={24} size={1.5} />
					<CanvasViewControls
						undo={undo}
						redo={redo}
						canUndo={canUndo}
						canRedo={canRedo}
						readOnly={readOnly}
					/>
					<MiniMap
						pannable
						zoomable
						position="bottom-left"
						nodeColor={(node) =>
							node.type === "canvasGroup"
								? "rgba(128,128,128,0.2)"
								: (resolveColor(
										(node.data as { canvasNode?: { color?: string } })
											.canvasNode?.color,
									) ?? "#8b8b8b")
						}
					/>

					{/* Floating multi-selection toolbar and bounding box */}
					<CanvasMultiSelectionToolbar
						readOnly={readOnly}
						onBatchDelete={batchDeleteNodes}
						onBatchSetColor={batchSetNodeColor}
						onCreateGroupFromSelection={createGroupFromSelection}
						onAlign={alignSelectedNodes}
					/>

					{pendingConn && (
						<PendingConnectionMenu
							pendingConn={pendingConn}
							onAddText={addConnectedTextCard}
							onOpenNoteSearch={() => {
								setSearchCategory("note");
								handleOpenNoteSearch();
							}}
						/>
					)}

					<CanvasNoteSearchModal
						isOpen={Boolean(noteSearchTarget)}
						filterCategory={searchCategory}
						onClose={() => setNoteSearchTarget(null)}
						onSelect={(relPath) => {
							if (noteSearchTarget) {
								addFileNode(relPath, noteSearchTarget);
							}
							setNoteSearchTarget(null);
						}}
						onCreate={onCreateNoteFile}
					/>

					<CanvasBottomBar
						readOnly={readOnly}
						interactionMode={interactionMode}
						onToggleInteractionMode={() =>
							setInteractionMode((prev) =>
								prev === "select" ? "pan" : "select",
							)
						}
						onAddCard={handleAddCardCenter}
						onAddNote={handleAddNoteCenter}
						onAddMedia={handleAddMediaCenter}
					/>
				</ReactFlow>
			</div>
			</CanvasActionContext.Provider>
		</CanvasSelectionContext.Provider>
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
