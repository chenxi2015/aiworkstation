import {
	ArrowUpRight,
	FileText,
	Heading1,
	PenLine,
	Search,
	Sparkles,
	Wand2,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
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

interface PromptListItem {
	id: string;
	icon: typeof Sparkles;
	title: string;
	subtitle: string;
	badge?: string;
	actionText?: string;
	onClick: () => void;
}

/**
 * Minimalist cloud and laptop illustration matching Sider Claw aesthetics
 */
function HeroIllustration() {
	return (
		<div className="relative w-28 h-20 mb-2 flex items-center justify-center select-none pointer-events-none">
			<img
				src="/hero-illustration.svg"
				alt="AI Assistant Illustration"
				className="w-full h-full object-contain drop-shadow-xs"
				aria-hidden="true"
			/>
		</div>
	);
}

function parsePromptMeta(prompt: string) {
	if (prompt.includes("标题") || prompt.includes("起名")) {
		return {
			icon: Heading1,
			title: "爆款标题，一键拟定",
		};
	}
	if (
		prompt.includes("逐段") ||
		(prompt.includes("全文") &&
			(prompt.includes("润色") ||
				prompt.includes("精修") ||
				prompt.includes("改写")))
	) {
		return {
			icon: Wand2,
			title: "全文润色，逐段精修",
		};
	}
	if (
		prompt.includes("开源") ||
		prompt.includes("大模型") ||
		(prompt.includes("工具") && !prompt.includes("创作"))
	) {
		return {
			icon: Search,
			title: "开源工具，深度盘点",
		};
	}
	if (
		prompt.includes("前端") ||
		prompt.includes("框架") ||
		prompt.includes("组件库")
	) {
		return {
			icon: Search,
			title: "前端资源，精选推荐",
		};
	}
	if (prompt.includes("创作") || prompt.includes("工具集")) {
		return {
			icon: Sparkles,
			title: "创作工具，场景搭配",
		};
	}
	if (prompt.includes("全库") || prompt.includes("最有价值")) {
		return {
			icon: FileText,
			title: "资产洞察，核心盘点",
		};
	}
	if (
		prompt.includes("结构") ||
		prompt.includes("大纲") ||
		prompt.includes("分析")
	) {
		return {
			icon: FileText,
			title: "结构洞察，改进建议",
		};
	}
	if (
		prompt.includes("润色") ||
		prompt.includes("文字") ||
		prompt.includes("改写")
	) {
		return {
			icon: PenLine,
			title: "行文润色，发布就绪",
		};
	}
	if (
		prompt.includes("素材") ||
		prompt.includes("检索") ||
		prompt.includes("搜索")
	) {
		return {
			icon: Search,
			title: "素材检索，精准引用",
		};
	}
	if (
		prompt.includes("自媒体") ||
		prompt.includes("小红书") ||
		prompt.includes("脚本") ||
		prompt.includes("选题") ||
		prompt.includes("风格")
	) {
		return {
			icon: Sparkles,
			title: "风格改写，多端裂变",
		};
	}
	return {
		icon: Sparkles,
		title: "智能问答，即刻开启",
	};
}

/**
 * Product-grade Empty State with minimalist Sider Claw aesthetic,
 * clean typography, unified card container, and calm line-art icons.
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
	const [isExpanded, setIsExpanded] = useState(false);

	const rewriteAction = useMemo(() => {
		return (
			pageBridge?.actions?.find((a) => a.id === "stream_full_rewrite") ?? null
		);
	}, [pageBridge]);

	// Hero title & description
	const heroConfig = useMemo(() => {
		if (isFolderScope && selectedFolder) {
			return {
				title: `聚焦「${selectedFolder.name}」`,
				description: "针对此文件夹中的归集资源进行深度分析、总结与问答。",
			};
		}

		switch (activeModule) {
			case "editor":
				return {
					title: "认识 AI 写作搭档",
					description:
						"不只是一个聊天助手——而是一位能深度协同创作的搭档。实时理解文档上下文，协助结构梳理、文本润色、标题拟定与素材引用。",
				};
			case "creator":
				return {
					title: "认识 自媒体二创助手",
					description:
						"不只是一个生成工具——而是一位深谙传播逻辑的二创策划。提炼核心亮点，快速起草并裂变多平台发布文案。",
				};
			case "learn":
				return {
					title: "认识 学习探索搭档",
					description:
						"聚合多维度学习资源，梳理知识脉络与核心概念，规划循序渐进的高效学习路径。",
				};
			default:
				return {
					title: "认识 知识库智能助手",
					description:
						"不只是又一个聊天机器人——而是一位随身数字大脑。随时提问、盘点全库资产，输入 @ 即可精准引用书签与文件夹。",
				};
		}
	}, [activeModule, isFolderScope, selectedFolder]);

	const rawPrompts = useMemo(() => {
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

	// Build unified prompt list items
	const allItems = useMemo<PromptListItem[]>(() => {
		const list: PromptListItem[] = [];

		// If full rewrite action is available in editor, place it as the featured top item
		if (rewriteAction) {
			list.push({
				id: "action-full-rewrite",
				icon: Wand2,
				title: "全文润色，逐段精修",
				subtitle: "逐段流式改写，保留图片视频并实时对照审阅。",
				badge: "保护媒体",
				actionText: "立即开始 ↗",
				onClick: () => {
					void rewriteAction.onAction("");
				},
			});
		}

		rawPrompts.forEach((prompt, idx) => {
			const meta = parsePromptMeta(prompt);
			// Avoid duplicate title if rewrite action already exists
			if (rewriteAction && meta.title === "全文润色，逐段精修") {
				return;
			}
			list.push({
				id: `prompt-${idx}`,
				icon: meta.icon,
				title: meta.title,
				subtitle: prompt,
				onClick: () => onSelectPrompt(prompt),
			});
		});

		return list;
	}, [rewriteAction, rawPrompts, onSelectPrompt]);

	// Show top 3 by default, expand all on click
	const displayLimit = 3;
	const hasMore = allItems.length > displayLimit;
	const visibleItems = isExpanded ? allItems : allItems.slice(0, displayLimit);

	return (
		<div className="flex flex-col items-center justify-center text-center py-6 px-3 w-full max-w-[390px] mx-auto animate-in fade-in duration-300">
			{/* Top Hero Art */}
			<HeroIllustration />

			{/* Title & Narrative Intro */}
			<h2 className="text-xl font-bold text-foreground tracking-tight mb-2">
				{heroConfig.title}
			</h2>
			<p className="text-xs text-muted leading-relaxed max-w-[320px] mb-5">
				{heroConfig.description}
			</p>

			{/* Sider Claw Style Unified Minimalist Card Container */}
			<div className="w-full rounded-2xl border border-border/80 bg-surface/90 dark:bg-neutral-900/80 shadow-2xs overflow-hidden text-left transition-all">
				<div className="px-4 py-4 space-y-2">
					{visibleItems.map((item) => {
						const ItemIcon = item.icon;
						return (
							<button
								key={item.id}
								type="button"
								onClick={item.onClick}
								className="w-full text-left flex items-start gap-3.5 py-2.5 px-3 rounded-xl hover:bg-surface-secondary/70 dark:hover:bg-neutral-800/60 cursor-pointer transition-colors group active:scale-[0.99]"
							>
								{/* Clean line-art icon */}
								<div className="mt-0.5 text-foreground/80 group-hover:text-accent transition-colors shrink-0">
									<ItemIcon className="w-4.5 h-4.5 stroke-[1.8]" />
								</div>

								{/* Content area */}
								<div className="flex-1 min-w-0">
									<div className="flex items-center justify-between gap-1.5">
										<div className="text-xs font-semibold text-foreground group-hover:text-accent transition-colors flex items-center gap-1.5">
											<span>{item.title}</span>
											{item.badge && (
												<span className="text-[10px] font-normal px-1.5 py-0.2 rounded-full bg-accent/10 text-accent border border-accent/20">
													{item.badge}
												</span>
											)}
										</div>
										{item.actionText ? (
											<span className="text-[11px] text-accent font-medium flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform shrink-0">
												{item.actionText}
											</span>
										) : (
											<ArrowUpRight className="w-3.5 h-3.5 text-muted/30 group-hover:text-accent opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
										)}
									</div>
									<div className="text-[11.5px] text-muted leading-relaxed mt-1.5 line-clamp-2">
										{item.subtitle}
									</div>
								</div>
							</button>
						);
					})}
				</div>

				{/* Bottom expansive bar matching Sider Claw */}
				{hasMore && (
					<button
						type="button"
						onClick={() => setIsExpanded((prev) => !prev)}
						className="w-full py-2.5 px-4 bg-accent/6 hover:bg-accent/12 dark:bg-accent/10 dark:hover:bg-accent/15 text-accent text-xs font-medium border-t border-border/50 flex items-center justify-center gap-1 transition-colors cursor-pointer"
					>
						<span>
							{isExpanded ? "收起示例" : `查看全部 ${allItems.length} 个示例 ↗`}
						</span>
					</button>
				)}
			</div>
		</div>
	);
});
