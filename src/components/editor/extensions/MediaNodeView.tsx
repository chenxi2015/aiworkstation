import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import {
	AlertTriangle,
	AlignCenter,
	AlignLeft,
	AlignRight,
	ArrowLeftRight,
	Check,
	Download,
	ExternalLink,
	HardDrive,
	Loader2,
	RefreshCw,
	Upload,
	X,
} from "lucide-react";
import type React from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
	downloadExternalAssetRpc,
	uploadAssetRpc,
} from "../../../services/api/editorClient";

/** Context for passing editor document ID to media node views */
export const EditorMediaContext = createContext<{ docId: number }>({
	docId: 0,
});

/**
 * Determine if a URL points to an external media resource (not local or self-hosted)
 */
export function isExternalMedia(url?: string | null): boolean {
	if (!url) return false;
	const trimmed = url.trim();
	if (
		trimmed.startsWith("data:") ||
		trimmed.startsWith("blob:") ||
		trimmed.startsWith("/")
	) {
		return false;
	}

	if (/^https?:\/\//i.test(trimmed)) {
		try {
			const parsed = new URL(trimmed);
			if (typeof window !== "undefined") {
				if (
					parsed.origin === window.location.origin &&
					parsed.pathname.startsWith("/api/files/")
				) {
					return false;
				}
			}
			return true;
		} catch {
			return true;
		}
	}
	return false;
}

/**
 * Download local media file to browser's download folder
 */
function downloadFileToDisk(url: string, filename: string) {
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.target = "_blank";
	a.rel = "noopener noreferrer";
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
}

/**
 * Unified Media NodeView for Images and Videos
 */
