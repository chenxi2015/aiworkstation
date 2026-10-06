import { FileUp } from "lucide-react";
import type { ChangeEvent } from "react";

interface ToolDropzoneProps {
	isOnlineParser?: boolean;
	linkInput?: string;
	onLinkInputChange?: (value: string) => void;
	acceptTypes?: string;
	supportedFormats?: string[];
	selectedFile: File | null;
	onSelectFile: (file: File) => void;
}

/**
 * Dropzone for local media files or online video link extraction.
 */
export function ToolDropzone({
	isOnlineParser = false,
	linkInput = "",
	onLinkInputChange,
	acceptTypes,
	supportedFormats,
	selectedFile,
	onSelectFile,
}: ToolDropzoneProps) {
	if (isOnlineParser) {
		return (
			<div className="p-4 rounded-xl border border-border bg-surface space-y-3">
				<label
					htmlFor="video-link-input"
					className="block text-xs font-semibold text-foreground"
				>
					输入视频分享链接或口令
				</label>
				<div className="flex gap-2">
					<input
						id="video-link-input"
						type="text"
						value={linkInput}
						onChange={(e) => onLinkInputChange?.(e.target.value)}
						placeholder="粘贴抖音、快手、小红书、B站等平台的短视频链接..."
						className="flex-1 px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
					/>
				</div>
			</div>
		);
	}

	const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			onSelectFile(file);
		}
	};

	return (
		<div className="p-5 rounded-xl border-2 border-dashed border-border/80 hover:border-accent/60 bg-surface hover:bg-surface/40 transition-all flex flex-col items-center justify-center text-center group cursor-pointer relative">
			<input
				type="file"
				accept={acceptTypes}
				onChange={handleFileInputChange}
				className="absolute inset-0 opacity-0 cursor-pointer"
			/>
			<div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
				<FileUp className="w-5 h-5" />
			</div>
			{selectedFile ? (
				<div className="space-y-1">
					<p className="text-xs font-semibold text-foreground truncate max-w-xs">
						已选: {selectedFile.name}
					</p>
					<p className="text-[11px] text-muted font-mono">
						{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB ·
						点击可更换文件
					</p>
				</div>
			) : (
				<div className="space-y-1">
					<p className="text-xs font-semibold text-foreground">
						拖拽文件到此处，或点击选择
					</p>
					<p className="text-[11px] text-muted">
						{supportedFormats && supportedFormats.length > 0
							? `支持 ${supportedFormats.join(", ")} 媒体文件`
							: "支持音视频与图片文件"}
					</p>
				</div>
			)}
		</div>
	);
}
