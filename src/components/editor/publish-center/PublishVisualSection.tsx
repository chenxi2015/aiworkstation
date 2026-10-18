import { Button, Tooltip, toast } from "@heroui/react";
import {
	ArrowUp,
	Check,
	Copy,
	Download,
	FileText,
	Image as ImageIcon,
	Loader2,
	Maximize2,
	Plus,
	SlidersHorizontal,
	Sparkles,
	Trash2,
	X,
} from "lucide-react";
import { type ChangeEvent, type KeyboardEvent, useRef, useState } from "react";
import { requestVisualImageGeneration } from "../../../services/api/visualGenClient";
import type {
	VisualAspectRatio,
	VisualQuality,
	VisualResolution,
} from "../../../types/visualGeneration";
import { useImagePreview } from "../../workbench/ai/shared/ImagePreviewModal";
import { VisualGenerationParamsPopover } from "../../workbench/ai/visual/VisualGenerationParamsPopover";
import { triggerFileDownload } from "../exporters";
import type { CoverItem } from "./types";

interface PublishVisualSectionProps {
	title: string;
	contentText: string;
	digest: string;
	covers: CoverItem[];
	selectedCoverIndex: number;
	onSelectCover: (index: number) => void;
	onCoversChange: (covers: CoverItem[]) => void;
	defaultRatio?: VisualAspectRatio;
}

/**
 * Build viral poster prompt inspired by VisualEmptyState design presets.
 * Renders bold typography headline + subtitle + contextual background.
 */
