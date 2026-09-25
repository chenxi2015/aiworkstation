import { toast } from "@heroui/react";
import {
	Clock,
	Copy,
	Download,
	ExternalLink,
	FastForward,
	FileText,
	FileVideo,
	Film,
	Maximize2,
	Mic,
	Pause,
	Play,
	Rewind,
	Scissors,
	Sparkles,
	Tag,
	Volume2,
	VolumeX,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { EditorDocument } from "../types";
import type { DocumentMediaInfo } from "../utils/documentMediaKind";

export interface VideoStudioCanvasProps {
	doc: EditorDocument;
	mediaInfo: DocumentMediaInfo;
	onTitleChange?: (title: string) => void;
	onOpenAsDoc?: () => void;
}

export function VideoStudioCanvas({
	doc,
	mediaInfo,
	onTitleChange,
	onOpenAsDoc,
}: VideoStudioCanvasProps) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolume] = useState(1);
	const [isMuted, setIsMuted] = useState(false);
	const [playbackRate, setPlaybackRate] = useState(1);
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [titleValue, setTitleValue] = useState(doc.title);
	const [loadError, setLoadError] = useState(false);

	// Sync title when active document changes
	useEffect(() => {
		setTitleValue(doc.title);
	}, [doc.title]);

	// Auto stop previous video when document switches or unmounts.
	// 注意：不要在 cleanup 里 removeAttribute("src")/load() —— effect 重跑（如开发环境
	// passive effect 重连）会把仍在挂载状态的视频 src 抹掉，导致视频再也无法加载；
	// 文档切换时 key 重挂载会创建新元素，旧元素随 DOM 移除自然释放解码器缓冲。
	useEffect(() => {
		setIsPlaying(false);
		setCurrentTime(0);
		setLoadError(false);
		const el = videoRef.current;
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
		if (!videoRef.current) return;
		if (isPlaying) {
			videoRef.current.pause();
			setIsPlaying(false);
		} else {
			void videoRef.current.play();
			setIsPlaying(true);
		}
	};

	const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
		const target = Number.parseFloat(e.target.value);
		setCurrentTime(target);
		if (videoRef.current) {
			videoRef.current.currentTime = target;
		}
	};

	const handleSkip = (offset: number) => {
		if (!videoRef.current) return;
		const next = Math.max(0, Math.min(duration, currentTime + offset));
		videoRef.current.currentTime = next;
		setCurrentTime(next);
	};

	const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const val = Number.parseFloat(e.target.value);
		setVolume(val);
		setIsMuted(val === 0);
		if (videoRef.current) {
			videoRef.current.volume = val;
		}
	};

	const toggleMute = () => {
		if (!videoRef.current) return;
		if (isMuted) {
			videoRef.current.volume = volume || 0.8;
			setIsMuted(false);
		} else {
			videoRef.current.volume = 0;
			setIsMuted(true);
		}
	};

	const cyclePlaybackRate = () => {
		const rates = [1, 1.25, 1.5, 2];
		const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
		setPlaybackRate(next);
		if (videoRef.current) {
			videoRef.current.playbackRate = next;
		}
	};

	const handleFullscreen = () => {
		if (videoRef.current) {
			if (videoRef.current.requestFullscreen) {
				void videoRef.current.requestFullscreen();
			}
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

	// Secondary creation action triggers (extension slots)
	const handleActionExtractScript = () => {
		toast.info(
			"已触发「提取视频文案」：智能识别视频台词，提炼核心事实送入富文本二次创作！",
		);
	};

	const handleActionRemixVideo = () => {
		toast.info(
			"已预留「视频智能混剪」入口：支持重新编排镜头节奏、去水印与风格滤镜二创！",
		);
	};

	const handleActionVerticalShort = () => {
		toast.info(
			"已预留「重新套版短视频」入口：支持将横屏画面智能裁切转换为 9:16 短视频！",
		);
	};

	const handleCopyUrl = async () => {
		if (!mediaInfo.url) return;
		try {
			await navigator.clipboard.writeText(mediaInfo.url);
			toast.success("已复制视频文件地址");
		} catch {
			toast.danger("复制失败");
		}
	};

	const videoUrl = mediaInfo.url || "";
	const displayFilename = mediaInfo.filename || doc.title;

	return (
		<div className="flex-1 min-h-0 flex flex-col bg-surface dark:bg-zinc-950 overflow-y-auto">
			{/* Top Bar / Header */}
			<header className="px-8 py-5 border-b border-border/70 flex items-center justify-between gap-4 bg-surface/80 backdrop-blur-sm sticky top-0 z-10">
				<div className="flex items-center gap-3 min-w-0">
					<div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0 shadow-sm border border-purple-500/20">
						<FileVideo className="w-5 h-5" />
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
								{doc.title || "未命名视频素材"}
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
								Video
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
						title="复制视频链接"
					>
						<Copy className="w-3.5 h-3.5" />
						<span>复制链接</span>
					</button>
					{videoUrl && (
						<a
							href={videoUrl}
							download={displayFilename}
							className="px-3 py-1.5 text-xs text-purple-500 hover:bg-purple-500/10 rounded-lg transition-colors flex items-center gap-1.5 border border-purple-500/30 font-medium"
						>
							<Download className="w-3.5 h-3.5" />
							<span>下载视频</span>
						</a>
					)}
				</div>
			</header>

			{/* Main Content Area */}
			<div className="flex-1 max-w-4xl w-full mx-auto p-8 flex flex-col gap-6">
				{/* 1. Video Player Container */}
				<div className="rounded-2xl border border-border/80 bg-zinc-950 overflow-hidden shadow-lg flex flex-col relative group">
					{/* Video Viewport */}
					<div
						className="relative aspect-video w-full flex items-center justify-center bg-black cursor-pointer"
						onClick={togglePlay}
					>
						<video
							ref={videoRef}
							src={videoUrl}
							preload="metadata"
							// React 类型尚未为 video 声明 referrerPolicy，运行时 React 19 会透传为 DOM 属性
							{...({
								referrerPolicy: "no-referrer",
							} as React.VideoHTMLAttributes<HTMLVideoElement>)}
							className="w-full h-full object-contain"
							onError={() => setLoadError(true)}
							onLoadedData={() => setLoadError(false)}
							onTimeUpdate={() => {
								if (videoRef.current) {
									setCurrentTime(videoRef.current.currentTime);
								}
							}}
							onLoadedMetadata={() => {
								if (videoRef.current) {
									setDuration(videoRef.current.duration);
								}
							}}
							onEnded={() => setIsPlaying(false)}
						/>

						{/* Center Play Overlay Icon when paused */}
						{!isPlaying && !loadError && (
							<div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px] transition-opacity">
								<div className="w-16 h-16 rounded-full bg-accent/90 text-white flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
									<Play className="w-7 h-7 fill-current ml-1" />
								</div>
							</div>
						)}

						{/* 加载失败提示（外链失效 / 防盗链拦截等） */}
						{loadError && (
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-center px-6">
								<FileVideo className="w-10 h-10 text-zinc-500" />
								<p className="text-sm text-zinc-300">视频加载失败，无法播放</p>
								<p className="text-xs text-zinc-500 max-w-md break-all">
									可能是外部链接已失效或被源站防盗链拦截
								</p>
								{videoUrl && (
									<a
										href={videoUrl}
										target="_blank"
										rel="noreferrer"
										className="mt-1 px-3 py-1.5 text-xs text-accent hover:bg-accent/10 rounded-lg transition-colors flex items-center gap-1.5 border border-accent/30 font-medium"
										onClick={(e) => e.stopPropagation()}
									>
										<ExternalLink className="w-3.5 h-3.5" />
										<span>尝试在新窗口打开</span>
									</a>
								)}
							</div>
						)}
					</div>

					{/* Custom Player Controls Bar */}
					<div className="p-4 bg-zinc-900/90 border-t border-zinc-800 flex flex-col gap-2.5 text-zinc-300">
						{/* Progress Bar */}
						<div className="flex items-center gap-3">
							<span className="text-xs font-mono w-12 text-zinc-400">
								{formatTime(currentTime)}
							</span>
							<input
								type="range"
								min={0}
								max={duration || 100}
								step={0.1}
								value={currentTime}
								onChange={handleSeek}
								className="flex-1 h-1.5 bg-zinc-700/60 rounded-lg appearance-none cursor-pointer accent-accent"
							/>
							<span className="text-xs font-mono w-12 text-right text-zinc-400">
								{formatTime(duration)}
							</span>
						</div>

						{/* Buttons Row */}
						<div className="flex items-center justify-between pt-1">
							<div className="flex items-center gap-3">
								<button
									type="button"
									onClick={togglePlay}
									className="p-1.5 hover:text-white transition-colors"
									title={isPlaying ? "暂停" : "播放"}
								>
									{isPlaying ? (
										<Pause className="w-5 h-5 fill-current" />
									) : (
										<Play className="w-5 h-5 fill-current" />
									)}
								</button>
								<button
									type="button"
									onClick={() => handleSkip(-5)}
									className="p-1.5 hover:text-white transition-colors"
									title="快退 5 秒"
								>
									<Rewind className="w-4 h-4" />
								</button>
								<button
									type="button"
									onClick={() => handleSkip(5)}
									className="p-1.5 hover:text-white transition-colors"
									title="快进 5 秒"
								>
									<FastForward className="w-4 h-4" />
								</button>

								{/* Volume */}
								<div className="flex items-center gap-1.5 ml-2">
									<button
										type="button"
										onClick={toggleMute}
										className="p-1 hover:text-white transition-colors"
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
										className="w-14 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-accent"
									/>
								</div>
							</div>

							<div className="flex items-center gap-3">
								{/* Speed */}
								<button
									type="button"
									onClick={cyclePlaybackRate}
									className="px-2 py-0.5 rounded text-xs font-mono font-medium hover:text-white hover:bg-zinc-800 transition-colors border border-zinc-700"
									title="切换播放倍速"
								>
									{playbackRate}x
								</button>

								{/* Fullscreen */}
								<button
									type="button"
									onClick={handleFullscreen}
									className="p-1.5 hover:text-white transition-colors"
									title="全屏播放"
								>
									<Maximize2 className="w-4 h-4" />
								</button>
							</div>
						</div>
					</div>
				</div>

				{/* 2. Secondary Creation Actions Hub (留出的二次创作口子) */}
				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-2">
						<Sparkles className="w-4 h-4 text-purple-500" />
						<h2 className="text-sm font-semibold text-foreground">
							视频二次创作工作台
						</h2>
						<span className="text-[11px] text-muted">
							（基于当前视频源素材一键派生多种自媒体产物）
						</span>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
						{/* Slot 1: 提取视频文案 */}
						<div
							onClick={handleActionExtractScript}
							className="group p-4 rounded-xl border border-border/80 bg-surface hover:border-purple-500/50 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
						>
							<div>
								<div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
									<Mic className="w-4 h-4" />
								</div>
								<h3 className="text-xs font-semibold text-foreground mb-1 group-hover:text-purple-500 transition-colors">
									提取视频文案与金句
								</h3>
								<p className="text-[11px] text-muted leading-relaxed">
									提取视频原音对白与旁白文案，一键转写并提炼金句，直接送入富文本编辑器二次改写。
								</p>
							</div>
							<div className="mt-3 flex items-center gap-1 text-[11px] text-purple-500 font-medium">
								<span>提取视频文案</span>
								<span>→</span>
							</div>
						</div>

						{/* Slot 2: 智能混剪与二次二创 */}
						<div
							onClick={handleActionRemixVideo}
							className="group p-4 rounded-xl border border-border/80 bg-surface hover:border-purple-500/50 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
						>
							<div>
								<div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
									<Scissors className="w-4 h-4" />
								</div>
								<h3 className="text-xs font-semibold text-foreground mb-1 group-hover:text-purple-500 transition-colors">
									智能混剪与去重重构
								</h3>
								<p className="text-[11px] text-muted leading-relaxed">
									自动识别精彩镜头与转场节点，支持变速、去噪、重新调色与重组分镜。
								</p>
							</div>
							<div className="mt-3 flex items-center gap-1 text-[11px] text-purple-500 font-medium">
								<span>进入混剪模式</span>
								<span>→</span>
							</div>
						</div>

						{/* Slot 3: 重新套版短视频 */}
						<div
							onClick={handleActionVerticalShort}
							className="group p-4 rounded-xl border border-border/80 bg-surface hover:border-purple-500/50 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
						>
							<div>
								<div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
									<Film className="w-4 h-4" />
								</div>
								<h3 className="text-xs font-semibold text-foreground mb-1 group-hover:text-purple-500 transition-colors">
									转为 9:16 竖屏短视频
								</h3>
								<p className="text-[11px] text-muted leading-relaxed">
									将横屏画面重新居中或拆分为三段式卡片，适配抖音、小红书与微信视频号。
								</p>
							</div>
							<div className="mt-3 flex items-center gap-1 text-[11px] text-purple-500 font-medium">
								<span>竖屏短视频套版</span>
								<span>→</span>
							</div>
						</div>
					</div>
				</div>

				{/* 3. Video Asset Metadata details */}
				<div className="p-4 rounded-xl border border-border/60 bg-muted/5 flex items-center justify-between text-xs text-muted">
					<div className="flex items-center gap-2">
						<span className="font-medium text-foreground">素材流地址：</span>
						<span className="font-mono text-[11px] truncate max-w-sm">
							{videoUrl}
						</span>
					</div>
					<div className="flex items-center gap-3">
						<a
							href={videoUrl}
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
