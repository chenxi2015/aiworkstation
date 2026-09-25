import {
	Check,
	Download,
	FolderPlus,
	Music,
	RefreshCw,
	Upload,
	Volume2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { uploadMaterialFiles } from "../../../../server/functions/creatorMaterials";
import type { ToolDefinition } from "../types";

/**
 * Encode an AudioBuffer into standard 16-bit PCM WAV Blob.
 * Simple, zero external dependencies, extremely fast in browser.
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
	const numOfChan = buffer.numberOfChannels;
	const length = buffer.length * numOfChan * 2 + 44;
	const out = new DataView(new ArrayBuffer(length));
	const channels: Float32Array[] = [];
	const sampleRate = buffer.sampleRate;
	let offset = 0;
	let pos = 0;

	// Write string helper
	const writeString = (s: string) => {
		for (let i = 0; i < s.length; i++) {
			out.setUint8(pos++, s.charCodeAt(i));
		}
	};

	// RIFF identifier
	writeString("RIFF");
	out.setUint32(pos, length - 8, true);
	pos += 4;
	writeString("WAVE");
	writeString("fmt ");
	out.setUint32(pos, 16, true);
	pos += 4; // Subchunk1Size (16 for PCM)
	out.setUint16(pos, 1, true);
	pos += 2; // AudioFormat (1 = PCM)
	out.setUint16(pos, numOfChan, true);
	pos += 2;
	out.setUint32(pos, sampleRate, true);
	pos += 4;
	out.setUint32(pos, sampleRate * 2 * numOfChan, true);
	pos += 4; // ByteRate
	out.setUint16(pos, numOfChan * 2, true);
	pos += 2; // BlockAlign
	out.setUint16(pos, 16, true);
	pos += 2; // BitsPerSample
	writeString("data");
	out.setUint32(pos, length - pos - 4, true);
	pos += 4;

	for (let i = 0; i < buffer.numberOfChannels; i++) {
		channels.push(buffer.getChannelData(i));
	}

	// Interleave channels
	while (offset < buffer.length) {
		for (let i = 0; i < numOfChan; i++) {
			let sample = Math.max(-1, Math.min(1, channels[i][offset]));
			sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
			out.setInt16(pos, sample, true);
			pos += 2;
		}
		offset++;
	}

	return new Blob([out.buffer], { type: "audio/wav" });
}

interface AudioExtractorProps {
	tool: ToolDefinition;
	onSaveSuccess?: () => void;
}

/**
 * Interactive Video Audio Extractor & Muter using native Web Audio API.
 * Extracts vocal/audio track from video into lossless WAV locally in seconds.
 */
export function AudioExtractor({
	tool: _tool,
	onSaveSuccess,
}: AudioExtractorProps) {
	const [videoFile, setVideoFile] = useState<File | null>(null);
	const [videoUrl, setVideoUrl] = useState<string | null>(null);
	const [isExtracting, setIsExtracting] = useState(false);
	const [extractedBlob, setExtractedBlob] = useState<Blob | null>(null);
	const [extractedUrl, setExtractedUrl] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [feedback, setFeedback] = useState<string | null>(null);

	const videoRef = useRef<HTMLVideoElement | null>(null);

	// Revoke URLs on unmount
	useEffect(() => {
		return () => {
			if (videoUrl) URL.revokeObjectURL(videoUrl);
			if (extractedUrl) URL.revokeObjectURL(extractedUrl);
		};
	}, [videoUrl, extractedUrl]);

	const handleFileSelect = (file: File) => {
		if (!file.type.startsWith("video/")) return;
		setVideoFile(file);
		setFeedback(null);
		setExtractedBlob(null);
		setExtractedUrl(null);
		const url = URL.createObjectURL(file);
		setVideoUrl(url);
	};

	const handleExtractAudio = async () => {
		if (!videoFile) return;
		setIsExtracting(true);
		setFeedback(null);

		try {
			const arrayBuffer = await videoFile.arrayBuffer();
			const audioCtx = new (
				window.AudioContext ||
				(window as unknown as { webkitAudioContext: typeof AudioContext })
					.webkitAudioContext
			)();
			const decodedAudio = await audioCtx.decodeAudioData(arrayBuffer);

			const wavBlob = audioBufferToWav(decodedAudio);
			setExtractedBlob(wavBlob);
			const url = URL.createObjectURL(wavBlob);
			setExtractedUrl(url);
			setFeedback("音频提取成功！可直接在线试听、下载或保存至素材库。");
		} catch (err) {
			console.error("Audio extraction failed", err);
			setFeedback("提取失败，视频文件中可能没有可用的音轨或编码格式暂不支持");
		} finally {
			setIsExtracting(false);
		}
	};

	const handleDownload = () => {
		if (!extractedUrl || !videoFile) return;
		const baseName = videoFile.name.replace(/\.[^/.]+$/, "");
		const link = document.createElement("a");
		link.href = extractedUrl;
		link.download = `${baseName}_audio.wav`;
		link.click();
	};

	const handleSaveToMaterials = async () => {
		if (!extractedBlob || !videoFile || isSaving) return;
		setIsSaving(true);
		try {
			const baseName = videoFile.name.replace(/\.[^/.]+$/, "");
			const filename = `${baseName}_audio.wav`;
			const file = new File([extractedBlob], filename, { type: "audio/wav" });

			const formData = new FormData();
			formData.append("files", file);

			await uploadMaterialFiles({ data: formData });
			setFeedback("已成功将提取的音频存入「素材库」！");
			onSaveSuccess?.();
		} catch (err) {
			console.error("Failed to save audio material", err);
			setFeedback("保存失败，请稍后重试");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="flex-1 flex flex-col h-full bg-background overflow-y-auto p-6 space-y-6 max-w-5xl">
			{/* Top header */}
			<div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border bg-surface/30">
				<div>
					<div className="flex items-center gap-2 mb-1">
						<h2 className="text-sm font-bold text-foreground">
							视频极速提取音频
						</h2>
						<span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-medium">
							Web Audio 纯本地秒提
						</span>
					</div>
					<p className="text-xs text-muted">
						拖入 MP4 / MOV 视频，纯本地提取出高保真无损音频轨，直接导出 WAV
						或一键归入素材库。
					</p>
				</div>
			</div>

			{/* Upload Area */}
			{!videoUrl ? (
				<div className="p-12 rounded-xl border-2 border-dashed border-border/80 hover:border-accent/60 bg-surface/20 hover:bg-surface/40 transition-colors flex flex-col items-center justify-center text-center group cursor-pointer relative">
					<input
						type="file"
						accept="video/*"
						onChange={(e) => {
							if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
						}}
						className="absolute inset-0 opacity-0 cursor-pointer"
					/>
					<div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
						<Upload className="w-6 h-6" />
					</div>
					<p className="text-sm font-semibold text-foreground mb-1">
						拖拽或点击选择待提取音频的视频
					</p>
					<p className="text-xs text-muted">
						支持 MP4、MOV、WebM、MKV 格式短视频
					</p>
				</div>
			) : (
				<div className="space-y-6">
					{/* Video Preview Card */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
						{/* Video player */}
						<div className="p-3.5 rounded-xl border border-border bg-surface/20 space-y-2.5">
							<div className="flex items-center justify-between text-xs">
								<span className="font-semibold text-foreground truncate max-w-[200px]">
									{videoFile?.name}
								</span>
								{videoFile && (
									<span className="text-muted font-mono text-[11px]">
										{(videoFile.size / (1024 * 1024)).toFixed(2)} MB
									</span>
								)}
							</div>
							<div className="relative aspect-video rounded-lg overflow-hidden bg-black flex items-center justify-center">
								<video
									ref={videoRef}
									src={videoUrl}
									controls
									className="max-h-full max-w-full"
								>
									<track kind="captions" />
								</video>
							</div>
						</div>

						{/* Extraction Controller */}
						<div className="p-4 rounded-xl border border-border bg-surface/30 space-y-4">
							<div className="space-y-1">
								<h3 className="text-xs font-bold text-foreground">提取选项</h3>
								<p className="text-[11px] text-muted">
									基于浏览器硬件解码，零上传云端，数秒内导出高清音频轨。
								</p>
							</div>

							<div className="p-3 rounded-lg bg-background/60 border border-border/60 text-xs space-y-1.5">
								<div className="flex items-center justify-between font-medium">
									<span>输出音频格式:</span>
									<span className="font-mono text-accent">WAV (无损 PCM)</span>
								</div>
								<div className="flex items-center justify-between text-muted text-[11px]">
									<span>处理方式:</span>
									<span>本地硬件解码</span>
								</div>
							</div>

							<button
								type="button"
								onClick={handleExtractAudio}
								disabled={isExtracting}
								className="w-full py-2.5 rounded-lg bg-accent text-accent-foreground text-xs font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer shadow-xs"
							>
								{isExtracting ? (
									<>
										<RefreshCw className="w-4 h-4 animate-spin" />
										<span>正在解码提取音频...</span>
									</>
								) : (
									<>
										<Volume2 className="w-4 h-4" />
										<span>立即提取纯音频</span>
									</>
								)}
							</button>

							{/* Audio Player if extracted */}
							{extractedUrl && (
								<div className="space-y-2 pt-2 border-t border-border/50">
									<div className="flex items-center justify-between text-xs font-semibold text-foreground">
										<span className="flex items-center gap-1.5 text-accent">
											<Music className="w-3.5 h-3.5" />
											<span>提取成果试听</span>
										</span>
									</div>
									<audio controls src={extractedUrl} className="w-full h-8">
										<track kind="captions" />
									</audio>
								</div>
							)}
						</div>
					</div>

					{/* Feedback Banner */}
					{feedback && (
						<div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
							<Check className="w-4 h-4 shrink-0" />
							<span>{feedback}</span>
						</div>
					)}

					{/* Action Buttons Bar */}
					<div className="flex items-center justify-between flex-wrap gap-3 pt-2">
						<label
							htmlFor="re-upload-video"
							className="px-3.5 py-2 rounded-lg border border-border bg-surface hover:bg-surface/80 text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
						>
							<Upload className="w-3.5 h-3.5 text-muted" />
							<span>更换视频</span>
							<input
								id="re-upload-video"
								type="file"
								accept="video/*"
								onChange={(e) => {
									if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
								}}
								className="sr-only"
							/>
						</label>

						<div className="flex items-center gap-2.5">
							<button
								type="button"
								onClick={handleDownload}
								disabled={!extractedUrl}
								className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-xs font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer shadow-xs"
							>
								<Download className="w-3.5 h-3.5" />
								<span>下载音频文件 (.wav)</span>
							</button>

							<button
								type="button"
								onClick={handleSaveToMaterials}
								disabled={!extractedBlob || isSaving}
								className="px-3.5 py-2 rounded-lg border border-border bg-surface hover:bg-surface/80 text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
							>
								<FolderPlus className="w-3.5 h-3.5 text-accent" />
								<span>{isSaving ? "正在存入..." : "保存至素材库"}</span>
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
