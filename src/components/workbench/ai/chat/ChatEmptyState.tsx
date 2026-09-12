import {
	ArrowUpRight,
	FileText,
	GraduationCap,
	Megaphone,
	PenLine,
	Search,
	Sparkles,
	Wand2,
} from "lucide-react";
import { memo, useMemo } from "react";
import type { PageBridge } from "../../../../types/pageBridge";
import type { Folder } from "../../types";

export interface ChatEmptyStateProps {
	activeModule?: string;
	selectedFolder?: Folder | null;
	scopeMode?: "global" | "folder";
	onSelectPrompt: (prompt: string) => void;
	globalPrompts?: string[];
	pageBridge?: PageBridge | null;
}

const DEFAULT_GLOBAL_PROMPTS = [
	"检索我收藏的所有关于 AI 与大模型相关的开源工具",
	"盘点我最近收藏的前端开发框架与高质量资源",
	"根据我的书签库，推荐一套高效的内容创作工具集",
	"分析我的全库书签资产，给出最有价值的核心工具与场景",
];

function getPromptMeta(prompt: string) {
	if (
		prompt.includes("结构") ||
		prompt.includes("大纲") ||
		prompt.includes("分析")
	) {
		return {
			icon: FileText,
			tag: "结构洞察",
			color:
				"text-blue-500 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
		};
	}
	if (
		prompt.includes("润色") ||
		prompt.includes("文字") ||
		prompt.includes("改写") ||
		prompt.includes("风格")
	) {
		return {
			icon: PenLine,
			tag: "行文润色",
			color:
				"text-purple-500 dark:text-purple-400 bg-purple-500/10 border-purple-500/20",
		};
	}
	if (
		prompt.includes("素材") ||
		prompt.includes("检索") ||
		prompt.includes("搜索") ||
		prompt.includes("盘点")
	) {
		return {
			icon: Search,
			tag: "素材检索",
			color:
				"text-amber-500 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
		};
	}
	if (
		prompt.includes("自媒体") ||
		prompt.includes("小红书") ||
		prompt.includes("脚本") ||
		prompt.includes("选题")
	) {
		return {
			icon: Sparkles,
			tag: "二创生成",
			color:
				"text-pink-500 dark:text-pink-400 bg-pink-500/10 border-pink-500/20",
		};
	}
	return {
		icon: Wand2,
		tag: "快捷探索",
		color: "text-accent bg-accent/10 border-accent/20",
	};
}

/**
 * Product-grade Empty State with glowing ambient badge, module-tailored hero,
 * and richly styled prompt suggestion cards.
 */
