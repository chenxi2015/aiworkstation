import { Button, Tooltip } from "@heroui/react";
import { ArrowUp, Loader2, Plus, SlidersHorizontal, X } from "lucide-react";
import React, {
	type ChangeEvent,
	type KeyboardEvent,
	useCallback,
	useRef,
	useState,
} from "react";
import type {
	VisualAspectRatio,
	VisualQuality,
	VisualResolution,
} from "../../../types/visualGeneration";
import { SkillSelectedBadge } from "../../common/slash/SkillSelectedBadge";
import { SlashSkillMenu } from "../../common/slash/SlashSkillMenu";
import {
	type SlashItem,
	useSlashSkills,
} from "../../common/slash/useSlashSkills";
import { VisualGenerationParamsPopover } from "../../workbench/ai/visual/VisualGenerationParamsPopover";
import { BatchCountSelector } from "./BatchCountSelector";
import { StylePresetRecommender } from "./StylePresetRecommender";
import type { StylePreset, VisualGeneratorPlatform } from "./types";

interface VisualInputToolbarProps {
	prompt: string;
	onChangePrompt: (prompt: string) => void;
	selectedSkill?: SlashItem | null;
	onSelectSkill: (skill: SlashItem | null) => void;
	selectedPresetId?: string;
	onSelectPreset: (preset: StylePreset) => void;
	aspectRatio: VisualAspectRatio;
	onChangeAspectRatio: (ratio: VisualAspectRatio) => void;
	resolution: VisualResolution;
	onChangeResolution: (res: VisualResolution) => void;
	quality: VisualQuality;
	onChangeQuality: (q: VisualQuality) => void;
	count: number;
	onChangeCount: (count: number) => void;
	referenceImage?: string;
	onChangeReferenceImage: (img?: string) => void;
	isGenerating: boolean;
	onSubmit: () => void;
	platform?: VisualGeneratorPlatform;
	className?: string;
}

