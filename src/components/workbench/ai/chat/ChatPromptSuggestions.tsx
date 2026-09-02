import { Sparkles } from "lucide-react";
import { memo, useMemo } from "react";
import type { Folder } from "../../types";

export interface ChatPromptSuggestionsProps {
	selectedFolder?: Folder | null;
	onSelectPrompt: (prompt: string) => void;
}

const DEFAULT_GLOBAL_PROMPTS = [
	"帮我检索所有关于 AI 视频剪辑与动画制作的开源库和工具",
	"盘点我最近收藏的前端开发框架、组件库与提示词资源",
	"我本周收藏了哪些实用网站？请按分类梳理并列出",
	"根据我的书签，推荐一套高效率的自媒体内容创作工作流",
];

/**
 * Prompt suggestion pill buttons displayed when chat is empty or folder is focused
 */
export const ChatPromptSuggestions = memo(function ChatPromptSuggestions({
	selectedFolder,
	onSelectPrompt,
}: ChatPromptSuggestionsProps) {
	const prompts = useMemo(() => {
		if (selectedFolder && selectedFolder.items.length > 0) {
			return [
				`请深度盘点「${selectedFolder.name}」文件夹中的全部资源并总结核心亮点`,
				`从「${selectedFolder.name}」中挑选最适合新手快速上手的 3 个工具`,
				`分析「${selectedFolder.name}」中的书签，给出最佳的使用场景与组合方案`,
				"检索所有分类下与当前文件夹相关的扩展资源",
			];
		}
		return DEFAULT_GLOBAL_PROMPTS;
	}, [selectedFolder]);

	return (
		<div className="flex flex-col gap-2 mt-4 w-full">
			<div className="flex items-center gap-1 text-[10px] font-semibold text-muted uppercase tracking-wider px-1">
				<Sparkles className="w-3 h-3 text-accent" />
				<span>{selectedFolder ? `针对「${selectedFolder.name}」提问` : "推荐快速提问"}</span>
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