function buildViralPosterPrompt(
	title: string,
	digest: string,
	contentText: string,
): string {
	const cleanTitle = title.replace(/[《》"']/g, "").trim() || "精选文章";
	// Extract a punchy headline (up to 12 chars) as the primary creative typography text
	let headline = cleanTitle;
	if (cleanTitle.includes("：") || cleanTitle.includes(":")) {
		const parts = cleanTitle.split(/[:：]/);
		headline = parts[parts.length - 1].trim() || parts[0].trim();
	} else if (cleanTitle.includes("·") || cleanTitle.includes("-")) {
		const parts = cleanTitle.split(/[·\-]/);
		headline = parts[parts.length - 1].trim() || cleanTitle;
	}
	if (headline.length > 12) {
		headline = headline.slice(0, 10);
	}

	const seed = digest.trim() || contentText.slice(0, 80).trim();
	const subtitleText = seed ? seed.slice(0, 12) : "深度拆解·实操指南";

	return `自媒体封面设计，商业海报级排版，画面视觉中心突出创意艺术字体设计“${headline}”，采用现代立体粗壮美术字，笔画利落醒目，色彩对比强烈；上方或角落搭配副标题“${subtitleText}”；背景融合与文章意境相契合的高级质感场景，极简空间与流动微光，景深柔和虚化，整体极具视觉冲击力与自媒体点击欲望，专业设计总监水准。`;
}

/**
 * Publish visual section combining AI prompt generation, parameter settings,
 * local image upload and candidate cover management.
 */
export function PublishVisualSection({
	title,
	contentText,
	digest,
	covers,
	selectedCoverIndex,
	onSelectCover,
	onCoversChange,
	defaultRatio = "16:9",
}: PublishVisualSectionProps) {
	const [prompt, setPrompt] = useState("");
	const [aspectRatio, setAspectRatio] = useState<VisualAspectRatio>(defaultRatio);
	const [resolution, setResolution] = useState<VisualResolution>("2K");
	const [quality, setQuality] = useState<VisualQuality>("High");
	const [isGenerating, setIsGenerating] = useState(false);
	const { openPreview } = useImagePreview();
	const [referenceImage, setReferenceImage] = useState<string | undefined>(
		undefined,
	);

	const referenceFileInputRef = useRef<HTMLInputElement>(null);
	const coverFileInputRef = useRef<HTMLInputElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Suggest prompt based on current article title & digest following viral cover principles
	const handleSuggestPrompt = () => {
		const suggestion = buildViralPosterPrompt(title, digest, contentText);
		setPrompt(suggestion);
		textareaRef.current?.focus();
	};

	// Generate cover image via AI backend (Unified with Visual AI assistant)
	const handleGenerate = async () => {
		// User-supplied prompt takes absolute precedence; fallback to viral poster prompt only when empty
		const trimmedPrompt = prompt.trim();
		const effectivePrompt =
			trimmedPrompt || buildViralPosterPrompt(title, digest, contentText);

		if (isGenerating) return;

		setIsGenerating(true);
		try {
			const res = await requestVisualImageGeneration({
				prompt: effectivePrompt,
				mediaType: "image",
				aspectRatio,
				resolution,
				quality,
				referenceImage,
			});

			if (res.success && res.images && res.images.length > 0) {
				const newCovers: CoverItem[] = res.images.map((item, idx) => ({
					id: item.id || `visual-${Date.now()}-${idx}`,
					url: item.url,
					ratioLabel: item.aspectRatio || aspectRatio,
					prompt: res.prompt || effectivePrompt,
				}));

				const merged = [...newCovers, ...covers];
				onCoversChange(merged);
				onSelectCover(0); // Select the newly generated cover
				toast.success("已成功生成自媒体封面图");
			} else {
				toast.warning(res.error || "未生成有效图片，请稍后重试");
			}
		} catch (err) {
			toast.danger(`生图失败：${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setIsGenerating(false);
		}
	};

	// Handle Enter key for fast generation
	const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleGenerate();
		}
	};

	// Handle reference image select for image-to-image generation
	const handleReferenceFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === "string") {
				setReferenceImage(reader.result);
			}
		};
		reader.readAsDataURL(file);
		e.target.value = "";
	};

	const handleRemoveReferenceImage = () => {
		setReferenceImage(undefined);
	};

	// Handle manual cover file upload directly from user's machine
	const handleCoverFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		if (!file.type.startsWith("image/")) {
			toast.warning("请上传格式为 PNG、JPG、WEBP 的图片文件");
			return;
		}

		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === "string") {
				const uploadedItem: CoverItem = {
					id: `upload-${Date.now()}`,
					url: reader.result,
					ratioLabel: "手动上传",
					isUploaded: true,
				};
				const updated = [uploadedItem, ...covers];
				onCoversChange(updated);
				onSelectCover(0);
				toast.success("本地图片已成功设为封面");
			}
		};
		reader.readAsDataURL(file);
		e.target.value = "";
	};

	// Remove a cover from the candidates list
	const handleDeleteCover = (index: number) => {
		const updated = covers.filter((_, idx) => idx !== index);
		onCoversChange(updated);
		if (selectedCoverIndex >= updated.length) {
			onSelectCover(Math.max(0, updated.length - 1));
		}
	};

	// Download cover image to disk
	const handleDownloadCover = async (cover: CoverItem) => {
		try {
			const res = await fetch(cover.url);
			const blob = await res.blob();
			const filename = `cover_${title.slice(0, 10).replace(/[^\w\u4e00-\u9fa5]/g, "_")}_${Date.now()}.png`;
			triggerFileDownload(filename, blob);
			toast.success("已开始下载封面原图");
		} catch {
			toast.danger("下载图片失败，可能是跨域资源限制");
		}
	};

	// Copy image URL
	const handleCopyUrl = async (url: string) => {
		try {
			await navigator.clipboard.writeText(url);
			toast.success("已复制图片链接到剪贴板");
		} catch {
			toast.warning("复制链接失败");
		}
	};

	// Copy Markdown snippet for inserting into doc
	const handleInsertToDoc = async (url: string) => {
		const snippet = `\n![${title || "封面配图"}](${url})\n`;
		try {
			await navigator.clipboard.writeText(snippet);
			toast.info("已复制 Markdown 图像语法到剪贴板，可粘贴至正文");
		} catch {
			toast.warning("复制到剪贴板失败");
		}
	};

	const canSend = !isGenerating;

	return (
		<div className="flex flex-col gap-3">
			{/* Hidden file input for reference image upload (image-to-image) */}
			<input
				ref={referenceFileInputRef}
				type="file"
				accept="image/png,image/jpeg,image/webp"
				className="hidden"
				onChange={handleReferenceFileSelect}
			/>

			{/* Hidden file input for manual cover upload */}
			<input
				ref={coverFileInputRef}
				type="file"
				accept="image/png,image/jpeg,image/webp,image/gif"
				className="hidden"
				onChange={handleCoverFileSelect}
			/>

			{/* Section Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<ImageIcon className="w-3.5 h-3.5 text-accent" />
					<span className="text-xs font-semibold text-foreground">
						封面图与配图生成
					</span>
					<span className="text-[11px] text-muted">
						{covers.length > 0 ? `(已有 ${covers.length} 张候选)` : "(暂未设置封面)"}
					</span>
				</div>
				<button
					type="button"
					onClick={handleSuggestPrompt}
					className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline cursor-pointer"
				>
					<Sparkles className="w-3 h-3" />
					<span>填入建议提示词</span>
				</button>
			</div>

			{/* AI Visual Generation Input Box (Aligned with Visual tab interaction) */}
			<div className="relative flex flex-col bg-surface border border-border/80 rounded-2xl p-2.5 transition-all shadow-2xs focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15">
				{/* Upper: Reference Image Box + Prompt Textarea */}
				<div className="flex items-start gap-2.5 min-h-[46px]">
					{/* Reference Image Box or Add Button */}
					{referenceImage ? (
						<div className="relative group shrink-0 w-10 h-10 rounded-xl overflow-hidden border border-border/80 shadow-xs">
							<img
								src={referenceImage}
								alt="参考图"
								className="w-full h-full object-cover"
							/>
							<button
								type="button"
								onClick={handleRemoveReferenceImage}
								className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity cursor-pointer"
								title="移除参考图"
							>
								<X className="w-2.5 h-2.5" />
							</button>
						</div>
					) : (
						<Tooltip>
							<Tooltip.Trigger>
								<button
									type="button"
									onClick={() => referenceFileInputRef.current?.click()}
									className="w-10 h-10 rounded-xl border border-dashed border-border/80 hover:border-accent hover:bg-surface-secondary/60 flex items-center justify-center text-muted hover:text-foreground transition-all cursor-pointer shrink-0"
									aria-label="上传参考图"
								>
									<Plus className="w-4 h-4" />
								</button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-xs py-1 px-2">
								上传参考图（以图生图）
							</Tooltip.Content>
						</Tooltip>
					)}

					{/* Textarea */}
					<textarea
						ref={textareaRef}
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={
							referenceImage
								? "结合参考图描述修改细节或新风格，按回车快速生成..."
								: "描述你想生成的封面画面（留空则基于文章标题智能生成），按回车快速生成..."
						}
						rows={2}
						className="flex-1 bg-transparent resize-none outline-none text-xs text-foreground placeholder:text-muted/65 leading-relaxed min-h-[44px] max-h-[100px]"
					/>
				</div>

				{/* Bottom Toolbar: Parameters Popover + Submit Button */}
				<div className="flex items-center justify-between gap-1.5 pt-1.5 mt-1 border-t border-border/40">
					{/* Left: Aspect Ratio & Quality Popover */}
					<div className="flex items-center gap-2">
						<VisualGenerationParamsPopover
							aspectRatio={aspectRatio}
							resolution={resolution}
							quality={quality}
							onChangeAspectRatio={setAspectRatio}
							onChangeResolution={setResolution}
							onChangeQuality={setQuality}
							trigger={
								<button
									type="button"
									className="inline-flex items-center gap-1.5 px-2.5 py-1 h-7 rounded-full bg-surface-secondary/80 hover:bg-surface-secondary border border-border/70 text-[11px] font-medium text-foreground select-none shrink-0 cursor-pointer transition-all shadow-2xs hover:border-border"
									title="调整导出参数（宽高比、分辨率与质量）"
								>
									<SlidersHorizontal className="w-3 h-3 text-muted shrink-0" />
									<span className="font-semibold text-foreground/90">
										{aspectRatio}
									</span>
									<span className="text-muted/60">|</span>
									<span>{resolution}</span>
									<span className="text-muted/60">|</span>
									<span className="truncate max-w-[45px]">{quality}</span>
								</button>
							}
						/>
					</div>

					{/* Right: Generate Submit Button */}
					<Tooltip>
						<Tooltip.Trigger>
							<Button
								size="sm"
								isIconOnly
								variant="primary"
								isDisabled={!canSend}
								className="h-7 w-7 rounded-xl flex items-center justify-center cursor-pointer transition-all shadow-xs bg-accent text-accent-foreground hover:opacity-90 shadow-accent/20"
								onPress={handleGenerate}
								aria-label="开始生成封面"
							>
								{isGenerating ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
								)}
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content className="text-xs py-1 px-2">
							生成封面 (Enter)
						</Tooltip.Content>
					</Tooltip>
				</div>
			</div>

			{/* Cover Candidate Gallery & Upload Card */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
				{/* Upload Card for direct cover */}
				<div
					onClick={() => coverFileInputRef.current?.click()}
					className="aspect-video sm:aspect-4/3 rounded-xl border border-dashed border-border/90 hover:border-accent hover:bg-accent/5 flex flex-col items-center justify-center gap-1.5 text-muted hover:text-accent transition-all cursor-pointer p-2 text-center group"
				>
					<div className="w-7 h-7 rounded-full bg-surface-secondary flex items-center justify-center group-hover:bg-accent/15 transition-colors">
						<Plus className="w-4 h-4" />
					</div>
					<span className="text-[11px] font-medium">手动上传本地图</span>
					<span className="text-[10px] text-muted/70 scale-90">支持 PNG/JPG</span>
				</div>

				{/* Candidate Cover Cards */}
				{covers.map((cover, idx) => {
					const isSelected = selectedCoverIndex === idx;
					return (
						<div
							key={cover.id || idx}
							onClick={() => onSelectCover(idx)}
							className={`relative aspect-video sm:aspect-4/3 rounded-xl overflow-hidden border cursor-pointer group transition-all ${
								isSelected
									? "border-accent ring-2 ring-accent/30 shadow-xs"
									: "border-border hover:border-foreground/40 opacity-80 hover:opacity-100"
							}`}
						>
							<img
								src={cover.url}
								alt={`封面 ${idx + 1}`}
								className="w-full h-full object-cover"
							/>

							{/* Ratio / Upload Badge */}
							<div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/65 backdrop-blur-xs text-[10px] text-white font-medium pointer-events-none">
								{cover.ratioLabel || "封面"}
							</div>

							{/* Selected Indicator Badge */}
							{isSelected && (
								<div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground text-[10px] font-semibold flex items-center gap-1 shadow-xs">
									<Check className="w-2.5 h-2.5 stroke-[3]" />
									<span>当前封面</span>
								</div>
							)}

							{/* Hover Quick Action Floating Pill (Aligned with VisualChatTurnItem in Visual AI) */}
							<div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/65 backdrop-blur-md p-0.5 rounded-full shadow-md z-10">
								<Tooltip>
									<Tooltip.Trigger>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												openPreview({
													src: cover.url,
													title: cover.prompt || title,
													subtitle: `${cover.ratioLabel || defaultRatio} · 封面原图预览`,
												});
											}}
											className="p-1 rounded-full text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
											aria-label="放大查看"
										>
											<Maximize2 className="w-3.5 h-3.5" />
										</button>
									</Tooltip.Trigger>
									<Tooltip.Content className="text-xs py-1 px-2">
										放大查看
									</Tooltip.Content>
								</Tooltip>

								<Tooltip>
									<Tooltip.Trigger>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												handleInsertToDoc(cover.url);
											}}
											className="p-1 rounded-full text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
											aria-label="插入当前文档"
										>
											<FileText className="w-3.5 h-3.5" />
										</button>
									</Tooltip.Trigger>
									<Tooltip.Content className="text-xs py-1 px-2">
										插入当前文档
									</Tooltip.Content>
								</Tooltip>

								<Tooltip>
									<Tooltip.Trigger>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												handleCopyUrl(cover.url);
											}}
											className="p-1 rounded-full text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
											aria-label="复制链接"
										>
											<Copy className="w-3.5 h-3.5" />
										</button>
									</Tooltip.Trigger>
									<Tooltip.Content className="text-xs py-1 px-2">
										复制链接
									</Tooltip.Content>
								</Tooltip>

								<Tooltip>
									<Tooltip.Trigger>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												handleDownloadCover(cover);
											}}
											className="p-1 rounded-full text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
											aria-label="下载图片"
										>
											<Download className="w-3.5 h-3.5" />
										</button>
									</Tooltip.Trigger>
									<Tooltip.Content className="text-xs py-1 px-2">
										下载图片
									</Tooltip.Content>
								</Tooltip>

								<Tooltip>
									<Tooltip.Trigger>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												handleDeleteCover(idx);
											}}
											className="p-1 rounded-full text-white/80 hover:text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
											aria-label="移除此图片"
										>
											<Trash2 className="w-3.5 h-3.5" />
										</button>
									</Tooltip.Trigger>
									<Tooltip.Content className="text-xs py-1 px-2">
										移除此图片
									</Tooltip.Content>
								</Tooltip>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

