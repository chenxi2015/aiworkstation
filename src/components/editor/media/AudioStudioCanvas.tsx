import { toast } from "@heroui/react";
import {
	Clock,
	Copy,
	Download,
	ExternalLink,
	FastForward,
	FileAudio,
	FileText,
	Mic,
	Pause,
	Play,
	Rewind,
	Sparkles,
	Tag,
	Video,
	Volume2,
	VolumeX,
	Wand2,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { EditorDocument } from "../types";
import type { DocumentMediaInfo } from "../utils/documentMediaKind";

export interface AudioStudioCanvasProps {
	doc: EditorDocument;
	mediaInfo: DocumentMediaInfo;
	onTitleChange?: (title: string) => void;
	onOpenAsDoc?: () => void;
}

export function AudioStudioCanvas({
	doc,
	mediaInfo,
	onTitleChange,
	onOpenAsDoc,
}: AudioStudioCanvasProps) {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolume] = useState(1);
	const [isMuted, setIsMuted] = useState(false);
	const [playbackRate, setPlaybackRate] = useState(1);
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [titleValue, setTitleValue] = useState(doc.title);

	// Sync title when active document changes
	useEffect(() => {
		setTitleValue(doc.title);
	}, [doc.title]);

	// Auto stop previous audio when document switches or unmounts.
	// 同 VideoStudioCanvas：不要在 cleanup 里 removeAttribute("src")/load()，
	// effect 重跑会抹掉仍在挂载状态的音频 src，导致无法加载。
	useEffect(() => {
		setIsPlaying(false);
		setCurrentTime(0);
		const el = audioRef.current;
		return () => {
			el?.pause();
		};
	}, [doc.id, mediaInfo.url]);

	const formatTime = (seconds: number) => {
		if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins.toString().padStart(2, "0")}:${secs
			.toString()
			.padStart(2, "0")}`;
	};

	const togglePlay = () => {
		if (!audioRef.current) return;
		if (isPlaying) {
			audioRef.current.pause();
			setIsPlaying(false);
		} else {
			void audioRef.current.play();
			setIsPlaying(true);
		}
	};

	const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
		const target = Number.parseFloat(e.target.value);
		setCurrentTime(target);
		if (audioRef.current) {
			audioRef.current.currentTime = target;
		}
	};

	const handleSkip = (offset: number) => {
		if (!audioRef.current) return;
		const next = Math.max(0, Math.min(duration, currentTime + offset));
		audioRef.current.currentTime = next;
		setCurrentTime(next);
	};

	const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const val = Number.parseFloat(e.target.value);
		setVolume(val);
		setIsMuted(val === 0);
		if (audioRef.current) {
			audioRef.current.volume = val;
		}
	};

	const toggleMute = () => {
		if (!audioRef.current) return;
		if (isMuted) {
			audioRef.current.volume = volume || 0.8;
			setIsMuted(false);
		} else {
			audioRef.current.volume = 0;
			setIsMuted(true);
		}
	};

	const cyclePlaybackRate = () => {
		const rates = [1, 1.25, 1.5, 2];
		const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
		setPlaybackRate(next);
		if (audioRef.current) {
			audioRef.current.playbackRate = next;
		}
	};

	const handleTitleBlur = () => {
		setIsEditingTitle(false);
		const trimmed = titleValue.trim();
		if (trimmed && trimmed !== doc.title) {
			onTitleChange?.(trimmed);
		} else {
			setTitleValue(doc.title);
		}
	};

	// Secondary creation actions (extension slots)
	const handleActionAsr = () => {
		toast.info("已触发「智能语音转写」，ASR 模块正准备提取音频文本…");
	};

	const handleActionVoiceClone = () => {
		toast.info(
			"已预留「CosyVoice 音色克隆」入口：当前音频可作为参考音色样本进行二次配音！",
		);
	};

	const handleActionVideoRecreate = () => {
		toast.info(
			"已预留「口播视频二创」入口：可一键将本音频旁白串联生成 9:16 短视频！",
		);
	};

	const handleCopyUrl = async () => {
		if (!mediaInfo.url) return;
		try {
			await navigator.clipboard.writeText(mediaInfo.url);
			toast.success("已复制音频文件地址");
		} catch {
			toast.danger("复制失败");
		}
	};

	const audioUrl = mediaInfo.url || "";
	const displayFilename = mediaInfo.filename || doc.title;

	return (
		<div className="flex-1 min-h-0 flex flex-col bg-surface dark:bg-zinc-950 overflow-y-auto">
			{/* Top Bar / Header */}
			<header className="px-8 py-5 border-b border-border/70 flex items-center justify-between gap-4 bg-surface/80 backdrop-blur-sm sticky top-0 z-10">
				<div className="flex items-center gap-3 min-w-0">
					<div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0 shadow-sm border border-accent/20">
						<FileAudio className="w-5 h-5" />
					</div>
					<div className="min-w-0">
						{isEditingTitle ? (
							<input
								type="text"
								value={titleValue}
								autoFocus
								onChange={(e) => setTitleValue(e.target.value)}
								onBlur={handleTitleBlur}
								onKeyDown={(e) => e.key === "Enter" && handleTitleBlur()}
								className="text-lg font-bold text-foreground bg-surface-hover/80 px-2 py-0.5 rounded border border-accent/40 outline-none w-full"
							/>
						) : (
							<h1
								onClick={() => setIsEditingTitle(true)}
								className="text-lg font-bold text-foreground truncate cursor-pointer hover:text-accent transition-colors"
								title="点击修改标题"
							>
								{doc.title || "未命名音频素材"}
							</h1>
						)}
						<div className="flex items-center gap-3 text-xs text-muted mt-0.5">
							{mediaInfo.materialId && (
								<span className="flex items-center gap-1 text-accent font-medium">
									<Tag className="w-3 h-3" />
									素材库 #{mediaInfo.materialId}
								</span>
							)}
							<span className="flex items-center gap-1">
								<Clock className="w-3 h-3" />
								{doc.updatedAt
									? new Date(doc.updatedAt).toLocaleString()
									: "刚刚"}
							</span>
							<span className="px-1.5 py-0.2 bg-muted/15 rounded text-[11px] font-mono text-muted/80">
								Audio
							</span>
						</div>
					</div>
				</div>

				<div className="flex items-center gap-2">
					{onOpenAsDoc && (
						<button
							type="button"
							onClick={onOpenAsDoc}
							className="px-3 py-1.5 text-xs text-muted hover:text-foreground hover:bg-muted/15 rounded-lg transition-colors flex items-center gap-1.5 border border-border/60"
							title="转为富文本创作模式"
						>
							<FileText className="w-3.5 h-3.5" />
							<span>转富文本</span>
						</button>
					)}
					<button
						type="button"
						onClick={handleCopyUrl}
						className="px-3 py-1.5 text-xs text-muted hover:text-foreground hover:bg-muted/15 rounded-lg transition-colors flex items-center gap-1.5 border border-border/60"
						title="复制音频链接"
					>
						<Copy className="w-3.5 h-3.5" />
						<span>复制链接</span>
					</button>
					{audioUrl && (
						<a
							href={audioUrl}
							download={displayFilename}
							className="px-3 py-1.5 text-xs text-accent hover:bg-accent/10 rounded-lg transition-colors flex items-center gap-1.5 border border-accent/30 font-medium"
						>
							<Download className="w-3.5 h-3.5" />
							<span>下载音频</span>
						</a>
					)}
				</div>
			</header>

			{/* Main Content Area */}
			<div className="flex-1 max-w-4xl w-full mx-auto p-8 flex flex-col gap-6">
				{/* Hidden Native Audio Element */}
				<audio
					ref={audioRef}
					src={audioUrl}
					preload="metadata"
					onTimeUpdate={() => {
						if (audioRef.current) {
							setCurrentTime(audioRef.current.currentTime);
						}
					}}
					onLoadedMetadata={() => {
						if (audioRef.current) {
							setDuration(audioRef.current.duration);
						}
					}}
					onEnded={() => setIsPlaying(false)}
				/>

				{/* 1. Main Player Card */}
				<div className="rounded-2xl border border-border/80 bg-gradient-to-b from-surface via-surface to-surface-hover/30 p-8 shadow-sm flex flex-col gap-6 relative overflow-hidden">
					{/* Decorative Waveform Bars in background */}
					<div className="flex items-center justify-center gap-1.5 h-16 w-full opacity-60">
						{Array.from({ length: 32 }).map((_, idx) => {
							const activeHeight = isPlaying
								? `${Math.max(15, Math.sin(idx * 0.4 + currentTime * 4) * 80 + 35)}%`
								: `${Math.max(15, ((idx * 7) % 55) + 15)}%`;
							return (
								<div
									key={idx}
									className="flex-1 max-w-[8px] bg-accent/40 rounded-full transition-all duration-150"
									style={{
										height: activeHeight,
										backgroundColor: isPlaying
											? idx / 32 <= (duration ? currentTime / duration : 0)
												? "var(--accent)"
												: "oklch(var(--accent-val, 0.65) 0.1 240 / 0.3)"
											: undefined,
									}}
								/>
							);
						})}
					</div>

					{/* File Info */}
					<div className="flex items-center justify-between text-xs text-muted">
						<span className="font-mono truncate max-w-md">
							{displayFilename}
						</span>
						<span className="font-mono">
							{formatTime(currentTime)} / {formatTime(duration)}
						</span>
					</div>

					{/* Progress Slider */}
					<div className="flex flex-col gap-1.5">
						<input
							type="range"
							min={0}
							max={duration || 100}
							step={0.1}
							value={currentTime}
							onChange={handleSeek}
							className="w-full h-1.5 bg-muted/20 rounded-lg appearance-none cursor-pointer accent-accent"
						/>
					</div>

					{/* Player Controls */}
					<div className="flex items-center justify-between pt-2">
						{/* Speed Button */}
						<button
							type="button"
							onClick={cyclePlaybackRate}
							className="px-2.5 py-1 rounded-md text-xs font-mono font-medium text-muted hover:text-foreground hover:bg-muted/15 transition-colors border border-border/60"
							title="切换播放倍速"
						>
							{playbackRate}x
						</button>

						{/* Center Playback Buttons */}
						<div className="flex items-center gap-3">
							<button
								type="button"
								onClick={() => handleSkip(-5)}
								className="p-2 text-muted hover:text-foreground hover:bg-muted/15 rounded-full transition-colors"
								title="快退 5 秒"
							>
								<Rewind className="w-5 h-5" />
							</button>

							<button
								type="button"
								onClick={togglePlay}
								className="w-14 h-14 rounded-full bg-accent text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform"
								title={isPlaying ? "暂停" : "播放"}
							>
								{isPlaying ? (
									<Pause className="w-6 h-6 fill-current" />
								) : (
									<Play className="w-6 h-6 fill-current ml-0.5" />
								)}
							</button>

							<button
								type="button"
								onClick={() => handleSkip(5)}
								className="p-2 text-muted hover:text-foreground hover:bg-muted/15 rounded-full transition-colors"
								title="快进 5 秒"
							>
								<FastForward className="w-5 h-5" />
							</button>
						</div>

						{/* Volume Control */}
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={toggleMute}
								className="p-1.5 text-muted hover:text-foreground rounded-lg transition-colors"
								title={isMuted ? "取消静音" : "静音"}
							>
								{isMuted ? (
									<VolumeX className="w-4 h-4 text-danger" />
								) : (
									<Volume2 className="w-4 h-4" />
								)}
							</button>
							<input
								type="range"
								min={0}
								max={1}
								step={0.05}
								value={isMuted ? 0 : volume}
								onChange={handleVolumeChange}
								className="w-16 h-1 bg-muted/20 rounded-lg appearance-none cursor-pointer accent-accent"
							/>
						</div>
					</div>
				</div>

				{/* 2. Secondary Creation Actions Hub (留出的二次创作口子) */}
				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-2">
						<Sparkles className="w-4 h-4 text-accent" />
						<h2 className="text-sm font-semibold text-foreground">
							音频二次创作工作台
						</h2>
						<span className="text-[11px] text-muted">
							（基于当前音频源素材一键派生多种自媒体产物）
						</span>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
						{/* Slot 1: 智能语音转写 */}
						<div
							onClick={handleActionAsr}
							className="group p-4 rounded-xl border border-border/80 bg-surface hover:border-accent/50 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
						>
							<div>
								<div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
									<Mic className="w-4 h-4" />
								</div>
								<h3 className="text-xs font-semibold text-foreground mb-1 group-hover:text-accent transition-colors">
									语音识别转写 ASR
								</h3>
								<p className="text-[11px] text-muted leading-relaxed">
									提取音频完整口播旁白，一键生成结构化文本稿并无缝送入富文本编辑器二次改写。
								</p>
							</div>
							<div className="mt-3 flex items-center gap-1 text-[11px] text-accent font-medium">
								<span>立即提取转写</span>
								<span>→</span>
							</div>
						</div>

						{/* Slot 2: 音色克隆与二次配音 */}
						<div
							onClick={handleActionVoiceClone}
							className="group p-4 rounded-xl border border-border/80 bg-surface hover:border-accent/50 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
						>
							<div>
								<div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
									<Wand2 className="w-4 h-4" />
								</div>
								<h3 className="text-xs font-semibold text-foreground mb-1 group-hover:text-accent transition-colors">
									克隆音色与二次配音
								</h3>
								<p className="text-[11px] text-muted leading-relaxed">
									提取本音频作为 CosyVoice
									参考音色样本，输入新文案即可合成相同声线的全新口播配音。
								</p>
							</div>
							<div className="mt-3 flex items-center gap-1 text-[11px] text-accent font-medium">
								<span>配置音色样本</span>
								<span>→</span>
							</div>
						</div>

						{/* Slot 3: 口播短视频合成 */}
						<div
							onClick={handleActionVideoRecreate}
							className="group p-4 rounded-xl border border-border/80 bg-surface hover:border-accent/50 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
						>
							<div>
								<div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
									<Video className="w-4 h-4" />
								</div>
								<h3 className="text-xs font-semibold text-foreground mb-1 group-hover:text-accent transition-colors">
									一键合成短视频
								</h3>
								<p className="text-[11px] text-muted leading-relaxed">
									将本音频自动切分为场景气口，匹配视觉卡片，一键渲染出
									9:16 竖屏短视频。
								</p>
							</div>
							<div className="mt-3 flex items-center gap-1 text-[11px] text-accent font-medium">
								<span>生成短视频</span>
								<span>→</span>
							</div>
						</div>
					</div>
				</div>

				{/* 3. Audio Asset Metadata details */}
				<div className="p-4 rounded-xl border border-border/60 bg-muted/5 flex items-center justify-between text-xs text-muted">
					<div className="flex items-center gap-2">
						<span className="font-medium text-foreground">素材流地址：</span>
						<span className="font-mono text-[11px] truncate max-w-sm">
							{audioUrl}
						</span>
					</div>
					<div className="flex items-center gap-3">
						<a
							href={audioUrl}
							target="_blank"
							rel="noreferrer"
							className="flex items-center gap-1 hover:text-foreground transition-colors"
						>
							<span>在新标签打开</span>
							<ExternalLink className="w-3 h-3" />
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}
