import { ArrowRight, Cpu, FolderPlus, Info, Play } from "lucide-react";
import type { ReactNode } from "react";

interface ToolBottomDockProps {
	isProcessing?: boolean;
	isReady?: boolean;
	hintMessage?: string;
	onExecute?: () => void;
	executeLabel?: string;
	executeDisabled?: boolean;
	onSaveToMaterials?: () => void;
	saveToMaterialsDisabled?: boolean;
	onSendToStudio?: () => void;
	customActions?: ReactNode;
}

/**
 * Standardized persistent bottom control dock for creator tools.
 * Keeps action triggers (Process, Save to Library, Send to Studio) anchored and accessible.
 */
export function ToolBottomDock({
	isProcessing = false,
	isReady = true,
	hintMessage,
	onExecute,
	executeLabel = "开始处理",
	executeDisabled = false,
	onSaveToMaterials,
	saveToMaterialsDisabled = true,
	onSendToStudio,
	customActions,
}: ToolBottomDockProps) {
	const defaultHint = isReady
		? "本地高性能 FFmpeg 处理，无云端上传泄露风险"
		: "该工具处于规划中，目前可提前预览配置";

	return (
		<footer className="p-3.5 px-6 border-t border-border bg-surface backdrop-blur-md shrink-0 flex items-center justify-between flex-wrap gap-3 z-10">
			<div className="flex items-center gap-2 text-xs text-muted">
				<Info className="w-3.5 h-3.5 text-accent shrink-0" />
				<span className="truncate max-w-xl">{hintMessage ?? defaultHint}</span>
			</div>

			<div className="flex items-center gap-2.5">
				{customActions}

				{/* Primary execution trigger */}
				{onExecute && (
					<button
						type="button"
						onClick={onExecute}
						disabled={isProcessing || executeDisabled}
						className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-xs font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer shadow-xs"
					>
						{isProcessing ? (
							<>
								<Cpu className="w-3.5 h-3.5 animate-spin" />
								<span>处理中...</span>
							</>
						) : (
							<>
								<Play className="w-3.5 h-3.5" />
								<span>{executeLabel}</span>
							</>
						)}
					</button>
				)}

				{/* Save output to asset library */}
				{onSaveToMaterials && (
					<button
						type="button"
						onClick={onSaveToMaterials}
						disabled={saveToMaterialsDisabled || isProcessing}
						className="px-3.5 py-2 rounded-lg border border-border bg-surface hover:bg-surface/80 text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<FolderPlus className="w-3.5 h-3.5 text-accent" />
						<span>保存至素材库</span>
					</button>
				)}

				{/* Forward output to timeline studio */}
				{onSendToStudio && (
					<button
						type="button"
						onClick={onSendToStudio}
						className="px-3.5 py-2 rounded-lg border border-border bg-surface hover:bg-surface/80 text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
					>
						<ArrowRight className="w-3.5 h-3.5 text-muted" />
						<span>导入创作台</span>
					</button>
				)}
			</div>
		</footer>
	);
}