export function MediaNodeView(props: NodeViewProps) {
	const { node, selected, updateAttributes, editor, getPos } = props;
	const isVideo = node.type.name === "video";
	const src = (node.attrs.src as string) || "";
	const originalSrc = (node.attrs.originalSrc as string) || "";
	const textAlign = (node.attrs.textAlign as string) || "left";
	const isExternal = isExternalMedia(src);

	const context = useContext(EditorMediaContext);
	const docId =
		context.docId ||
		(editor as any)?.docId ||
		(props.extension.options as any)?.docId ||
		0;

	const [isHovered, setIsHovered] = useState(false);
	const [downloading, setDownloading] = useState(false);
	const [downloadSuccess, setDownloadSuccess] = useState(false);
	const [showReplaceModal, setShowReplaceModal] = useState(false);
	const [replaceUrlInput, setReplaceUrlInput] = useState("");
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [mediaLoadError, setMediaLoadError] = useState(false);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const toolbarRef = useRef<HTMLDivElement>(null);
	const [verticalPos, setVerticalPos] = useState<"top" | "bottom">("top");
	const [horizontalShift, setHorizontalShift] = useState(0);

	// Update toolbar position and clamp to visible boundaries
	const updateToolbarPosition = useCallback(() => {
		if (!toolbarRef.current || !containerRef.current) return;
		const containerRect = containerRef.current.getBoundingClientRect();
		const toolbarRect = toolbarRef.current.getBoundingClientRect();

		// Avoid calculating when hidden or zero-dimensioned
		if (toolbarRect.width === 0 || toolbarRect.height === 0) return;

		// 1. Vertical space detection: if not enough space above, flip to bottom
		const spaceAbove = containerRect.top;
		const nextVertical = spaceAbove < 52 ? "bottom" : "top";

		// 2. Horizontal boundary clamping:
		// Since toolbar is right-aligned by default (right-0), we only clamp:
		// - Left edge: if media is small/narrow and toolbar sticks out beyond container/viewport left
		// - Right edge: only if toolbar overflows past the browser window viewport
		const editorEl =
			containerRef.current.closest(".tiptap-editor") ||
			containerRef.current.closest(".doc-content-body") ||
			document.body;
		const editorRect = editorEl.getBoundingClientRect();

		const safeLeft = Math.max(8, editorRect.left + 8);
		const viewportRight = window.innerWidth - 8;

		// Current unshifted position
		const currentLeft = toolbarRect.left - horizontalShift;
		const currentRight = toolbarRect.right - horizontalShift;

		let shift = 0;
		if (currentLeft < safeLeft) {
			shift = safeLeft - currentLeft;
		} else if (currentRight > viewportRight) {
			shift = viewportRight - currentRight;
		}

		setVerticalPos(nextVertical);
		setHorizontalShift(shift);
	}, [horizontalShift]);

	// Recompute positioning on mount, selection, hover, or window resizes/scrolls
	useEffect(() => {
		updateToolbarPosition();

		const handleScrollOrResize = () => {
			updateToolbarPosition();
		};

		window.addEventListener("resize", handleScrollOrResize, { passive: true });
		window.addEventListener("scroll", handleScrollOrResize, {
			passive: true,
			capture: true,
		});

		return () => {
			window.removeEventListener("resize", handleScrollOrResize);
			window.removeEventListener("scroll", handleScrollOrResize, {
				capture: true,
			});
		};
	}, [updateToolbarPosition]);

	const handleSetAlignment =
		(alignment: "left" | "center" | "right") => (e: React.MouseEvent) => {
			e.stopPropagation();
			updateAttributes({ textAlign: alignment });
		};

	// Select the node when clicking on it
	const handleSelectNode = (e: React.MouseEvent) => {
		// Prevent reselection if clicking the action toolbar
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

	// Primary download action handler
	const handleDownloadAction = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (downloading) return;

		// Case 1: External media -> Download and persist to local document directory
		if (isExternal) {
			if (!src) return;
			if (!docId) {
				window.alert("缺少稿件 ID，无法转存到本地目录");
				return;
			}
			setDownloading(true);
			try {
				const { url: localUrl } = await downloadExternalAssetRpc(docId, src);
				// Update src to local URL and preserve original external URL
				updateAttributes({
					src: localUrl,
					originalSrc: originalSrc || src,
				});
				setDownloadSuccess(true);
				setMediaLoadError(false);
				setTimeout(() => setDownloadSuccess(false), 2500);
			} catch (err) {
				console.error("Failed to download external asset to document:", err);
				window.alert(
					err instanceof Error
						? `转存失败: ${err.message}`
						: "转存到本地稿件目录失败",
				);
			} finally {
				setDownloading(false);
			}
			return;
		}

		// Case 2: Local media with original external URL recorded -> Re-fetch from original source
		if (originalSrc && isExternalMedia(originalSrc)) {
			if (!docId) {
				window.alert("缺少稿件 ID，无法重新下载");
				return;
			}
			setDownloading(true);
			try {
				const { url: localUrl } = await downloadExternalAssetRpc(
					docId,
					originalSrc,
				);
				updateAttributes({ src: localUrl });
				setDownloadSuccess(true);
				setMediaLoadError(false);
				setTimeout(() => setDownloadSuccess(false), 2500);
			} catch (err) {
				console.error("Failed to re-download from original URL:", err);
				window.alert(
					err instanceof Error
						? `重新拉取失败: ${err.message}`
						: "从原外链重新拉取失败",
				);
			} finally {
				setDownloading(false);
			}
			return;
		}

		// Case 3: Standard local media -> Download to computer disk as backup
		let filename = "";
		try {
			filename =
				new URL(src, window.location.href).pathname.split("/").pop() || "";
		} catch {
			// ignore
		}
		if (!filename) {
			filename = `${isVideo ? "video" : "image"}-${Date.now()}.${isVideo ? "mp4" : "png"}`;
		}
		downloadFileToDisk(src, filename);
		setDownloadSuccess(true);
		setTimeout(() => setDownloadSuccess(false), 2000);
	};

	// Open replace popup
	const handleOpenReplace = (e: React.MouseEvent) => {
		e.stopPropagation();
		setShowReplaceModal((prev) => !prev);
		setReplaceUrlInput("");
		setUploadError(null);
	};

	// Replace with new URL
	const handleConfirmUrlReplace = (e: React.FormEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (!replaceUrlInput.trim()) return;
		const nextUrl = replaceUrlInput.trim();
		updateAttributes({
			src: nextUrl,
			originalSrc: isExternalMedia(nextUrl) ? nextUrl : null,
		});
		setShowReplaceModal(false);
		setReplaceUrlInput("");
		setMediaLoadError(false);
	};

	// Revert to original external URL
	const handleRestoreOriginalSrc = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!originalSrc) return;
		updateAttributes({ src: originalSrc });
		setShowReplaceModal(false);
		setMediaLoadError(false);
	};

	// Replace with local file upload
	const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setUploading(true);
		setUploadError(null);
		try {
			if (!docId) {
				throw new Error("缺少文档 ID，无法上传替换");
			}
			const { url } = await uploadAssetRpc(docId, file);
			updateAttributes({ src: url });
			setShowReplaceModal(false);
			setMediaLoadError(false);
		} catch (err) {
			console.error("Failed to replace media:", err);
			setUploadError(err instanceof Error ? err.message : "上传失败");
		} finally {
			setUploading(false);
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	};

	// Determine button label and tooltip
	const downloadButtonText = downloading
		? isExternal
			? "转存中..."
			: "拉取中..."
		: downloadSuccess
			? isExternal
				? "已转存本地"
				: "已重新拉取"
			: isExternal
				? "下载"
				: originalSrc
					? "重新拉取"
					: "下载备份";

	const downloadTooltip = isExternal
		? "下载并转存到当前稿件所在的本地目录"
		: originalSrc
			? "本地文件被删或损坏时，点击重新从网络原链接拉取转存"
			: "下载当前媒体文件到电脑本地磁盘备份";

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
						<div
							className="absolute top-0 left-0 right-0 h-7 z-10 cursor-pointer bg-gradient-to-b from-black/60 to-transparent"
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
						/>
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

				{/* Floating action toolbar (outside media, fixed to top-right with boundary clamping) */}
				<div
					ref={toolbarRef}
					style={{
						transform: horizontalShift
							? `translateX(${horizontalShift}px)`
							: undefined,
					}}
					className={`absolute z-30 media-action-toolbar flex items-center gap-1.5 p-1 bg-zinc-900/95 text-zinc-100 border border-zinc-700/80 rounded-lg shadow-xl backdrop-blur-md transition-opacity duration-150 whitespace-nowrap right-0 ${
						verticalPos === "top"
							? "bottom-[calc(100%+8px)]"
							: "top-[calc(100%+8px)]"
					} ${
						selected || isHovered || showReplaceModal
							? "opacity-100 scale-100 pointer-events-auto"
							: "opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
					}`}
				>
					{/* Source badge: External vs Local */}
					{isExternal ? (
						<span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium border border-amber-500/30">
							<ExternalLink className="w-3 h-3" />
							外链
						</span>
					) : (
						<span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-medium border border-emerald-500/30">
							<HardDrive className="w-3 h-3" />
							本地
						</span>
					)}

					{/* Alignment quick toggles */}
					<div className="flex items-center bg-zinc-800/90 rounded-md p-0.5 border border-zinc-700/60">
						<button
							type="button"
							title="居左对齐"
							onClick={handleSetAlignment("left")}
							className={`p-1 rounded transition-colors cursor-pointer ${
								textAlign === "left"
									? "bg-accent text-white"
									: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50"
							}`}
						>
							<AlignLeft className="w-3.5 h-3.5" />
						</button>
						<button
							type="button"
							title="居中对齐"
							onClick={handleSetAlignment("center")}
							className={`p-1 rounded transition-colors cursor-pointer ${
								textAlign === "center"
									? "bg-accent text-white"
									: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50"
							}`}
						>
							<AlignCenter className="w-3.5 h-3.5" />
						</button>
						<button
							type="button"
							title="居右对齐"
							onClick={handleSetAlignment("right")}
							className={`p-1 rounded transition-colors cursor-pointer ${
								textAlign === "right"
									? "bg-accent text-white"
									: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50"
							}`}
						>
							<AlignRight className="w-3.5 h-3.5" />
						</button>
					</div>

					{/* Download / Localize / Re-fetch button */}
					<button
						type="button"
						onClick={handleDownloadAction}
						disabled={downloading}
						title={downloadTooltip}
						className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md hover:bg-zinc-800 active:bg-zinc-700 text-zinc-200 hover:text-white transition-colors cursor-pointer disabled:opacity-60"
					>
						{downloading ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
						) : downloadSuccess ? (
							<Check className="w-3.5 h-3.5 text-emerald-400" />
						) : !isExternal && originalSrc ? (
							<RefreshCw className="w-3.5 h-3.5" />
						) : (
							<Download className="w-3.5 h-3.5" />
						)}
						<span>{downloadButtonText}</span>
					</button>

					{/* Replace button */}
					<button
						type="button"
						onClick={handleOpenReplace}
						title="替换图片或视频（支持本地上传或新网络链接）"
						className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
							showReplaceModal
								? "bg-accent text-white"
								: "hover:bg-zinc-800 active:bg-zinc-700 text-zinc-200 hover:text-white"
						}`}
					>
						<ArrowLeftRight className="w-3.5 h-3.5" />
						<span>替换</span>
					</button>

					{/* Replace popover menu anchored to toolbar */}
					{showReplaceModal && (
						<div
							className="absolute top-[calc(100%+6px)] right-0 z-40 media-action-toolbar w-76 p-3 bg-zinc-900/95 text-zinc-100 border border-zinc-700/90 rounded-xl shadow-2xl backdrop-blur-lg animate-in fade-in slide-in-from-top-2 duration-150 whitespace-normal"
							onClick={(e) => e.stopPropagation()}
						>
							<div className="flex items-center justify-between pb-2 mb-2.5 border-b border-zinc-800">
								<span className="text-xs font-semibold text-zinc-200">
									替换{isVideo ? "视频" : "图片"}
								</span>
								<button
									type="button"
									onClick={() => setShowReplaceModal(false)}
									className="text-zinc-400 hover:text-zinc-200 p-0.5 rounded cursor-pointer"
								>
									<X className="w-3.5 h-3.5" />
								</button>
							</div>

							<div className="space-y-2.5">
								{/* Option 1: Upload local file */}
								<div>
									<button
										type="button"
										disabled={uploading}
										onClick={() => fileInputRef.current?.click()}
										className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700/90 active:bg-zinc-700 text-xs font-medium text-zinc-200 border border-zinc-700/60 transition-colors cursor-pointer disabled:opacity-50"
									>
										{uploading ? (
											<Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
										) : (
											<Upload className="w-3.5 h-3.5" />
										)}
										<span>
											{uploading ? "正在上传中..." : "上传本地文件替换"}
										</span>
									</button>
									<input
										ref={fileInputRef}
										type="file"
										accept={isVideo ? "video/*" : "image/*"}
										className="hidden"
										onChange={handleFileSelected}
									/>
								</div>

								{/* Option 2: Restore original external URL (if available) */}
								{originalSrc && !isExternal && (
									<button
										type="button"
										onClick={handleRestoreOriginalSrc}
										className="w-full flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 text-[11px] font-medium text-amber-300/90 border border-zinc-700/50 transition-colors cursor-pointer"
										title={originalSrc}
									>
										<RefreshCw className="w-3 h-3" />
										<span>恢复原网络链接</span>
									</button>
								)}

								{/* Divider */}
								<div className="flex items-center gap-2 text-[11px] text-zinc-500 my-1">
									<span className="flex-1 h-[1px] bg-zinc-800" />
									<span>或输入新链接</span>
									<span className="flex-1 h-[1px] bg-zinc-800" />
								</div>

								{/* Option 3: Enter new URL */}
								<form onSubmit={handleConfirmUrlReplace} className="space-y-2">
									<input
										type="url"
										placeholder={`输入新的${isVideo ? "视频" : "图片"}网络 URL...`}
										value={replaceUrlInput}
										onChange={(e) => setReplaceUrlInput(e.target.value)}
										className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700/80 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-accent"
									/>
									<button
										type="submit"
										disabled={!replaceUrlInput.trim()}
										className="w-full py-1.5 px-3 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
									>
										确认替换
									</button>
								</form>

								{/* Error message */}
								{uploadError && (
									<div className="text-[11px] text-red-400 bg-red-950/40 p-1.5 rounded border border-red-800/50">
										{uploadError}
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			</div>
		</NodeViewWrapper>
	);
}
