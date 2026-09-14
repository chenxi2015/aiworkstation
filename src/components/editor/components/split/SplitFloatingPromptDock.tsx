import {
	Loader2,
	Maximize2,
	Mic,
	Minimize2,
	Play,
	Shuffle,
	Sparkles,
	Square,
} from "lucide-react";
import type React from "react";
import { PRESET_MODES, type SplitCanvasMode } from "./types";

export interface SplitFloatingPromptDockProps {
	selectedMode: SplitCanvasMode | null;
	onSelectMode: (mode: SplitCanvasMode | null) => void;
	customPrompt: string;
	onChangeCustomPrompt: (prompt: string) => void;
	isStreaming: boolean;
	onStartGenerate: () => void;
	onStopGenerate: () => void;
}

const MODE_ICONS: Record<string, React.ReactNode> = {
	Shuffle: <Shuffle className="w-3.5 h-3.5" />,
	Sparkles: <Sparkles className="w-3.5 h-3.5" />,
	Maximize2: <Maximize2 className="w-3.5 h-3.5" />,
	Minimize2: <Minimize2 className="w-3.5 h-3.5" />,
	Mic: <Mic className="w-3.5 h-3.5" />,
};

export function SplitFloatingPromptDock({
	selectedMode,
	onSelectMode,
	customPrompt,
	onChangeCustomPrompt,
	isStreaming,
	onStartGenerate,
	onStopGenerate,
}: SplitFloatingPromptDockProps) {
	const activePreset =
		PRESET_MODES.find((m) => m.id === selectedMode) || null;

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			if (!isStreaming) {
				onStartGenerate();
			}
		}
	};

	return (
		<div className="absolute bottom-4 left-16 right-16 z-30 select-none">
			<div className="bg-surface/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-border/80 shadow-2xl rounded-2xl p-3 flex flex-col gap-2.5 transition-all focus-within:ring-2 focus-within:ring-accent/20 focus-within:border-accent">
				{/* Top Mode Pills */}
				<div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
					{PRESET_MODES.map((mode) => {
						const isSelected = mode.id === selectedMode;
						return (
							<button
								key={mode.id}
								type="button"
								disabled={isStreaming}
								onClick={() => onSelectMode(isSelected ? null : mode.id)}
								className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer disabled:opacity-50 ${
									isSelected
										? "bg-accent text-accent-foreground shadow-xs"
										: "bg-surface-secondary/80 text-muted hover:text-foreground hover:bg-surface-secondary"
								}`}
								title={mode.desc}
							>
								{MODE_ICONS[mode.iconName] || <Sparkles className="w-3 h-3" />}
								<span>{mode.label}</span>
							</button>
						);
					})}
				</div>

				{/* Large Textarea */}
				<textarea
					rows={3}
					value={customPrompt}
					onChange={(e) => onChangeCustomPrompt(e.target.value)}
					onKeyDown={handleKeyDown}
					disabled={isStreaming}
					placeholder={
						isStreaming
							? "AI 正在右侧生成并实时排版，请稍候..."
							: activePreset
								? `输入定制要求（当前模式：${activePreset.label} · ${activePreset.desc}）。按 Enter 开始生成，Shift+Enter 换行`
								: "输入定制要求（可选上方预设或直接输入需求）。按 Enter 开始生成，Shift+Enter 换行"
					}
					className="w-full bg-transparent text-xs text-foreground placeholder:text-muted/60 outline-none resize-none leading-relaxed px-1"
				/>

				{/* Bottom Bar: Quick Hint & Action Button */}
				<div className="flex items-center justify-between pt-1 border-t border-border/50 text-[11px] text-muted">
					<span className="truncate max-w-[60%]">
						{isStreaming ? (
							<span className="flex items-center gap-1.5 text-accent font-medium">
								<Loader2 className="w-3 h-3 animate-spin" />
								正在生成中...
							</span>
						) : (
							<span>提示：可直接在上方右侧富文本内手动修剪打字</span>
						)}
					</span>

					{isStreaming ? (
						<button
							type="button"
							onClick={onStopGenerate}
							className="flex items-center gap-1.5 px-3 py-1.5 bg-danger/10 hover:bg-danger/20 text-danger font-medium text-xs rounded-xl transition-colors cursor-pointer shadow-xs"
						>
							<Square className="w-3 h-3 fill-current" />
							<span>停止生成</span>
						</button>
					) : (
						<button
							type="button"
							onClick={onStartGenerate}
							className="flex items-center gap-1.5 px-3.5 py-1.5 bg-accent hover:bg-accent/90 text-accent-foreground font-medium text-xs rounded-xl transition-colors cursor-pointer shadow-xs active:scale-95"
						>
							<Play className="w-3 h-3 fill-current" />
							<span>开始生成</span>
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
