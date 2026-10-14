import { Button, toast } from "@heroui/react";
import {
	Check,
	Download,
	Eye,
	Image as ImageIcon,
	Loader2,
	Settings2,
	Sparkles,
	Upload,
	X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { requestAiCoverImages } from "../../../services/api/publishClient";
import { WorkbenchStorageService } from "../../../services/workbenchStorage";
import { SettingsModal } from "../../workbench/SettingsModal";
import { CoverCard } from "../CoverCard";
import {
	CARD_THEMES,
	COVER_SPECS,
	captureElementToDataUrl,
} from "../cardExporter";
import { triggerFileDownload } from "../exporters";
import type { CardTheme, CoverPlatform } from "../types";

export interface CoverItem {
	id: string;
	url: string;
	ratioLabel: string;
	prompt?: string;
}

export interface CoverStylePreset {
	id: string;
	label: string;
	description: string;
	promptSuffix: string;
	fallbackTheme: CardTheme;
}

const COVER_STYLE_PRESETS: CoverStylePreset[] = [
	{
		id: "editorial",
		label: "杂志大片",
		description: "高端画报排版与影棚质感摄影",
		promptSuffix:
			"modern editorial magazine cover, Vogue style, elegant composition, studio softbox lighting, clean aesthetics, award winning photography",
		fallbackTheme: "minimal-light",
	},
	{
		id: "minimal-tech",
		label: "极简科技",
		description: "未来主义几何、流动微光渐变",
		promptSuffix:
			"minimalist high-tech aesthetic, sleek abstract geometry, futuristic iridescent gradients, subtle neon glows, clean glassmorphism, Apple design",
		fallbackTheme: "geek-dark",
	},
	{
		id: "3d-render",
		label: "3D 质感",
		description: "粘土模型、C4D 柔和立体渲染",
		promptSuffix:
			"cute modern 3D clay render, C4D Octane style, smooth soft matte shading, vibrant clean pastel colors, isometric angle, depth of field",
		fallbackTheme: "vibrant-gradient",
	},
	{
		id: "vector-art",
		label: "扁平插画",
		description: "现代矢量线条、和谐色彩版画",
		promptSuffix:
			"contemporary editorial flat vector illustration, clean lines, bold harmonious colors, creative graphic design poster",
		fallbackTheme: "redbook",
	},
	{
		id: "eastern-ink",
		label: "国风水墨",
		description: "东方意境留白与水彩泼墨",
		promptSuffix:
			"traditional oriental Chinese ink wash painting with modern design, poetic ethereal atmosphere, watercolor strokes, misty mountains, artistic negative space",
		fallbackTheme: "vintage-paper",
	},
	{
		id: "cyberpunk",
		label: "赛博霓虹",
		description: "高对比度霓虹光影与夜景未来感",
		promptSuffix:
			"cyberpunk futuristic nightscape, moody neon rim lights, holographic reflections, high contrast cinematic sci-fi atmosphere",
		fallbackTheme: "geek-dark",
	},
	{
		id: "vintage-film",
		label: "复古胶片",
		description: "35mm 暖调颗粒与怀旧光影",
		promptSuffix:
			"warm vintage 35mm film photograph, nostalgic grain, Kodachrome color tone, cinematic golden hour sunlight, retro magazine aesthetic",
		fallbackTheme: "vintage-paper",
	},
	{
		id: "cinematic",
		label: "电影写实",
		description: "纪实大光圈、大师级构图与光影",
		promptSuffix:
			"cinematic realism, commercial documentary photography, natural depth, atmospheric lens flare, hyper-detailed, 8k",
		fallbackTheme: "minimal-dark",
	},
];

interface CoverSectionProps {
	title: string;
	contentText: string;
	authorName: string;
	covers: CoverItem[];
	selectedCoverIndex: number;
	onSelectCover: (index: number) => void;
	onCoversChange: (covers: CoverItem[]) => void;
}

export type CoverAspectRatio = "16:9" | "3:4" | "1:1" | "4:3";

export interface AspectRatioPreset {
	id: CoverAspectRatio;
	label: string;
	platformDesc: string;
	platform: CoverPlatform;
}

export const ASPECT_RATIO_PRESETS: AspectRatioPreset[] = [
	{
		id: "16:9",
		label: "16:9 横版",
		platformDesc: "微信公众号 · 视频横版",
		platform: "wechat",
	},
	{
		id: "3:4",
		label: "3:4 竖版",
		platformDesc: "小红书图文 · 抖音短篇",
		platform: "redbook",
	},
	{
		id: "1:1",
		label: "1:1 方形",
		platformDesc: "朋友圈 · 头条 · 通用",
		platform: "bilibili",
	},
	{
		id: "4:3",
		label: "4:3 比例",
		platformDesc: "经典博客 · 专栏头图",
		platform: "douyin",
	},
];

const FALLBACK_THEMES: CardTheme[] = [
	"minimal-light",
	"geek-dark",
	"redbook",
	"vintage-paper",
];

export function CoverSection({
	title,
	contentText,
	authorName,
	covers,
	selectedCoverIndex,
	onSelectCover,
	onCoversChange,
}: CoverSectionProps) {
	const [isGenerating, setIsGenerating] = useState(false);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [selectedStyleId, setSelectedStyleId] = useState<string>("editorial");
	const [selectedRatio, setSelectedRatio] = useState<CoverAspectRatio>("16:9");
	const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

	const selectedStyle =
		COVER_STYLE_PRESETS.find((s) => s.id === selectedStyleId) ??
		COVER_STYLE_PRESETS[0];

	const selectedRatioPreset =
		ASPECT_RATIO_PRESETS.find((r) => r.id === selectedRatio) ??
		ASPECT_RATIO_PRESETS[0];

	// Hidden container for DOM-based cover card rendering fallback
	const renderContainerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Generate 4 typographic/template covers based on the chosen aspect ratio
	const generateFallbackCovers = useCallback(async (): Promise<CoverItem[]> => {
		if (!renderContainerRef.current) return [];
		const nodes = Array.from(
			renderContainerRef.current.children,
		) as HTMLElement[];
		const results: CoverItem[] = [];

		for (let i = 0; i < nodes.length; i++) {
			try {
				const dataUrl = await captureElementToDataUrl(nodes[i], 2);
				results.push({
					id: `template-cover-${Date.now()}-${i}`,
					url: dataUrl,
					ratioLabel: `${selectedRatioPreset.label} · 方案 ${i + 1}`,
				});
			} catch (err) {
				console.warn("[CoverSection] Render template cover failed:", err);
			}
		}
		return results;
	}, [selectedRatioPreset.label]);

	// Auto-generate template covers on first open if empty
	useEffect(() => {
		if (covers.length === 0) {
			const timer = setTimeout(() => {
				generateFallbackCovers().then((initialCovers) => {
					if (initialCovers.length > 0) {
						onCoversChange(initialCovers);
					}
				});
			}, 100);
			return () => clearTimeout(timer);
		}
	}, [generateFallbackCovers, covers.length, onCoversChange]);

	// Generate 4 covers based on selected preset style and unified aspect ratio
	const handleGenerateCovers = async () => {
		setIsGenerating(true);
		try {
			const settings = WorkbenchStorageService.getSettings();
			const hasApiKey = Boolean(settings.imageApiKey?.trim());

			if (hasApiKey) {
				toast.info(`正在按「${selectedStyle.label}」风格与「${selectedRatioPreset.label}」生成 4 张封面...`);
				const res = await requestAiCoverImages({
					title,
					contentText,
					style: selectedStyle.promptSuffix,
					aspectRatio: selectedRatio,
					configOverrides: {
						provider: settings.imageProvider,
						apiKey: settings.imageApiKey,
						baseUrl: settings.imageBaseUrl,
						model: settings.imageModel,
					},
				});

				if (res.aiGenerated && res.images.length > 0) {
					onCoversChange(res.images);
					onSelectCover(0);
					toast.success(`已生成 4 张「${selectedRatioPreset.label}」风格封面图`);
					return;
				}
				if (res.error) {
					toast.warning(`${res.error}，已切换为精美排版封面`);
				}
			} else {
				// Guide user to settings modal directly if imageApiKey is missing
				toast.info("尚未配置生图 API 密钥，已自动打开设置窗口");
				setIsSettingsOpen(true);
			}

			// Fallback: Generate typographic styled covers using unified aspect ratio
			const fallback = await generateFallbackCovers();
			if (fallback.length > 0) {
				onCoversChange(fallback);
				onSelectCover(0);
				if (!hasApiKey) {
					toast.success(`已生成 4 张「${selectedRatioPreset.label}」排版封面供您预览`);
				}
			} else {
				toast.warning("封面生成未返回结果，请手动上传图片");
			}
		} catch (err) {
			console.error("[CoverSection] generate error:", err);
			const fallback = await generateFallbackCovers();
			if (fallback.length > 0) {
				onCoversChange(fallback);
				onSelectCover(0);
			}
			toast.warning("已切换为精美排版封面");
		} finally {
			setIsGenerating(false);
		}
	};

	// Handle local image file upload
	const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			const newCover: CoverItem = {
				id: `uploaded-${Date.now()}`,
				url: dataUrl,
				ratioLabel: "本地上传",
			};
			const updated = [newCover, ...covers.slice(0, 3)];
			onCoversChange(updated);
			onSelectCover(0);
			toast.success("已添加本地封面图片");
		};
		reader.readAsDataURL(file);
		e.target.value = "";
	};

	// Download cover image safely supporting both data URLs and remote URLs
	const handleDownloadCover = async (coverUrl: string, filename: string) => {
		try {
			if (coverUrl.startsWith("data:")) {
				const link = document.createElement("a");
				link.href = coverUrl;
				link.download = filename;
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				return;
			}
			const res = await fetch(coverUrl);
			if (!res.ok) throw new Error(String(res.status));
			const blob = await res.blob();
			triggerFileDownload(filename, blob);
		} catch (err) {
			console.error("[CoverSection] Download cover failed:", err);
			const link = document.createElement("a");
			link.href = coverUrl;
			link.download = filename;
			link.rel = "noopener";
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		}
	};

	return (
		<div className="space-y-3">
			{/* Section Header with Actions */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<ImageIcon className="w-4 h-4 text-accent" />
					<span className="text-sm font-semibold text-foreground">
						封面图生成与管理
					</span>
					<span className="text-xs text-muted">
						（基于选定比例生成 4 张候选，点击选定）
					</span>
				</div>
				<div className="flex items-center gap-1.5">
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="rounded-lg h-8 px-2.5 text-xs text-muted hover:text-foreground"
						onPress={() => setIsSettingsOpen(true)}
					>
						<Settings2 className="w-3.5 h-3.5 mr-1" />
						配置
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="rounded-lg h-8 px-2.5 text-muted hover:text-foreground"
						onPress={() => fileInputRef.current?.click()}
					>
						<Upload className="w-3.5 h-3.5 mr-1" />
						上传
					</Button>
					<Button
						type="button"
						size="sm"
						className="rounded-lg h-8 px-3 text-xs font-medium bg-foreground text-background hover:bg-foreground/90 shadow-sm flex items-center gap-1.5 transition-all"
						isDisabled={isGenerating}
						onPress={handleGenerateCovers}
					>
						{isGenerating ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<Sparkles className="w-3.5 h-3.5" />
						)}
						<span>{isGenerating ? "生成中..." : "一键生成 4 张"}</span>
					</Button>
				</div>
			</div>

			{/* Unified Aspect Ratio & Style Selector Panel */}
			<div className="flex flex-col gap-2.5 p-3 rounded-xl border border-border/70 bg-surface-secondary/20">
				{/* 1. Aspect Ratio Selector */}
				<div className="flex flex-col gap-1.5">
					<div className="flex items-center justify-between text-xs px-0.5">
						<span className="text-[11px] font-medium text-foreground flex items-center gap-1">
							<span>统一封面长宽比：</span>
							<span className="text-accent font-semibold">{selectedRatioPreset.label}</span>
							<span className="text-muted/60">·</span>
							<span className="text-muted text-[11px]">{selectedRatioPreset.platformDesc}</span>
						</span>
						<span className="text-[10px] text-muted">点击切换目标平台预设</span>
					</div>

					<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
						{ASPECT_RATIO_PRESETS.map((preset) => {
							const isSelected = preset.id === selectedRatio;
							return (
								<button
									key={preset.id}
									type="button"
									onClick={() => setSelectedRatio(preset.id)}
									className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex flex-col gap-0.5 border text-left ${
										isSelected
											? "bg-accent/10 border-accent/60 text-accent shadow-xs"
											: "bg-surface/50 border-border/70 text-muted hover:text-foreground hover:border-border"
									}`}
								>
									<div className="flex items-center justify-between w-full">
										<span className="font-semibold">{preset.label}</span>
										{isSelected && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
									</div>
									<span className="text-[10px] opacity-70 truncate">{preset.platformDesc}</span>
								</button>
							);
						})}
					</div>
				</div>

				<div className="h-px bg-border/40 w-full" />

				{/* 2. Style Presets */}
				<div className="flex flex-col gap-1.5">
					<div className="flex items-center justify-between text-xs px-0.5">
						<span className="text-[11px] font-medium text-muted flex items-center gap-1">
							<span>预设生图风格：</span>
							<span className="text-foreground font-semibold">
								{selectedStyle.label}
							</span>
							<span className="text-muted/60">·</span>
							<span className="text-muted text-[11px]">
								{selectedStyle.description}
							</span>
						</span>
					</div>

					<div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
						{COVER_STYLE_PRESETS.map((preset) => {
							const isSelected = preset.id === selectedStyleId;
							return (
								<button
									key={preset.id}
									type="button"
									onClick={() => setSelectedStyleId(preset.id)}
									className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 border ${
										isSelected
											? "bg-accent/10 border-accent/60 text-accent shadow-xs"
											: "bg-surface/50 border-border/70 text-muted hover:text-foreground hover:border-border"
									}`}
								>
									{isSelected && (
										<span className="w-1.5 h-1.5 rounded-full bg-accent" />
									)}
									<span>{preset.label}</span>
								</button>
							);
						})}
					</div>
				</div>
			</div>

			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				className="hidden"
				onChange={handleFileUpload}
			/>

			{/* Settings Modal - Opens Media Tab directly */}
			{isSettingsOpen && (
				<SettingsModal
					isOpen={isSettingsOpen}
					onClose={() => setIsSettingsOpen(false)}
					initialTab="media"
				/>
			)}

			{/* 4 Square Cover Images Grid */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
				{[0, 1, 2, 3].map((idx) => {
					const cover = covers[idx];
					const hasImage = Boolean(cover?.url);
					const isSelected = selectedCoverIndex === idx && hasImage;

					return (
						/* biome-ignore lint/a11y/useSemanticElements: Contains nested action buttons */
						<div
							key={cover?.id || `cover-slot-${idx}`}
							role="button"
							tabIndex={0}
							onClick={() => hasImage && onSelectCover(idx)}
							onKeyDown={(e) => {
								if ((e.key === "Enter" || e.key === " ") && hasImage) {
									e.preventDefault();
									onSelectCover(idx);
								}
							}}
							className={`group relative rounded-xl overflow-hidden border transition-all duration-200 aspect-square flex flex-col items-center justify-center select-none ${
								hasImage
									? isSelected
										? "border-accent ring-2 ring-accent/30 shadow-md bg-surface"
										: "border-border/80 hover:border-foreground/40 hover:shadow-sm bg-surface cursor-pointer"
									: "border-dashed border-border/80 bg-surface-secondary/30"
							}`}
						>
							{/* Cover Image or Empty Placeholder */}
							{hasImage ? (
								<img
									src={cover.url}
									alt={`封面 ${idx + 1}`}
									className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
								/>
							) : (
								<div className="flex flex-col items-center justify-center gap-1.5 p-3 text-muted/50">
									<ImageIcon className="w-8 h-8 stroke-[1.25]" />
									<span className="text-[11px] font-medium text-muted/70">
										{`${selectedRatioPreset.label} · 方案 ${idx + 1}`}
									</span>
								</div>
							)}

							{/* Loading Overlay */}
							{isGenerating && (
								<div className="absolute inset-0 z-20 bg-background/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 p-2 text-center animate-in fade-in duration-200">
									<div className="relative flex items-center justify-center">
										<div className="w-8 h-8 rounded-full border-2 border-accent/20 border-t-accent animate-spin" />
										<Sparkles className="w-3.5 h-3.5 text-accent absolute" />
									</div>
									<div className="flex flex-col items-center">
										<span className="text-xs font-medium text-foreground">AI 构图中</span>
										<span className="text-[10px] text-muted">
											{`${selectedRatioPreset.label} · 方案 ${idx + 1}`}
										</span>
									</div>
								</div>
							)}

							{/* Selected Badge */}
							{isSelected && !isGenerating && (
								<div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-accent text-accent-foreground text-[10px] font-semibold flex items-center gap-1 shadow-sm backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
									<Check className="w-3 h-3 stroke-[3]" />
									<span>已选为封面</span>
								</div>
							)}

							{/* Dimension Label (Bottom Left) */}
							{!isGenerating && (
								<div className="absolute bottom-2 left-2 z-10 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-white text-[10px] font-mono tracking-tight shadow-xs">
									{cover?.ratioLabel || `${selectedRatioPreset.label} · 方案 ${idx + 1}`}
								</div>
							)}

							{/* Hover Overlay Actions (Preview / Download) */}
							{hasImage && !isGenerating && (
								<div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10">
									<button
										type="button"
										title="放大查看"
										onClick={(e) => {
											e.stopPropagation();
											setPreviewImageUrl(cover.url);
										}}
										className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white backdrop-blur-xs transition cursor-pointer"
									>
										<Eye className="w-3.5 h-3.5" />
									</button>
									<button
										type="button"
										title="下载封面"
										onClick={(e) => {
											e.stopPropagation();
											handleDownloadCover(
												cover.url,
												`cover-${idx + 1}-${Date.now()}.png`,
											);
										}}
										className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white backdrop-blur-xs transition cursor-pointer"
									>
										<Download className="w-3.5 h-3.5" />
									</button>
								</div>
							)}
						</div>
					);
				})}
			</div>

			{/* Fullscreen/Modal Image Preview */}
			{previewImageUrl && (
				<div
					role="dialog"
					aria-modal="true"
					tabIndex={-1}
					onClick={() => setPreviewImageUrl(null)}
					onKeyDown={(e) => {
						if (e.key === "Escape") setPreviewImageUrl(null);
					}}
					className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in"
				>
					<div
						tabIndex={-1}
						role="document"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
						className="relative max-w-3xl max-h-[85vh] rounded-2xl overflow-hidden shadow-2xl border border-white/10"
					>
						<img
							src={previewImageUrl}
							alt="封面预览"
							className="w-full h-full object-contain"
						/>
						<button
							type="button"
							onClick={() => setPreviewImageUrl(null)}
							className="absolute top-3 right-3 p-1.5 rounded-full bg-black/70 text-white hover:bg-black transition"
						>
							<X className="w-4 h-4" />
						</button>
					</div>
				</div>
			)}

			{/* Offscreen Container for Typographic Fallback Cards */}
			<div
				ref={renderContainerRef}
				style={{
					position: "absolute",
					top: -99999,
					left: -99999,
					visibility: "hidden",
					pointerEvents: "none",
				}}
			>
				{FALLBACK_THEMES.map((theme, i) => (
					<CoverCard
						key={`fallback-${selectedRatio}-${theme}-${i}`}
						spec={COVER_SPECS[selectedRatioPreset.platform]}
						theme={CARD_THEMES[theme] || CARD_THEMES["minimal-light"]}
						title={title}
						author={authorName}
						summary={contentText.slice(0, 100)}
					/>
				))}
			</div>
		</div>
	);
}
