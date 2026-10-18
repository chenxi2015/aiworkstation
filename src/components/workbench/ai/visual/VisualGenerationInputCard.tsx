import { Button, Tooltip } from "@heroui/react";
import {
	ArrowUp,
	Loader2,
	Plus,
	SlidersHorizontal,
	X,
} from "lucide-react";
import {
	type ChangeEvent,
	type KeyboardEvent,
	memo,
	useEffect,
	useRef,
	useState,
} from "react";
import type {
	VisualAspectRatio,
	VisualMediaType,
	VisualQuality,
	VisualResolution,
} from "../../../../types/visualGeneration.ts";
import { VisualGenerationParamsPopover } from "./VisualGenerationParamsPopover.tsx";

export interface VisualGenerationInputCardProps {
	isGenerating?: boolean;
	externalPrompt?: string;
	onGenerate: (payload: {
		prompt: string;
		mediaType: VisualMediaType;
		aspectRatio: string;
		resolution: string;
		quality?: VisualQuality;
		duration?: number;
		referenceImage?: string;
	}) => void;
}

/**
 * Visual Generation Input Card for text/image-to-image creation.
 * Note: Full multi-modal version with video support is preserved in MediaGenerationInputCard.tsx
 */
export const VisualGenerationInputCard = memo(
	function VisualGenerationInputCard({
		isGenerating = false,
		externalPrompt,
		onGenerate,
	}: VisualGenerationInputCardProps) {
		const [prompt, setPrompt] = useState(externalPrompt || "");

		// Image generation parameters
		const [aspectRatio, setAspectRatio] = useState<VisualAspectRatio>("auto");
		const [resolution, setResolution] = useState<VisualResolution>("2K");
		const [quality, setQuality] = useState<VisualQuality>("Medium");

		const [referenceImage, setReferenceImage] = useState<string | undefined>(
			undefined,
		);

		// Sync external prompt when user clicks inspiration tag
		useEffect(() => {
			if (externalPrompt) {
				setPrompt(externalPrompt);
				textareaRef.current?.focus();
			}
		}, [externalPrompt]);

		const fileInputRef = useRef<HTMLInputElement>(null);
		const textareaRef = useRef<HTMLTextAreaElement>(null);

		const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = () => {
				if (typeof reader.result === "string") {
					setReferenceImage(reader.result);
				}
			};
			reader.readAsDataURL(file);
			// Reset file input so same file can be re-uploaded
			e.target.value = "";
		};

		const handleRemoveReferenceImage = () => {
			setReferenceImage(undefined);
		};

		const handleSubmit = () => {
			const trimmed = prompt.trim();
			if (!trimmed || isGenerating) return;

			onGenerate({
				prompt: trimmed,
				mediaType: "image",
				aspectRatio,
				resolution,
				quality,
				referenceImage,
			});
			setPrompt("");
		};

		const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSubmit();
			}
		};

		const canSend = Boolean(prompt.trim()) && !isGenerating;

		return (
			<section
				aria-label="AI 视觉生图输入区域"
				className="relative flex flex-col bg-surface border border-border/80 rounded-2xl px-3 py-2 transition-all shadow-xs group focus-within:border-blue-500/50 focus-within:ring-2 focus-within:ring-blue-500/15 select-none"
			>
				{/* Hidden file input for reference image */}
				<input
					ref={fileInputRef}
					type="file"
					accept="image/png,image/jpeg,image/webp"
					className="hidden"
					onChange={handleFileSelect}
				/>

				{/* Upper: Reference Image Upload + Text Prompt */}
				<div className="flex items-start gap-2.5 min-h-[48px] px-0.5 py-0.5">
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

					{/* Prompt Textarea */}
					<textarea
						ref={textareaRef}
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={
							referenceImage
								? "结合参考图描述修改细节或新风格..."
								: "试着描述你想要创作的图像，按回车快速生成..."
						}
						rows={2}
						className="flex-1 bg-transparent resize-none outline-none text-xs text-foreground placeholder:text-muted/70 leading-relaxed min-h-[44px] max-h-[120px]"
					/>
				</div>

				{/* Bottom Toolbar: Image Parameters Popover + Send Button */}
				<div className="flex items-center justify-between gap-1.5 pt-1 mt-1 border-t border-border/30">
					{/* Left controls: Aspect Ratio + Resolution + Quality */}
					<div className="flex items-center gap-1.5 min-w-0 flex-wrap">
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
									title="调整图像比例、分辨率与质量参数"
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

					{/* Right: Send Button matching ChatInputBottomBar button styling */}
					<Tooltip>
						<Tooltip.Trigger>
							<Button
								size="sm"
								isIconOnly
								variant={canSend ? "primary" : "secondary"}
								isDisabled={!canSend}
								className={`h-7 w-7 rounded-xl flex items-center justify-center cursor-pointer transition-all shadow-xs ${
									canSend
										? "bg-accent text-accent-foreground hover:opacity-90 shadow-accent/20"
										: "bg-surface-secondary text-muted/50 border border-border/40 cursor-not-allowed opacity-60"
								}`}
								onPress={handleSubmit}
								aria-label="开始生成图像"
							>
								{isGenerating ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
								)}
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content className="text-xs py-1 px-2">
							生成图像 (Enter)
						</Tooltip.Content>
					</Tooltip>
				</div>
			</section>
		);
	},
);
