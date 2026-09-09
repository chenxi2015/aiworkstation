import { Sparkles } from "lucide-react";
import { memo, useMemo } from "react";
import type { Folder } from "../../types";

export interface ChatPromptSuggestionsProps {
	selectedFolder?: Folder | null;
	scopeMode?: "global" | "folder";
	onSelectPrompt: (prompt: string) => void;
	/** 当前模块的推荐提问（见 modules/ai-contributions.ts），未提供时用内置默认 */
	globalPrompts?: string[];
}

const DEFAULT_GLOBAL_PROMPTS = [
	"检索我收藏的所有关于 AI、自动化与大模型相关的开源项目与工具",
	"盘点我最近收藏的前端开发框架、组件库与实用资源",
	"根据我的书签库，推荐一套高效的内容创作与自媒体运营工具集",
	"分析我的全库书签资产，给出最有价值的核心工具与使用场景",
];

/**
 * Prompt suggestion pill buttons displayed when chat is empty or folder is focused
 */
export const ChatPromptSuggestions = memo(function ChatPromptSuggestions({
	selectedFolder,
	scopeMode = "global",
	onSelectPrompt,
	globalPrompts,
}: ChatPromptSuggestionsProps) {
	const isFolderScope = scopeMode === "folder" && Boolean(selectedFolder);

	const prompts = useMemo(() => {
		if (isFolderScope && selectedFolder) {
			return [
				`请深度盘点「${selectedFolder.name}」文件夹中的全部资源并总结核心亮点`,
				`从「${selectedFolder.name}」中挑选最适合新手快速上手的 3 个工具`,
				`分析「${selectedFolder.name}」中的书签，给出最佳的使用场景与组合方案`,
				"检索所有分类下与当前文件夹相关的扩展资源",
			];
		}
		return globalPrompts && globalPrompts.length > 0
			? globalPrompts
			: DEFAULT_GLOBAL_PROMPTS;
	}, [isFolderScope, selectedFolder, globalPrompts]);

	return (
		<div className="flex flex-col gap-2 mt-4 w-full">
			<div className="flex items-center gap-1 text-[10px] font-semibold text-muted uppercase tracking-wider px-1">
				<Sparkles className="w-3 h-3 text-accent" />
				<span>
					{isFolderScope && selectedFolder
						? `针对「${selectedFolder.name}」提问`
						: "全库资产推荐提问"}
				</span>
			</div>
			<div className="flex flex-col gap-1.5 w-full">
				{prompts.map((prompt) => (
					<button
						key={prompt}
						type="button"
						onClick={() => onSelectPrompt(prompt)}
						className="w-full text-left p-2.5 rounded-xl bg-surface border border-border/70 hover:border-accent/50 hover:bg-accent-soft/20 text-foreground/80 hover:text-foreground text-xs leading-relaxed transition-all shadow-2xs cursor-pointer group"
					>
						<span className="group-hover:translate-x-0.5 inline-block transition-transform">
							{prompt}
						</span>
					</button>
				))}
			</div>
		</div>
	);
});
