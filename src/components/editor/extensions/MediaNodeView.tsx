import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { ImageOff, Loader2, RefreshCw } from "lucide-react";
import type React from "react";
import { useContext, useRef, useState } from "react";
import { MediaActionToolbar } from "./media/MediaActionToolbar";
import {
	downloadFileToDisk,
	EditorMediaContext,
	isExternalMedia,
} from "./media/mediaUtils";
import { useMediaOperations } from "./media/useMediaOperations";

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
		e.preventDefault();
		e.stopPropagation();
		if (typeof getPos === "function") {
			const pos = getPos();
			if (typeof pos === "number") {
				editor.commands.setNodeSelection(pos);
				editor.view.focus();
			}
		}
	};

	// Handle clicks on empty line areas outside the media element to insert text cursor instead of selecting outer div
	const handleWrapperClick = (e: React.MouseEvent) => {
		if (containerRef.current?.contains(e.target as Node)) {
			return;
		}
		if (typeof getPos === "function") {
			const pos = getPos();
			if (typeof pos === "number") {
				e.preventDefault();
				e.stopPropagation();
				const containerRect = containerRef.current?.getBoundingClientRect();
				const insertPos =
					containerRect && e.clientX < containerRect.left
						? pos
						: pos + node.nodeSize;
				editor.commands.setTextSelection(insertPos);
				editor.view.focus();
			}
		}
	};

	return (
		<NodeViewWrapper
			as="div"
			className={`media-node-view not-prose my-3 w-full flex select-none outline-none ${
				textAlign === "center"
					? "justify-center"
					: textAlign === "right"
						? "justify-end"
						: "justify-start"
			}`}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			onClick={handleWrapperClick}
		>
			<div
				ref={containerRef}
				className={`relative group max-w-full select-none transition-all duration-150 rounded-xl ${
					isVideo || mediaLoadError
						? "w-full max-w-md min-w-[280px]"
						: "inline-block"
				} ${
					selected
						? "ring-2 ring-accent shadow-md"
						: "hover:ring-1 hover:ring-accent/40"
				} ${
					mediaLoadError
						? "bg-red-500/5 dark:bg-red-950/20 border border-dashed border-red-300 dark:border-red-900/60"
						: ""
				}`}
				onClickCapture={handleSelectNode}
				onMouseDownCapture={handleSelectNode}
			>
				{/* Media element: Video or Image */}
				{isVideo ? (
					<div
						className={`relative w-full overflow-hidden rounded-xl bg-black ${
							mediaLoadError ? "hidden" : ""
						}`}
					>
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
					<div
						className={`relative inline-flex items-center justify-center max-w-full ${
							mediaLoadError
								? "absolute w-0 h-0 opacity-0 pointer-events-none overflow-hidden"
								: "min-w-[48px] min-h-[48px]"
						}`}
					>
						<img
							src={src}
							alt={node.attrs.alt || ""}
							referrerPolicy="no-referrer"
							draggable={false}
							className="w-auto max-w-full h-auto rounded-xl block m-0 cursor-pointer min-w-[32px] min-h-[32px] object-contain select-none pointer-events-auto"
							onError={() => setMediaLoadError(true)}
							onLoad={() => setMediaLoadError(false)}
						/>
					</div>
				)}

				{/* Error fallback card when media fails to load */}
				{mediaLoadError && (
					<div className="flex flex-col gap-2.5 p-3.5 min-w-[280px] sm:min-w-[340px]">
						<div className="flex items-center gap-3">
							<div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950/60 text-red-500 dark:text-red-400 flex items-center justify-center shrink-0">
								<ImageOff className="w-4 h-4" />
							</div>
							<div className="flex-1 min-w-0 pr-8">
								<div className="text-xs font-semibold text-red-600 dark:text-red-400 truncate">
									{isVideo ? "视频资源无法加载" : "图片无法加载或已失效"}
								</div>
								<div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
									{node.attrs.alt || "本地文件已被移动/删除，或网络地址失效"}
								</div>
							</div>
						</div>
						{originalSrc && (
							<div className="flex items-center pt-2 border-t border-red-200/50 dark:border-red-900/40">
								<button
									type="button"
									onClick={handleDownloadAction}
									disabled={downloading}
									className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-md font-medium text-xs cursor-pointer transition-colors shadow-sm disabled:opacity-50"
									title="尝试从原始网络地址重新下载"
								>
									{downloading ? (
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
									) : (
										<RefreshCw className="w-3.5 h-3.5" />
									)}
									<span>一键从网络恢复</span>
								</button>
							</div>
						)}
					</div>
				)}

				{/* Action toolbar inside top-right corner of the media */}
				<MediaActionToolbar
					toolbarRef={toolbarRef}
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
