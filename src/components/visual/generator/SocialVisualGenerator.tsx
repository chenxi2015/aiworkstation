import { Tooltip, toast } from "@heroui/react";
import {
	Check,
	Download,
	FileText,
	Image as ImageIcon,
	Maximize2,
	Plus,
	Sparkles,
	Trash2,
} from "lucide-react";
import React, {
	type ChangeEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { requestVisualStoryboardPlan } from "../../../services/api/publishClient";
import { requestVisualImageGeneration } from "../../../services/api/visualGenClient";
import type {
	VisualAspectRatio,
	VisualQuality,
	VisualResolution,
} from "../../../types/visualGeneration";
import type { SlashItem } from "../../common/slash/useSlashSkills";
import { triggerFileDownload } from "../../editor/exporters";
import type { CoverItem } from "../../editor/publish-center/types";
import { useImagePreview } from "../../workbench/ai/shared/ImagePreviewModal";
import type {
	SocialVisualGeneratorProps,
	StylePreset,
	VisualCoverCardItem,
} from "./types";
import { VisualInputToolbar } from "./VisualInputToolbar";

/**
 * Decoupled AI Social Visual Generator Component.
 * Supports platform-adaptive batch counts, Slash Skills (/), open style presets,
 * and multi-card carousel storyboarding (Redbook) or single punchy cover (WeChat).
 */
export const SocialVisualGenerator: React.FC<SocialVisualGeneratorProps> =
	React.memo(function SocialVisualGenerator({
		title,
		contentText,
		digest = "",
		platform = "wechat",
		covers,
		selectedCoverIndex,
		selectedCoverIndices,
		defaultRatio = "16:9",
		defaultCount,
		onSelectCover,
		onSelectCovers,
		onCoversChange,
		className = "",
	}) {
		const isRedbook = platform === "redbook";
		const initialCount = defaultCount ?? (isRedbook ? 0 : 1);

		// Multi-selection indices for Redbook. Strictly respect user selection (even if empty [])
		const effectiveIndices = useMemo(() => {
			if (!isRedbook) {
				return selectedCoverIndex >= 0 ? [selectedCoverIndex] : [];
			}
			// When parent provides an array (even if empty []), strictly respect user's explicit choice!
			if (Array.isArray(selectedCoverIndices)) {
				return selectedCoverIndices;
			}
			// Only when undefined (uninitialized initial state), default to all covers
			return covers.map((_, i) => i);
		}, [isRedbook, selectedCoverIndices, selectedCoverIndex, covers]);

		// Toggle select-all state (max 9 cards for Redbook)
		const maxSelectable = Math.min(covers.length, 9);
		const isAllSelected = covers.length > 0 && effectiveIndices.length >= maxSelectable;

		const handleToggleSelectAll = useCallback(() => {
			if (isAllSelected) {
				onSelectCovers?.([]);
			} else {
				const all = covers.map((_, i) => i).slice(0, 9);
				onSelectCovers?.(all);
				if (all.length > 0) {
					onSelectCover(all[0]);
				}
			}
		}, [isAllSelected, covers, onSelectCovers, onSelectCover]);

		const [prompt, setPrompt] = useState("");
		const [count, setCount] = useState<number>(initialCount);
		const [aspectRatio, setAspectRatio] =
			useState<VisualAspectRatio>(defaultRatio);
		const [resolution, setResolution] = useState<VisualResolution>("2K");
		const [quality, setQuality] = useState<VisualQuality>("High");
		const [isGenerating, setIsGenerating] = useState(false);
		const [progressText, setProgressText] = useState<string | null>(null);

		const [selectedSkill, setSelectedSkill] = useState<SlashItem | null>(null);
		const [selectedPreset, setSelectedPreset] = useState<StylePreset | null>(
			null,
		);
		const [referenceImage, setReferenceImage] = useState<string | undefined>(
			undefined,
		);

		const coverFileInputRef = useRef<HTMLInputElement>(null);
		const { openPreview } = useImagePreview();

		// Sync ratio and count when platform changes, unless user manually customized
		useEffect(() => {
			setAspectRatio(defaultRatio);
			if (defaultCount !== undefined) {
				setCount(defaultCount);
			} else {
				setCount(isRedbook ? 0 : 1);
			}
		}, [defaultRatio, defaultCount, isRedbook]);

		// Select a style preset
		const handleSelectPreset = useCallback(
			(preset: StylePreset) => {
				if (selectedPreset?.id === preset.id) {
					setSelectedPreset(null);
				} else {
					setSelectedPreset(preset);
				}
			},
			[selectedPreset],
		);

		// Main generation flow
		const handleGenerate = async () => {
			if (isGenerating) return;

			setIsGenerating(true);
			const skillPrefix = selectedSkill ? `结合「${selectedSkill.name}」` : "";
			setProgressText(
				count > 0
					? `正在${skillPrefix}规划 ${count} 张图文视觉分镜...`
					: `正在${skillPrefix}根据文章内容自主规划图文分镜...`,
			);

			try {
				// 1. Synthesize style modifier from user prompt, skill and selected preset
				const styleElements: string[] = [];
				if (selectedPreset) {
					styleElements.push(selectedPreset.promptModifier);
				}
				if (prompt.trim()) {
					styleElements.push(prompt.trim());
				}
				const customStylePrompt = styleElements.join("，");

				// 2. Request AI Storyboard Planning
				const storyboardRes = await requestVisualStoryboardPlan({
					title,
					contentText,
					digest,
					platform,
					count: count > 0 ? count : undefined,
					customStylePrompt: customStylePrompt || undefined,
					skillName: selectedSkill?.name,
					skillDirPath: selectedSkill?.skill?.dirPath,
				});

				const cards = storyboardRes.cards || [];
				if (cards.length === 0) {
					toast.warning("未规划出有效的分镜卡片，请稍后重试");
					return;
				}

				setProgressText(`正在生成全套图文 (0/${cards.length})...`);

				// 3. Render cards concurrently with progress updates
				let completed = 0;
				const generatedItems: VisualCoverCardItem[] = [];

				const renderCard = async (
					card: (typeof cards)[0],
				): Promise<VisualCoverCardItem | null> => {
					try {
						const res = await requestVisualImageGeneration({
							prompt: card.prompt,
							mediaType: "image",
							aspectRatio,
							resolution,
							quality,
							referenceImage,
						});

						completed++;
						setProgressText(
							`正在生成全套图文 (${completed}/${cards.length})...`,
						);

						if (res.success && res.images && res.images.length > 0) {
							const img = res.images[0];
							return {
								id: img.id || `visual-${Date.now()}-${card.pageIndex}`,
								url: img.url,
								ratioLabel: img.aspectRatio || aspectRatio,
								prompt: card.prompt,
								roleLabel: card.roleLabel,
								pageIndex: card.pageIndex,
								headline: card.headline,
								subHeadline: card.subHeadline,
							};
						}
					} catch (err) {
						console.warn(`Render card P${card.pageIndex} error:`, err);
					}
					return null;
				};

				// Generate all cards concurrently
				const results = await Promise.all(cards.map(renderCard));
				for (const item of results) {
					if (item) generatedItems.push(item);
				}

				if (generatedItems.length > 0) {
					const merged = [...generatedItems, ...covers];
					onCoversChange(merged);
					onSelectCover(0);
					if (isRedbook) {
						// Auto-select all newly generated images for Redbook
						const newSelected = generatedItems.map((_, i) => i);
						onSelectCovers?.(newSelected);
					}
					toast.success(
						isRedbook && generatedItems.length > 1
							? (count === 0
								? `AI 已自主规划并生成 ${generatedItems.length} 张图文套图！已默认全部勾选`
								: `已成功生成小红书 ${generatedItems.length} 张图文套图！已默认全部勾选`)
							: "已成功生成自媒体封面图",
					);
				} else {
					toast.warning("图片生成服务未返回结果，请检查视觉模型配置");
				}
			} catch (err) {
				toast.danger(
					`视觉生成失败：${err instanceof Error ? err.message : String(err)}`,
				);
			} finally {
				setIsGenerating(false);
				setProgressText(null);
			}
		};

		// Handle cover selection (single-choice for WeChat, multi-choice ordered list for Redbook)
		const handleClickCover = (idx: number) => {
			if (!isRedbook) {
				onSelectCover(idx);
				return;
			}

			const isIncluded = effectiveIndices.includes(idx);
			let nextIndices: number[];
			if (isIncluded) {
				nextIndices = effectiveIndices.filter((i) => i !== idx);
			} else {
				if (effectiveIndices.length >= 9) {
					toast.warning("小红书图文单篇最多支持选择 9 张图片");
					return;
				}
				nextIndices = [...effectiveIndices, idx];
			}

			onSelectCovers?.(nextIndices);
			if (nextIndices.length > 0) {
				onSelectCover(nextIndices[0]);
			}
		};

		// Handle manual local file upload
		const handleCoverFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;

			if (!file.type.startsWith("image/")) {
				toast.warning("请上传 PNG、JPG 或 WEBP 格式图片");
				return;
			}

			const reader = new FileReader();
			reader.onload = () => {
				if (typeof reader.result === "string") {
					const uploadedItem: VisualCoverCardItem = {
						id: `upload-${Date.now()}`,
						url: reader.result,
						ratioLabel: "手动上传",
						isUploaded: true,
					};
					const updated = [uploadedItem, ...covers];
					onCoversChange(updated);
					onSelectCover(0);
					if (isRedbook) {
						// Prepend uploaded image index
						const newSelected = [
							0,
							...effectiveIndices.map((i) => i + 1),
						].slice(0, 9);
						onSelectCovers?.(newSelected);
					}
					toast.success("本地图片已设为封面");
				}
			};
			reader.readAsDataURL(file);
			e.target.value = "";
		};

		// Delete a cover
		const handleDeleteCover = (index: number) => {
			const updated = covers.filter((_, idx) => idx !== index);
			onCoversChange(updated);
			if (isRedbook) {
				const nextSelected = effectiveIndices
					.filter((i) => i !== index)
					.map((i) => (i > index ? i - 1 : i));
				onSelectCovers?.(nextSelected);
			}
			if (selectedCoverIndex >= updated.length) {
				onSelectCover(Math.max(0, updated.length - 1));
			}
		};

		// Download cover
		const handleDownloadCover = async (cover: CoverItem) => {
			try {
				const res = await fetch(cover.url);
				const blob = await res.blob();
				const filename = `cover_${title.slice(0, 10).replace(/[^\w\u4e00-\u9fa5]/g, "_")}_${Date.now()}.png`;
				triggerFileDownload(filename, blob);
				toast.success("已开始下载原图");
			} catch {
				toast.danger("下载失败，可能是跨域资源限制");
			}
		};

		// Insert Markdown snippet
		const handleInsertToDoc = async (url: string) => {
			const snippet = `\n![${title || "配图"}](${url})\n`;
			try {
				await navigator.clipboard.writeText(snippet);
				toast.info("已复制 Markdown 图像语法到剪贴板");
			} catch {
				toast.warning("复制失败");
			}
		};

		return (
			<div className={`flex flex-col gap-3.5 ${className}`}>
				{/* Hidden file input for manual cover upload */}
				<input
					ref={coverFileInputRef}
					type="file"
					accept="image/png,image/jpeg,image/webp,image/gif"
					className="hidden"
					onChange={handleCoverFileSelect}
				/>

				{/* Header Info - Clean & Uncrowded */}
				<div className="flex items-center gap-2">
					<ImageIcon className="w-3.5 h-3.5 text-accent" />
					<span className="text-xs font-semibold text-foreground">
						{isRedbook ? "小红书图文与封面套图" : "自媒体封面与配图生成"}
					</span>
				</div>

				{/* Visual Input & Generation Toolbar */}
				<VisualInputToolbar
					prompt={prompt}
					onChangePrompt={setPrompt}
					selectedSkill={selectedSkill}
					onSelectSkill={setSelectedSkill}
					selectedPresetId={selectedPreset?.id}
					onSelectPreset={handleSelectPreset}
					aspectRatio={aspectRatio}
					onChangeAspectRatio={setAspectRatio}
					resolution={resolution}
					onChangeResolution={setResolution}
					quality={quality}
					onChangeQuality={setQuality}
					count={count}
					onChangeCount={setCount}
					referenceImage={referenceImage}
					onChangeReferenceImage={setReferenceImage}
					isGenerating={isGenerating}
					onSubmit={handleGenerate}
					platform={platform}
				/>

				{/* Status & Gallery Action Bar - Below input toolbar */}
				<div className="flex items-center justify-between min-h-[22px] px-0.5 text-xs">
					{/* Left: Generation progress or Candidate stats */}
					<div className="flex items-center gap-2 min-w-0 mr-2">
						{progressText ? (
							<div className="flex items-center gap-1.5 text-xs text-accent animate-pulse font-medium truncate">
								<Sparkles className="w-3.5 h-3.5 shrink-0" />
								<span className="truncate">{progressText}</span>
							</div>
						) : (
							<span className="text-[11px] text-muted truncate">
								{covers.length > 0 ? (
									isRedbook ? (
										<>
											共 <strong className="text-foreground font-semibold">{covers.length}</strong> 张候选，已选 <strong className="text-accent font-semibold">{effectiveIndices.length}</strong> 张发布
										</>
									) : (
										<>
											已有 <strong className="text-foreground font-semibold">{covers.length}</strong> 张图片候选
										</>
									)
								) : (
									"暂无候选图片"
								)}
							</span>
						)}
					</div>

					{/* Right: Single toggle button between Select All and Unselect All */}
					{isRedbook && covers.length > 0 && (
						<button
							type="button"
							onClick={handleToggleSelectAll}
							className="text-[11px] text-accent hover:underline cursor-pointer font-medium shrink-0"
						>
							{isAllSelected ? "取消全选" : "全选"}
						</button>
					)}
				</div>

				{/* Candidate Gallery */}
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-0.5">
					{/* Upload Card */}
					<div
						onClick={() => coverFileInputRef.current?.click()}
						className="aspect-square rounded-xl border border-dashed border-border/90 hover:border-accent hover:bg-accent/5 flex flex-col items-center justify-center gap-1.5 text-muted hover:text-accent transition-all cursor-pointer p-2 text-center group"
					>
						<div className="w-7 h-7 rounded-full bg-surface-secondary flex items-center justify-center group-hover:bg-accent/15 transition-colors">
							<Plus className="w-4 h-4" />
						</div>
						<span className="text-[11px] font-medium">手动上传本地图</span>
						<span className="text-[10px] text-muted/70 scale-90">
							支持 PNG/JPG
						</span>
					</div>

					{/* Candidate Cover Cards */}
					{covers.map((cover, idx) => {
						const isSelectedSingle = selectedCoverIndex === idx;
						const orderIndex = effectiveIndices.indexOf(idx);
						const isSelectedMulti = orderIndex !== -1;
						const isSelected = isRedbook ? isSelectedMulti : isSelectedSingle;

						return (
							<div
								key={cover.id || idx}
								onClick={() => handleClickCover(idx)}
								className={`relative aspect-square rounded-xl overflow-hidden border cursor-pointer group transition-all ${
									isSelected
										? "border-accent ring-2 ring-accent/30 shadow-xs"
										: "border-border hover:border-foreground/40 opacity-75 hover:opacity-100"
								}`}
							>
								<img
									src={cover.url}
									alt={`配图 ${idx + 1}`}
									className="w-full h-full object-cover"
								/>

								{/* Redbook Order Number Badge or WeChat Cover Badge */}
								{isRedbook ? (
									isSelected ? (
										<div className="absolute top-1.5 left-1.5 min-w-[20px] h-5 px-1 rounded-md bg-accent text-accent-foreground text-[11px] font-bold flex items-center justify-center shadow-xs pointer-events-none">
											{orderIndex + 1}
										</div>
									) : (
										<div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-md border border-white/60 bg-black/40 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none text-xs font-semibold">
											+
										</div>
									)
								) : (
									isSelected && (
										<div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-accent text-accent-foreground text-[10px] font-semibold flex items-center gap-1 shadow-xs pointer-events-none">
											<Check className="w-2.5 h-2.5 stroke-[3]" />
											<span>封面</span>
										</div>
									)
								)}

								{/* Only show badge for uploaded images to keep screen clean */}
								{cover.isUploaded && (
									<div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[10px] text-white font-medium pointer-events-none">
										本地上传
									</div>
								)}

								{/* Hover Floating Actions */}
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
														subtitle: `${(cover as VisualCoverCardItem).roleLabel || cover.ratioLabel || defaultRatio} · 预览`,
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
												aria-label="插入正文"
											>
												<FileText className="w-3.5 h-3.5" />
											</button>
										</Tooltip.Trigger>
										<Tooltip.Content className="text-xs py-1 px-2">
											插入正文
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
	});

