import { Loader2, RefreshCw, Upload, X } from "lucide-react";
import type React from "react";
import type { ChangeEvent, FormEvent, RefObject } from "react";

interface MediaReplacePopoverProps {
	isVideo: boolean;
	uploading: boolean;
	uploadError: string | null;
	originalSrc: string;
	isExternal: boolean;
	replaceUrlInput: string;
	fileInputRef: RefObject<HTMLInputElement | null>;
	onClose: () => void;
	onFileSelected: (e: ChangeEvent<HTMLInputElement>) => void;
	onRestoreOriginalSrc: (e: React.MouseEvent) => void;
	onConfirmUrlReplace: (e: FormEvent) => void;
	onUrlInputChange: (value: string) => void;
}

/**
 * Popover menu for replacing media (file upload or URL replacement)
 */
export function MediaReplacePopover({
	isVideo,
	uploading,
	uploadError,
	originalSrc,
	isExternal,
	replaceUrlInput,
	fileInputRef,
	onClose,
	onFileSelected,
	onRestoreOriginalSrc,
	onConfirmUrlReplace,
	onUrlInputChange,
}: MediaReplacePopoverProps) {
	return (
		<div
			role="dialog"
			aria-label="替换媒体选项"
			className="absolute top-[calc(100%+6px)] right-0 z-40 media-action-toolbar w-76 p-3 bg-zinc-900/95 text-zinc-100 border border-zinc-700/90 rounded-xl shadow-2xl backdrop-blur-lg animate-in fade-in slide-in-from-top-2 duration-150 whitespace-normal"
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => e.stopPropagation()}
		>
			<div className="flex items-center justify-between pb-2 mb-2.5 border-b border-zinc-800">
				<span className="text-xs font-semibold text-zinc-200">
					替换{isVideo ? "视频" : "图片"}
				</span>
				<button
					type="button"
					onClick={onClose}
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
						<span>{uploading ? "正在上传中..." : "上传本地文件替换"}</span>
					</button>
					<input
						ref={fileInputRef}
						type="file"
						accept={isVideo ? "video/*" : "image/*"}
						className="hidden"
						onChange={onFileSelected}
					/>
				</div>

				{/* Option 2: Restore original external URL (if available) */}
				{originalSrc && !isExternal && (
					<button
						type="button"
						onClick={onRestoreOriginalSrc}
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
				<form onSubmit={onConfirmUrlReplace} className="space-y-2">
					<input
						type="url"
						placeholder={`输入新的${isVideo ? "视频" : "图片"}网络 URL...`}
						value={replaceUrlInput}
						onChange={(e) => onUrlInputChange(e.target.value)}
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
	);
}