export const ChatEmptyState = memo(function ChatEmptyState({
	activeModule,
	selectedFolder,
	scopeMode = "global",
	onSelectPrompt,
	globalPrompts,
	pageBridge,
}: ChatEmptyStateProps) {
	const isFolderScope = scopeMode === "folder" && Boolean(selectedFolder);

	const rewriteAction = useMemo(() => {
		return (
			pageBridge?.actions?.find((a) => a.id === "stream_full_rewrite") ?? null
		);
	}, [pageBridge]);

	// Determine contextual hero headers based on current active module or folder scope
	const heroConfig = useMemo(() => {
		if (isFolderScope && selectedFolder) {
			return {
				title: `聚焦「${selectedFolder.name}」`,
				subtitle: "针对此文件夹中的归集资源进行深度分析、总结与问答",
				icon: Sparkles,
				glow: "from-blue-500/20 via-cyan-500/15 to-emerald-500/10",
				badge: "文件夹范围",
			};
		}

		switch (activeModule) {
			case "editor":
				return {
					title: "AI 写作搭档",
					subtitle: "实时理解当前文档上下文，协助结构梳理、文本润色与素材引用",
					icon: PenLine,
					glow: "from-violet-500/25 via-purple-500/15 to-pink-500/10",
					badge: "写作协同模式",
				};
			case "creator":
				return {
					title: "自媒体二创助手",
					subtitle: "挖掘素材核心亮点，提炼切入角度并快速起草多平台发布文案",
					icon: Megaphone,
					glow: "from-amber-500/25 via-orange-500/15 to-red-500/10",
					badge: "二创加速模式",
				};
			case "learn":
				return {
					title: "学习探索搭档",
					subtitle: "聚合关联学习资源，梳理知识图谱脉络，规划渐进式学习路径",
					icon: GraduationCap,
					glow: "from-emerald-500/25 via-teal-500/15 to-cyan-500/10",
					badge: "知识探索模式",
				};
			default:
				return {
					title: "知识库智能助手",
					subtitle: "随时提问、盘点全库资产，输入 @ 即可精准引用书签与文件夹",
					icon: Sparkles,
					glow: "from-blue-500/25 via-indigo-500/15 to-purple-500/10",
					badge: "全库知识库",
				};
		}
	}, [activeModule, isFolderScope, selectedFolder]);

	const prompts = useMemo(() => {
		if (isFolderScope && selectedFolder) {
			return [
				`深度盘点「${selectedFolder.name}」中的全部资源并总结核心亮点`,
				`从「${selectedFolder.name}」中挑选最适合快速上手的实用工具`,
				`分析「${selectedFolder.name}」中的书签，给出最佳组合方案`,
				"检索所有分类下与当前文件夹相关的扩展资源",
			];
		}
		return globalPrompts && globalPrompts.length > 0
			? globalPrompts
			: DEFAULT_GLOBAL_PROMPTS;
	}, [isFolderScope, selectedFolder, globalPrompts]);

	const HeroIcon = heroConfig.icon;

	return (
		<div className="flex flex-col items-center justify-center text-center py-8 px-3 w-full max-w-md mx-auto animate-in fade-in duration-300">
			{/* Modern glowing hero avatar badge */}
			<div className="relative mb-3.5 group cursor-default">
				<div
					className={`absolute -inset-1.5 rounded-3xl bg-gradient-to-tr ${heroConfig.glow} blur-lg opacity-70 group-hover:opacity-100 transition-opacity duration-300`}
				/>
				<div className="relative w-13 h-13 rounded-2xl bg-surface/90 dark:bg-neutral-900/90 border border-border/80 shadow-xs flex items-center justify-center text-accent backdrop-blur-md transition-transform duration-200 group-hover:scale-105">
					<HeroIcon className="w-6 h-6 stroke-[2]" />
				</div>
			</div>

			{/* Title and Subtitle */}
			<div className="flex items-center gap-1.5 mb-1.5">
				<h3 className="font-bold text-sm text-foreground tracking-tight">
					{heroConfig.title}
				</h3>
				<span className="text-[10px] text-accent font-medium px-1.5 py-0.2 rounded-full bg-accent/10 border border-accent/25">
					{heroConfig.badge}
				</span>
			</div>
			<p className="text-xs text-muted max-w-[300px] leading-relaxed">
				{heroConfig.subtitle}
			</p>

			{/* High-priority Action: Full paragraph streaming rewrite for editor */}
			{rewriteAction && (
				<div className="w-full mt-5 p-3 rounded-2xl bg-gradient-to-r from-accent/12 via-accent/6 to-transparent border border-accent/25 flex items-center justify-between gap-3 shadow-2xs">
					<div className="flex items-center gap-2.5 min-w-0">
						<div className="w-7 h-7 rounded-xl bg-accent text-accent-foreground flex items-center justify-center shrink-0 shadow-xs">
							<Sparkles className="w-3.5 h-3.5" />
						</div>
						<div className="min-w-0 text-left">
							<div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
								<span>全文逐段精修</span>
								<span className="text-[10px] text-accent px-1.5 py-0.2 rounded-full bg-accent/15 border border-accent/20 font-normal">
									保护媒体
								</span>
							</div>
							<div className="text-[11px] text-muted truncate mt-0.5">
								逐段流式改写，保留图片视频并实时对照审阅
							</div>
						</div>
					</div>
					<button
						type="button"
						onClick={() => void rewriteAction.onAction("")}
						className="shrink-0 px-2.5 py-1.5 text-xs font-medium rounded-xl bg-accent text-accent-foreground hover:opacity-90 active:scale-95 transition-all cursor-pointer shadow-xs flex items-center gap-1"
					>
						<span>立即开始</span>
						<ArrowUpRight className="w-3.5 h-3.5" />
					</button>
				</div>
			)}

			{/* Prompt Suggestions List */}
			<div className="w-full mt-6 flex flex-col gap-2 text-left">
				<div className="flex items-center justify-between px-1">
					<span className="text-[11px] font-medium text-muted flex items-center gap-1">
						<Sparkles className="w-3 h-3 text-accent" />
						<span>快捷提问建议</span>
					</span>
					<span className="text-[10px] text-muted/60">点击直接发送</span>
				</div>

				<div className="flex flex-col gap-2 w-full">
					{prompts.map((prompt) => {
						const meta = getPromptMeta(prompt);
						const CardIcon = meta.icon;

						return (
							<button
								key={prompt}
								type="button"
								onClick={() => onSelectPrompt(prompt)}
								className="w-full text-left p-2.5 rounded-2xl bg-surface-secondary/40 hover:bg-surface border border-border/60 hover:border-accent/40 text-foreground/90 hover:text-foreground text-xs leading-relaxed transition-all duration-150 shadow-2xs hover:shadow-xs cursor-pointer group flex items-start gap-2.5 active:scale-[0.99]"
							>
								<div
									className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${meta.color} transition-transform group-hover:scale-110 duration-150`}
								>
									<CardIcon className="w-3.5 h-3.5" />
								</div>
								<div className="flex-1 min-w-0 pr-1">
									<div className="text-[10px] text-muted/80 font-medium mb-0.5 flex items-center gap-1">
										<span>{meta.tag}</span>
									</div>
									<div className="text-xs font-normal text-foreground/85 group-hover:text-foreground line-clamp-2">
										{prompt}
									</div>
								</div>
								<ArrowUpRight className="w-4 h-4 text-muted/40 group-hover:text-accent group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0 mt-1 opacity-0 group-hover:opacity-100 duration-150" />
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
});
