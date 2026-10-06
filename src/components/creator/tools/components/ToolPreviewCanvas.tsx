import {
	CheckCircle2,
	Cpu,
	Download,
	Film,
	Music,
	Sparkles,
} from "lucide-react";

export interface ProcessedMediaResult {
	materialId: number;
	assetUrl: string;
	filename: string;
	sizeBytes: number;
}

interface ToolPreviewCanvasProps {
	isProcessing: boolean;
	processedResult: ProcessedMediaResult | null;
	selectedFile: File | null;
	sourcePreviewUrl: string | null;
	compressionSavings?: number | null;
}

/**
 * Live media preview and deliverable viewer canvas.
 * Handles multimodal source preview and processed output playback (Video, Audio, Image).
 */
export function ToolPreviewCanvas({
	isProcessing,
	processedResult,
	selectedFile,
	sourcePreviewUrl,
	compressionSavings,
}: ToolPreviewCanvasProps) {
	return (
		<div className="p-5 rounded-xl border border-border bg-surface flex-1 flex flex-col">
			{/* Canvas Top Bar */}
			<div className="flex items-center justify-between pb-3 border-b border-border/50 mb-4 flex-wrap gap-2">
				<div className="flex items-center gap-2">
					<Sparkles className="w-4 h-4 text-accent" />
					<span className="text-xs font-bold text-foreground">
						{processedResult
							? "处理产物交付视窗"
							: selectedFile
								? "待处理源素材预览"
								: "实时媒体预览与交付"}
					</span>
				</div>

				{/* Result Actions / Badges */}
				{processedResult ? (
					<div className="flex items-center gap-2">
						{compressionSavings && (
							<span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium">
								节省 {compressionSavings}% 体积
							</span>
						)}
						<a
							href={processedResult.assetUrl}
							download={processedResult.filename}
							className="px-3 py-1 rounded-lg bg-accent text-white text-xs font-medium flex items-center gap-1.5 hover:bg-accent/90 transition-colors shadow-xs cursor-pointer select-none no-underline"
						>
							<Download className="w-3.5 h-3.5 text-white shrink-0" />
							<span className="text-white font-medium">直接下载</span>
						</a>
					</div>
				) : selectedFile ? (
					<span className="text-[11px] text-muted font-mono">
						源文件: {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
					</span>
				) : null}
			</div>

			{/* Center Screen Viewer */}
			<div className="flex-1 min-h-[320px] rounded-xl bg-black/60 border border-border flex flex-col items-center justify-center p-4 relative overflow-hidden">
				{isProcessing ? (
					/* Processing animated loader */
					<div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
						<div className="relative">
							<div className="w-14 h-14 rounded-full border-2 border-accent/20 border-t-accent animate-spin" />
							<Cpu className="w-6 h-6 text-accent absolute inset-0 m-auto animate-pulse" />
						</div>
						<div className="space-y-1">
							<p className="text-sm font-semibold text-white">
								FFmpeg 引擎正在极速运算中...
							</p>
							<p className="text-xs text-white/60">
								正在执行音视频滤镜与转码，请稍候
							</p>
						</div>
					</div>
				) : processedResult ? (
					/* Processed deliverable display */
					<div className="w-full h-full flex flex-col items-center justify-center">
						{processedResult.filename.endsWith(".mp4") ||
						processedResult.filename.endsWith(".webm") ||
						processedResult.filename.endsWith(".mov") ? (
							<video
								src={processedResult.assetUrl}
								controls
								autoPlay
								className="max-h-[360px] max-w-full rounded-lg shadow-lg"
							>
								<track kind="captions" />
							</video>
						) : processedResult.filename.endsWith(".mp3") ||
							processedResult.filename.endsWith(".wav") ||
							processedResult.filename.endsWith(".m4a") ? (
							<div className="w-full max-w-md p-6 bg-surface rounded-xl border border-border/50 text-center space-y-4">
								<div className="w-12 h-12 rounded-full bg-accent/15 text-accent mx-auto flex items-center justify-center">
									<Music className="w-6 h-6" />
								</div>
								<p className="text-xs font-semibold text-white">
									{processedResult.filename}
								</p>
								<audio
									src={processedResult.assetUrl}
									controls
									autoPlay
									className="w-full"
								>
									<track kind="captions" />
								</audio>
							</div>
						) : (
							<img
								src={processedResult.assetUrl}
								alt="处理完成产物"
								className="max-h-[360px] max-w-full object-contain rounded-lg shadow-lg"
							/>
						)}
					</div>
				) : sourcePreviewUrl && selectedFile ? (
					/* Source File Live Preview */
					<div className="w-full h-full flex flex-col items-center justify-center">
						{selectedFile.type.startsWith("video") ? (
							<video
								src={sourcePreviewUrl}
								controls
								className="max-h-[360px] max-w-full rounded-lg"
							>
								<track kind="captions" />
							</video>
						) : selectedFile.type.startsWith("audio") ? (
							<div className="w-full max-w-md p-6 bg-surface rounded-xl border border-border/50 text-center space-y-4">
								<div className="w-12 h-12 rounded-full bg-accent/15 text-accent mx-auto flex items-center justify-center">
									<Music className="w-6 h-6" />
								</div>
								<p className="text-xs font-semibold text-white">
									{selectedFile.name} (源音频)
								</p>
								<audio src={sourcePreviewUrl} controls className="w-full">
									<track kind="captions" />
								</audio>
							</div>
						) : selectedFile.type.startsWith("image") ? (
							<img
								src={sourcePreviewUrl}
								alt="源文件预览"
								className="max-h-[360px] max-w-full object-contain rounded-lg"
							/>
						) : (
							<div className="text-center text-xs text-white/70">
								已准备就绪，点击下方「开始处理」即可生成产物
							</div>
						)}
						<span className="absolute top-3 left-3 text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-white/80 border border-white/10 backdrop-blur-xs">
							输入源媒体预览
						</span>
					</div>
				) : (
					/* Empty State Waiting Guide */
					<div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
						<div className="w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center text-muted">
							<Film className="w-6 h-6" />
						</div>
						<div className="space-y-1">
							<p className="text-xs font-semibold text-foreground">
								等待提交处理
							</p>
							<p className="text-[11px] text-muted max-w-xs">
								在左侧选择或上传素材文件，调整所需参数后点击底部「开始处理」
							</p>
						</div>
					</div>
				)}
			</div>

			{/* Result Footnote / Detail Badges */}
			{processedResult && (
				<div className="mt-3.5 p-3 rounded-lg bg-surface border border-border/50 flex items-center justify-between text-xs text-muted flex-wrap gap-2">
					<div className="flex items-center gap-1.5">
						<CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
						<span className="text-foreground font-medium truncate max-w-xs">
							{processedResult.filename}
						</span>
					</div>
					<div className="flex items-center gap-3 text-[11px] font-mono">
						<span>
							大小: {(processedResult.sizeBytes / (1024 * 1024)).toFixed(2)} MB
						</span>
						<span>状态: 已入库</span>
					</div>
				</div>
			)}
		</div>
	);
}
