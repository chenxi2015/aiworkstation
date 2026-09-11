import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { AlertTriangle } from "lucide-react";
import type React from "react";
import { useContext, useRef, useState } from "react";
import { MediaActionToolbar } from "./media/MediaActionToolbar";
import {
	downloadFileToDisk,
	EditorMediaContext,
	isExternalMedia,
} from "./media/mediaUtils";
import { useMediaOperations } from "./media/useMediaOperations";
import { useMediaToolbarPosition } from "./media/useMediaToolbarPosition";

// Re-export utilities and context for backward compatibility
export { downloadFileToDisk, EditorMediaContext, isExternalMedia };

/**
 * Unified Media NodeView for Images and Videos
 */
export function MediaNodeView(props: NodeViewProps) {
	const { node, selected, updateAttributes, editor, getPos } = props;
	const isVideo = node.type.name === "video";
	const src = (node.attrs.src as string) || "";
	const originalSrc = (node.attrs.originalSrc as string) || "";
	const textAlign = (node.attrs.textAlign as string) || "left";

	const context = useContext(EditorMediaContext);
	const docId =
		context.docId ||
		(editor as { docId?: number } | undefined)?.docId ||
		(props.extension.options as { docId?: number } | undefined)?.docId ||
		0;

	const [isHovered, setIsHovered] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const toolbarRef = useRef<HTMLDivElement>(null);

	// Floating toolbar positioning logic
	const { verticalPos, horizontalShift } = useMediaToolbarPosition({
		containerRef,
		toolbarRef,
	});

	// Media operation handlers and state
	const {
		isExternal,
		downloading,
		downloadSuccess,
		showReplaceModal,
		setShowReplaceModal,
		replaceUrlInput,
		setReplaceUrlInput,
		uploading,
		uploadError,
		mediaLoadError,
		setMediaLoadError,
		fileInputRef,
		downloadButtonText,
		downloadTooltip,
		handleDownloadAction,
		handleOpenReplace,
		handleConfirmUrlReplace,
		handleRestoreOriginalSrc,
		handleFileSelected,
	} = useMediaOperations({
		src,
		originalSrc,
		isVideo,
		docId,
		updateAttributes,
	});

	const handleSetAlignment =
		(alignment: "left" | "center" | "right") => (e: React.MouseEvent) => {
			e.stopPropagation();
			updateAttributes({ textAlign: alignment });
		};

	// Select the node when clicking on it
	const handleSelectNode = (e: React.MouseEvent) => {
		if ((e.target as HTMLElement).closest(".media-action-toolbar")) {
			return;
		}
		if (typeof getPos === "function") {
			const pos = getPos();
			if (typeof pos === "number") {
				editor.commands.setNodeSelection(pos);
			}
		}
	};

	return (
		<NodeViewWrapper
			as="div"
			className={`media-node-view not-prose my-3 w-full flex ${
				textAlign === "center"
					? "justify-center"
					: textAlign === "right"
						? "justify-end"
						: "justify-start"
			}`}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<div
				ref={containerRef}
				className={`relative group max-w-full select-none transition-all duration-150 rounded-xl ${
					isVideo ? "w-full" : "inline-block"
				} ${
					selected
						? "ring-2 ring-accent shadow-md"
						: "hover:ring-1 hover:ring-accent/40"
				}`}
				onClickCapture={handleSelectNode}
				onMouseDownCapture={handleSelectNode}
			>
				{/* Media element: Video or Image */}
				{isVideo ? (
					<div className="relative w-full overflow-hidden rounded-xl bg-black">
						{/* Video top handle to allow easy clicking & selecting */}
						<button
							type="button"
							aria-label="点击选中视频"
							className="absolute top-0 left-0 right-0 h-7 z-10 cursor-pointer bg-gradient-to-b from-black/60 to-transparent border-0 p-0"
							title="点击选中视频"
							onClick={handleSelectNode}
						/>
						<video
							src={src}
							controls
							preload="metadata"
							className="w-full max-w-full rounded-xl bg-black block m-0 max-h-[520px]"
							onError={() => setMediaLoadError(true)}
							onLoadedData={() => setMediaLoadError(false)}
						>
							<track kind="captions" />
						</video>
					</div>
				) : (
					<div className="relative inline-flex items-center justify-center max-w-full min-w-[40px] min-h-[40px]">
						<img
							src={src}
							alt={node.attrs.alt || ""}
							referrerPolicy="no-referrer"
							className="w-auto max-w-full h-auto rounded-xl block m-0 cursor-pointer min-w-[32px] min-h-[32px] object-contain"
							onError={() => setMediaLoadError(true)}
							onLoad={() => setMediaLoadError(false)}
						/>
					</div>
				)}

				{/* File missing / load error banner */}
				{mediaLoadError && (
					<div className="absolute bottom-2 left-2 right-2 z-20 flex items-center justify-between px-3 py-1.5 bg-red-950/90 text-red-200 border border-red-800/80 rounded-lg text-xs backdrop-blur-md shadow-lg">
						<div className="flex items-center gap-1.5 font-medium">
							<AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
							<span>媒体资源无法加载或本地文件已被删除</span>
						</div>
						{originalSrc && (
							<button
								type="button"
								onClick={handleDownloadAction}
								className="px-2 py-0.5 bg-red-800 hover:bg-red-700 text-white rounded font-medium text-[11px] cursor-pointer"
							>
								一键从网络恢复
							</button>
						)}
					</div>
				)}

				{/* Floating action toolbar */}
				<MediaActionToolbar
					toolbarRef={toolbarRef}
					verticalPos={verticalPos}
					horizontalShift={horizontalShift}
					visible={selected || isHovered || showReplaceModal}
					isExternal={isExternal}
					textAlign={textAlign}
					onSetAlignment={handleSetAlignment}
					downloading={downloading}
					downloadSuccess={downloadSuccess}
					originalSrc={originalSrc}
					downloadButtonText={downloadButtonText}
					downloadTooltip={downloadTooltip}
					onDownloadAction={handleDownloadAction}
					showReplaceModal={showReplaceModal}
					onOpenReplace={handleOpenReplace}
					isVideo={isVideo}
					uploading={uploading}
					uploadError={uploadError}
					replaceUrlInput={replaceUrlInput}
					fileInputRef={fileInputRef}
					onCloseReplace={() => setShowReplaceModal(false)}
					onFileSelected={handleFileSelected}
					onRestoreOriginalSrc={handleRestoreOriginalSrc}
					onConfirmUrlReplace={handleConfirmUrlReplace}
					onUrlInputChange={setReplaceUrlInput}
				/>
			</div>
		</NodeViewWrapper>
	);
}
