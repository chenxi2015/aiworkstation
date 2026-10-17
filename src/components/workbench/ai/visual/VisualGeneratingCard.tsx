import { Tooltip, toast } from "@heroui/react";
import { Copy, Sparkles } from "lucide-react";
import { memo } from "react";
import type { VisualPendingRequest } from "../../../../types/visualGeneration.ts";
import { getAspectRatioCss } from "./VisualChatTurnItem.tsx";

export interface VisualGeneratingCardProps {
	request: VisualPendingRequest;
	onSelectPrompt?: (prompt: string) => void;
}

/**
 * Visual generating card matching chat message bubble styling:
 * - Upper right: User prompt bubble matching UserMessageBubble style.
 * - Lower left: Assistant header + sleek frosted gradient canvas with centered "生成中" text.
 */
export const VisualGeneratingCard = memo(function VisualGeneratingCard({
	request,
	onSelectPrompt,
}: VisualGeneratingCardProps) {
	const handleCopyPrompt = async () => {
		try {
			await navigator.clipboard.writeText(request.prompt);
			toast.success("已复制提示词");
		} catch {
			toast.warning("复制失败");
		}
	};

	const ratioCss = getAspectRatioCss(request.aspectRatio);

	return (
		<div className="flex flex-col gap-3 py-1 animate-fadeIn">
			{/* 1. User Prompt Bubble (Aligned Right, matching chat message bubble) */}
			<div className="flex flex-col items-end gap-1 self-end max-w-[85%] sm:max-w-[75%] group">
				<div className="bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-2xl px-4 py-2 text-sm leading-relaxed font-normal shadow-2xs select-text">
					{request.prompt}
				</div>

				<div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-0.5 text-muted text-xs px-1">
					<Tooltip>
						<Tooltip.Trigger>
							<button
								type="button"
								onClick={handleCopyPrompt}
								className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/80 transition-colors cursor-pointer"
								aria-label="复制提示词"
							>
								<Copy className="w-3.5 h-3.5" />
							</button>
						</Tooltip.Trigger>
						<Tooltip.Content className="text-[10px] py-0.5 px-1.5">
							复制提示词
						</Tooltip.Content>
					</Tooltip>

					<Tooltip>
						<Tooltip.Trigger>
							<button
								type="button"
								onClick={() => onSelectPrompt?.(request.prompt)}
								className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/80 transition-colors cursor-pointer"
								aria-label="填入输入框"
							>
								<svg
									viewBox="0 0 24 24"
									className="w-3.5 h-3.5"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<title>填入输入框</title>
									<rect x="3" y="3" width="18" height="18" rx="4" />
									<path d="M7 8h10" />
									<path d="M12 8v8" />
								</svg>
							</button>
						</Tooltip.Trigger>
						<Tooltip.Content className="text-[10px] py-0.5 px-1.5">
							填入输入框
						</Tooltip.Content>
					</Tooltip>
				</div>
			</div>

			{/* 2. Assistant Generating Placeholder Canvas (Aligned Left) */}
			<div className="flex flex-col items-start gap-1.5 self-start w-full max-w-[440px]">
				<div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 select-none pb-0.5">
					<div className="w-4 h-4 rounded-full bg-gradient-to-tr from-accent to-primary flex items-center justify-center text-white text-[9px] shadow-2xs shrink-0">
						<Sparkles className="w-2.5 h-2.5 text-white" />
					</div>
					<span>AI 视觉</span>
					<span className="text-[10.5px] text-neutral-400 font-normal">
						· 生成中
					</span>
				</div>

				<div className="relative w-full">
					{/* Ambient breathing glow behind card */}
					<div className="absolute -inset-1.5 rounded-3xl bg-gradient-to-r from-[#60a5fa]/30 via-[#7c3aed]/35 to-[#f472b6]/30 blur-lg animate-visual-glow pointer-events-none -z-10" />

					<div
						style={{ aspectRatio: ratioCss }}
						className="relative w-full max-h-[360px] rounded-3xl overflow-hidden shadow-lg flex items-center justify-center p-6 select-none bg-gradient-to-r from-[#3b82f6] via-[#8b5cf6] via-[#ec4899] to-[#6366f1] animate-visual-gradient transition-all"
					>
						{/* Subtle frosted grain overlay for aesthetic textured feel */}
						<div
							className="absolute inset-0 opacity-25 pointer-events-none mix-blend-overlay"
							style={{
								backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.45) 1px, transparent 0)`,
								backgroundSize: "6px 6px",
							}}
						/>

						{/* Flowing shimmer light sweep */}
						<div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-visual-shimmer pointer-events-none" />

						{/* Soft animated ambient overlay */}
						<div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-white/10 pointer-events-none" />

						{/* Centered '生成中' label matching reference screenshot with gentle pulsating sparkles */}
						<div className="relative z-10 flex items-center gap-2 text-white font-medium text-base tracking-wide drop-shadow-[0_2px_6px_rgba(0,0,0,0.3)] select-none">
							<Sparkles className="w-4 h-4 text-white/90 animate-spin [animation-duration:6s]" />
							<span>生成中</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
});
