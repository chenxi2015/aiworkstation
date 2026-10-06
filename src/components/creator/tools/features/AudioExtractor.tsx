import {
	AlertCircle,
	Check,
	CheckCircle2,
	Download,
	FileUp,
	Music,
	Play,
	SlidersHorizontal,
	Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { uploadMaterialFiles } from "../../../../server/functions/creatorMaterials";
import { ToolBottomDock, ToolHeader } from "../components";
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
	onSaveToMaterials?: (resultInfo: string) => void;
	onSendToStudio?: () => void;
}

/**
 * Interactive Video Audio Extractor workspace aligned with ToolWorkspace layout standards.
 * Features:
 * - Unified Fixed Top Header matching standard creator tools
 * - Dual-pane responsive body: Left for file upload & options, Right for video preview & extracted audio
 * - Unified Fixed Bottom Action Dock
 */
export function AudioExtractor({
	tool,
	onSaveToMaterials,
	onSendToStudio,
}: AudioExtractorProps) {
	const [videoFile, setVideoFile] = useState<File | null>(null);
	const [videoUrl, setVideoUrl] = useState<string | null>(null);
	const [isExtracting, setIsExtracting] = useState(false);
	const [extractedBlob, setExtractedBlob] = useState<Blob | null>(null);
	const [extractedUrl, setExtractedUrl] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const videoRef = useRef<HTMLVideoElement | null>(null);

	// Revoke object URLs on cleanup
	useEffect(() => {
		return () => {
			if (videoUrl) URL.revokeObjectURL(videoUrl);
			if (extractedUrl) URL.revokeObjectURL(extractedUrl);
		};
	}, [videoUrl, extractedUrl]);

	const handleFileSelect = (file: File) => {
		if (!file.type.startsWith("video/")) {
			setErrorMessage("请上传视频格式文件 (如 MP4, MOV, WebM, MKV)");
			return;
		}
		setVideoFile(file);
		setStatusMessage(null);
		setErrorMessage(null);
		setExtractedBlob(null);
		setExtractedUrl(null);
		const url = URL.createObjectURL(file);
		setVideoUrl(url);
	};

	const handleExtractAudio = async () => {
		if (!videoFile) {
			setErrorMessage("请先上传视频文件");
			return;
		}
		setIsExtracting(true);
		setStatusMessage(null);
		setErrorMessage(null);

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
			setStatusMessage("音频提取成功！可直接在线试听、下载或保存至素材库。");
		} catch (err: unknown) {
			const msg =
				err instanceof Error
					? err.message
					: "提取失败，视频文件中可能没有可用的音轨或编码格式暂不支持";
			setErrorMessage(msg);
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
			setStatusMessage("已成功将提取的音频存入「素材库」！");
			onSaveToMaterials?.(tool.name);
		} catch (err) {
			console.error("Failed to save audio material", err);
			setErrorMessage("保存失败，请稍后重试");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative">
			{/* Top Header Bar */}
			<ToolHeader tool={tool} />

			{/* ── Scrollable Body Area (Dual-Pane Layout) ── */}
			<div className="flex-1 min-h-0 overflow-y-auto p-5">
				<div className="max-w-7xl mx-auto space-y-4">
					{/* Status / Error feedback banners */}
					{statusMessage && (
						<div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200">
							<div className="flex items-center gap-2">
								<Check className="w-4 h-4 shrink-0" />
								<span>{statusMessage}</span>
							</div>
							<button
								type="button"
								onClick={() => setStatusMessage(null)}
								className="text-xs hover:opacity-75 cursor-pointer"
							>
								关闭
							</button>
						</div>
					)}

					{errorMessage && (
						<div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200">
							<div className="flex items-center gap-2">
								<AlertCircle className="w-4 h-4 shrink-0" />
								<span>{errorMessage}</span>
							</div>
							<button
								type="button"
								onClick={() => setErrorMessage(null)}
								className="text-xs hover:opacity-75 cursor-pointer"
							>
								关闭
							</button>
						</div>
					)}

					{/* Dual-Pane Grid */}
					<div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
						{/* Left Column: Video Dropzone & Parameters (5 cols) */}
						<div className="lg:col-span-5 space-y-4">
							{/* File Dropzone Card */}
							<div className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-3">
								<div className="flex items-center justify-between">
									<h2 className="text-xs font-bold text-foreground flex items-center gap-1.5">
										<FileUp className="w-3.5 h-3.5 text-accent" />
										<span>输入视频素材</span>
									</h2>
									{videoFile && (
										<span className="text-[10px] text-muted font-mono">
											{(videoFile.size / (1024 * 1024)).toFixed(2)} MB
										</span>
									)}
								</div>

								{!videoFile ? (
									<label
										htmlFor="audio-extractor-upload"
										className="border-2 border-dashed border-border/80 hover:border-accent/60 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-background/50 hover:bg-background block group"
									>
										<div className="w-11 h-11 rounded-full bg-accent/10 text-accent flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
											<Upload className="w-5 h-5" />
										</div>
										<p className="text-xs font-semibold text-foreground mb-1">
											点击或拖拽视频到此处
										</p>
										<p className="text-[11px] text-muted">
											支持 MP4, MOV, WebM, MKV 等常见视频格式
										</p>
										<input
											id="audio-extractor-upload"
											type="file"
											accept="video/*"
											className="sr-only"
											onChange={(e) => {
												if (e.target.files?.[0]) {
													handleFileSelect(e.target.files[0]);
												}
											}}
										/>
									</label>
								) : (
									<div className="p-3.5 rounded-lg border border-border/70 bg-background/60 flex items-center justify-between gap-3">
										<div className="min-w-0 flex items-center gap-2.5">
											<div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
												<Music className="w-4 h-4" />
											</div>
											<div className="min-w-0">
												<p className="text-xs font-medium text-foreground truncate">
													{videoFile.name}
												</p>
												<p className="text-[10px] text-muted font-mono">
													{(videoFile.size / (1024 * 1024)).toFixed(2)} MB •{" "}
													{videoFile.type || "视频"}
												</p>
											</div>
										</div>

										<label
											htmlFor="change-audio-extractor-upload"
											className="px-2.5 py-1.5 rounded-md border border-border bg-surface hover:bg-surface/80 text-[11px] text-muted hover:text-foreground cursor-pointer transition-colors shrink-0"
										>
											更换
											<input
												id="change-audio-extractor-upload"
												type="file"
												accept="video/*"
												className="sr-only"
												onChange={(e) => {
													if (e.target.files?.[0]) {
														handleFileSelect(e.target.files[0]);
													}
												}}
											/>
										</label>
									</div>
								)}
							</div>

							{/* Options & Extraction Strategy Card */}
							<div className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-3.5">
								<h2 className="text-xs font-bold text-foreground flex items-center gap-1.5">
									<SlidersHorizontal className="w-3.5 h-3.5 text-accent" />
									<span>提取配置参数</span>
								</h2>

								<div className="space-y-3">
									<div className="space-y-1.5">
										<label
											htmlFor="extractor-format"
											className="text-[11px] font-medium text-muted block"
										>
											输出音频格式
										</label>
										<div
											id="extractor-format"
											className="w-full p-2.5 rounded-lg border border-border bg-background/50 text-xs text-foreground flex items-center justify-between font-mono"
										>
											<span className="font-semibold text-accent">
												WAV (16-bit PCM 无损)
											</span>
											<span className="text-[10px] text-muted">推荐高保真</span>
										</div>
									</div>

									<div className="space-y-1.5">
										<span className="text-[11px] font-medium text-muted block">
											处理引擎模式
										</span>
										<div className="p-2.5 rounded-lg border border-border bg-background/50 text-xs text-muted space-y-1">
											<div className="flex items-center justify-between text-foreground">
												<span>浏览器硬件解码</span>
												<span className="text-emerald-500 text-[10px] font-mono">
													纯离线运行
												</span>
											</div>
											<p className="text-[10px] text-muted leading-relaxed">
												音频流完全在本地 Web Audio
												环境中解析重编码，零文件泄露风险，极速毫秒响应。
											</p>
										</div>
									</div>
								</div>
							</div>
						</div>

						{/* Right Column: Source & Extracted Preview (7 cols) */}
						<div className="lg:col-span-7 space-y-4">
							<div className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-3.5">
								<div className="flex items-center justify-between">
									<h2 className="text-xs font-bold text-foreground flex items-center gap-1.5">
										<Play className="w-3.5 h-3.5 text-accent" />
										<span>预览视窗与成果试听</span>
									</h2>
									{extractedUrl && (
										<span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
											音频已就绪
										</span>
									)}
								</div>

								{/* Video Preview Player */}
								{videoUrl ? (
									<div className="space-y-3">
										<div className="relative aspect-video rounded-xl overflow-hidden bg-black/90 flex items-center justify-center border border-border/80">
											<video
												ref={videoRef}
												src={videoUrl}
												controls
												className="max-h-full max-w-full"
											>
												<track kind="captions" />
											</video>
										</div>

										{/* Extracted Audio Player Card */}
										{extractedUrl ? (
											<div className="p-4 rounded-xl border border-accent/30 bg-accent/5 space-y-3 animate-in fade-in duration-200">
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-2">
														<div className="w-7 h-7 rounded-lg bg-accent/20 text-accent flex items-center justify-center">
															<Music className="w-4 h-4" />
														</div>
														<div>
															<p className="text-xs font-bold text-foreground">
																已提取高保真音频轨
															</p>
															<p className="text-[10px] text-muted font-mono">
																格式: WAV • 大小:{" "}
																{extractedBlob
																	? (
																			extractedBlob.size /
																			(1024 * 1024)
																		).toFixed(2)
																	: "0.00"}{" "}
																MB
															</p>
														</div>
													</div>

													<button
														type="button"
														onClick={handleDownload}
														className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
													>
														<Download className="w-3.5 h-3.5" />
														<span>下载 .wav</span>
													</button>
												</div>

												<div className="pt-1">
													<audio
														controls
														src={extractedUrl}
														className="w-full h-9 rounded-lg"
													>
														<track kind="captions" />
													</audio>
												</div>
											</div>
										) : (
											<div className="p-4 rounded-xl border border-dashed border-border/70 bg-background/40 flex items-center justify-between">
												<div className="space-y-0.5">
													<p className="text-xs font-semibold text-foreground">
														等待提取音频
													</p>
													<p className="text-[11px] text-muted">
														已就绪源视频，请点击底部「开始提取音频」
													</p>
												</div>
											</div>
										)}
									</div>
								) : (
									<div className="aspect-video rounded-xl border-2 border-dashed border-border/70 bg-background/40 flex flex-col items-center justify-center text-center p-6 space-y-3">
										<div className="w-12 h-12 rounded-2xl bg-muted/10 text-muted flex items-center justify-center">
											<Music className="w-6 h-6" />
										</div>
										<div className="space-y-1">
											<p className="text-xs font-semibold text-foreground">
												暂无待处理媒体
											</p>
											<p className="text-[11px] text-muted max-w-xs">
												在左侧选择或上传视频素材后，将在此处提供视频回放及独立音轨试听
											</p>
										</div>
									</div>
								)}

								{/* Footnote details */}
								{extractedBlob && (
									<div className="p-3 rounded-lg bg-surface border border-border/50 flex items-center justify-between text-xs text-muted flex-wrap gap-2">
										<div className="flex items-center gap-1.5">
											<CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
											<span className="text-foreground font-medium truncate max-w-xs">
												{videoFile?.name.replace(/\.[^/.]+$/, "")}_audio.wav
											</span>
										</div>
										<div className="flex items-center gap-3 text-[11px] font-mono">
											<span>
												大小: {(extractedBlob.size / (1024 * 1024)).toFixed(2)}{" "}
												MB
											</span>
											<span>状态: 已提取</span>
										</div>
									</div>
								)}
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Fixed Bottom Control Dock */}
			<ToolBottomDock
				isProcessing={isExtracting}
				hintMessage={
					extractedUrl
						? "音频已提取成功，随时可下载或存入素材库"
						: videoFile
							? "已载入视频，点击「开始提取音频」进行本地硬件解码"
							: "请先在左侧选择或拖拽需要提取音频的短视频文件"
				}
				onExecute={handleExtractAudio}
				executeLabel="开始提取音频"
				executeDisabled={!videoFile}
				onSaveToMaterials={handleSaveToMaterials}
				saveToMaterialsDisabled={!extractedBlob || isSaving}
				onSendToStudio={onSendToStudio}
			/>
		</div>
	);
}