export const VisualInputToolbar: React.FC<VisualInputToolbarProps> =
	React.memo(function VisualInputToolbar({
		prompt,
		onChangePrompt,
		selectedSkill,
		onSelectSkill,
		selectedPresetId,
		onSelectPreset,
		aspectRatio,
		onChangeAspectRatio,
		resolution,
		onChangeResolution,
		quality,
		onChangeQuality,
		count,
		onChangeCount,
		referenceImage,
		onChangeReferenceImage,
		isGenerating,
		onSubmit,
		platform = "wechat",
		className = "",
	}) {
		const [slashQuery, setSlashQuery] = useState<string | null>(null);
		const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
		const [slashTriggerPos, setSlashTriggerPos] = useState<number>(-1);

		const textareaRef = useRef<HTMLTextAreaElement>(null);
		const fileInputRef = useRef<HTMLInputElement>(null);

		const { filteredItems: slashCandidates } = useSlashSkills(slashQuery);

		// Handle file select for reference image
		const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = () => {
				if (typeof reader.result === "string") {
					onChangeReferenceImage(reader.result);
				}
			};
			reader.readAsDataURL(file);
			e.target.value = "";
		};

		// Check slash trigger on text change
		const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
			const val = e.target.value;
			onChangePrompt(val);

			const cursorPos = e.target.selectionStart ?? val.length;
			const textBeforeCursor = val.slice(0, cursorPos);
			const lastSlashIndex = textBeforeCursor.lastIndexOf("/");

			if (
				lastSlashIndex !== -1 &&
				(lastSlashIndex === 0 || /\s/.test(val[lastSlashIndex - 1]))
			) {
				const query = textBeforeCursor.slice(lastSlashIndex + 1);
				// If query has space or newline, close menu
				if (/[\s\n]/.test(query)) {
					setSlashQuery(null);
					setSlashTriggerPos(-1);
				} else {
					setSlashQuery(query);
					setSlashTriggerPos(lastSlashIndex);
					setSlashSelectedIndex(0);
				}
			} else {
				setSlashQuery(null);
				setSlashTriggerPos(-1);
			}
		};

		// Select a skill from slash menu
		const handleSelectSlash = useCallback(
			(item: SlashItem) => {
				onSelectSkill(item);
				if (slashTriggerPos !== -1) {
					// Clean up the "/query" part from prompt text
					const beforeSlash = prompt.slice(0, slashTriggerPos);
					const afterSlash = prompt.slice(
						slashTriggerPos + (slashQuery?.length ?? 0) + 1,
					);
					const newPrompt = (beforeSlash + afterSlash).trimStart();
					onChangePrompt(newPrompt);
				}
				setSlashQuery(null);
				setSlashTriggerPos(-1);
				setTimeout(() => textareaRef.current?.focus(), 30);
			},
			[slashTriggerPos, slashQuery, prompt, onSelectSkill, onChangePrompt],
		);

		// Handle keydown for navigation and submission
		const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
			// Intercept for slash menu if open
			if (slashQuery !== null && slashCandidates.length > 0) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					setSlashSelectedIndex((prev) =>
						prev + 1 < slashCandidates.length ? prev + 1 : 0,
					);
					return;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					setSlashSelectedIndex((prev) =>
						prev - 1 >= 0 ? prev - 1 : slashCandidates.length - 1,
					);
					return;
				}
				if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
					e.preventDefault();
					const candidate = slashCandidates[slashSelectedIndex];
					if (candidate) {
						handleSelectSlash(candidate);
					}
					return;
				}
				if (e.key === "Escape") {
					e.preventDefault();
					setSlashQuery(null);
					setSlashTriggerPos(-1);
					return;
				}
			}

			// Enter for quick generation
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				onSubmit();
			}
		};

		return (
			<div
				className={`relative flex flex-col bg-surface border border-border/80 rounded-2xl p-2.5 transition-all shadow-2xs focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15 ${className}`}
			>
				{/* Hidden file input */}
				<input
					ref={fileInputRef}
					type="file"
					accept="image/png,image/jpeg,image/webp"
					className="hidden"
					onChange={handleFileSelect}
				/>

				{/* Upper Input Area */}
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
								onClick={() => onChangeReferenceImage(undefined)}
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
									onClick={() => fileInputRef.current?.click()}
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

					{/* Textarea with Skill token container */}
					<div className="flex-1 flex flex-col justify-center min-h-[44px]">
						{selectedSkill && (
							<div className="mb-1 flex items-center">
								<SkillSelectedBadge
									name={selectedSkill.name}
									onRemove={() => onSelectSkill(null)}
								/>
							</div>
						)}
						<textarea
							ref={textareaRef}
							value={prompt}
							onChange={handleTextChange}
							onKeyDown={handleKeyDown}
							placeholder={
								selectedSkill
									? `已启用 [${selectedSkill.name}] 技能，输入微调要求或直接按回车快速生成...`
									: "描述你想生成的视觉画面（键入 / 调出 skills 风格，留空则根据文章智能规划）..."
							}
							rows={2}
							className="w-full bg-transparent resize-none outline-none text-xs text-foreground placeholder:text-muted/65 leading-relaxed max-h-[100px]"
						/>
					</div>
				</div>

				{/* Slash Skills Dropdown Menu (Anchored right below text input, covering presets & params while keeping text fully visible) */}
				<div className="relative">
					<SlashSkillMenu
						isOpen={slashQuery !== null && slashCandidates.length > 0}
						query={slashQuery || ""}
						items={slashCandidates}
						selectedIndex={slashSelectedIndex}
						onSelectIndexChange={setSlashSelectedIndex}
						onSelect={handleSelectSlash}
						onClose={() => setSlashQuery(null)}
						placement="bottom"
					/>
				</div>

				{/* Style Presets Carousel */}
				<div className="pt-1.5 border-t border-border/40">
					<StylePresetRecommender
						selectedPresetId={selectedPresetId}
						onSelectPreset={onSelectPreset}
					/>
				</div>

				{/* Bottom Toolbar: Parameters & Submit */}
				<div className="flex items-center justify-between gap-2 pt-2 border-t border-border/30">
					{/* Left Settings: Params Popover + Batch Count Selector */}
					<div className="flex items-center gap-2.5 flex-wrap">
						<VisualGenerationParamsPopover
							aspectRatio={aspectRatio}
							resolution={resolution}
							quality={quality}
							onChangeAspectRatio={onChangeAspectRatio}
							onChangeResolution={onChangeResolution}
							onChangeQuality={onChangeQuality}
							trigger={
								<button
									type="button"
									className="inline-flex items-center gap-1.5 px-2.5 py-1 h-7 rounded-full bg-surface-secondary/80 hover:bg-surface-secondary border border-border/70 text-[11px] font-medium text-foreground select-none shrink-0 cursor-pointer transition-all shadow-2xs hover:border-border"
									title="调整尺寸、分辨率与质量"
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

						{/* Batch Count Selector */}
						<BatchCountSelector
							count={count}
							onChangeCount={onChangeCount}
							platform={platform}
						/>
					</div>

					{/* Right Generate Button */}
					<Tooltip>
						<Tooltip.Trigger>
							<Button
								size="sm"
								isIconOnly
								variant="primary"
								isDisabled={isGenerating}
								className="h-7 w-7 rounded-xl flex items-center justify-center cursor-pointer transition-all shadow-xs bg-accent text-accent-foreground hover:opacity-90 shadow-accent/20 shrink-0"
								onPress={onSubmit}
								aria-label="开始生成"
							>
								{isGenerating ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
								)}
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content className="text-xs py-1 px-2">
							{count > 1 ? `一键生成 ${count} 张图文套图 (Enter)` : "生成封面 (Enter)"}
						</Tooltip.Content>
					</Tooltip>
				</div>
			</div>
		);
	});

