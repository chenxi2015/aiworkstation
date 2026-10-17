import { Heatmap } from "@paper-design/shaders-react";
import { ArrowUpRight, Film, Palette, Sparkles, Wand2 } from "lucide-react";
import { memo, useState } from "react";

export interface VisualEmptyStateProps {
	onSelectPrompt: (prompt: string) => void;
}

interface VisualInspirationItem {
	id: string;
	icon: typeof Sparkles;
	title: string;
	badge: string;
	subtitle: string;
	prompt: string;
}

const VISUAL_INSPIRATIONS: VisualInspirationItem[] = [
	{
		id: "swiss-poster",
		icon: Palette,
		title: "现代版式海报，瑞士极简风",
		badge: "平面设计",
		subtitle:
			"A modern typographic poster combining Swiss style and experimental typography, high contrast, clean graphic design",
		prompt:
			"A modern typographic poster combining Swiss style and experimental typography, high contrast, clean graphic design",
	},
	{
		id: "cyberpunk-desk",
		icon: Sparkles,
		title: "赛博朋克光影，未来工作台",
		badge: "3D 概念",
		subtitle:
			"赛博朋克风未来编程工作台，霓虹光影，机械键盘与全息投影，8K 超清壁纸",
		prompt:
			"赛博朋克风未来编程工作台，霓虹光影，机械键盘与全息投影，8K 超清壁纸",
	},
	{
		id: "minimal-reading",
		icon: Wand2,
		title: "极简扁平插画，书房阅读",
		badge: "插画艺术",
		subtitle:
			"极简扁平插画，一个人在书房安静阅读思考，柔和自然光与绿植，温暖氛围",
		prompt:
			"极简扁平插画，一个人在书房安静阅读思考，柔和自然光与绿植，温暖氛围",
	},
	{
		id: "neural-network",
		icon: Sparkles,
		title: "发光神经网络，星空科技感",
		badge: "科技艺术",
		subtitle:
			"浩瀚星空与发光神经网络，粒子流动，现代科技艺术概念图，虚幻引擎渲染",
		prompt:
			"浩瀚星空与发光神经网络，粒子流动，现代科技艺术概念图，虚幻引擎渲染",
	},
	{
		id: "rainy-street-video",
		icon: Film,
		title: "电影大片镜头，雨夜街头动态",
		badge: "动态视频",
		subtitle:
			"电影大片质感，雨夜霓虹街头，慢镜头运镜，水洼倒影与车流光斑，动态视频",
		prompt:
			"电影大片质感，雨夜霓虹街头，慢镜头运镜，水洼倒影与车流光斑，动态视频",
	},
	{
		id: "glass-icon",
		icon: Palette,
		title: "三维立体图标，毛玻璃质感",
		badge: "UI 质感",
		subtitle:
			"3D 立体玻璃质感应用图标设计，柔和渐变微光，磨砂半透明材质，柔和阴影，4K 精致渲染",
		prompt:
			"3D 立体玻璃质感应用图标设计，柔和渐变微光，磨砂半透明材质，柔和阴影，4K 精致渲染",
	},
];

/**
 * Top animated illustration for Visual empty state, aligned with ChatEmptyState
 */
function VisualHeroIllustration() {
	return (
		<div className="relative w-20 h-20 overflow-hidden rounded-full mb-2 flex items-center justify-center select-none pointer-events-none">
			<Heatmap
				width={200}
				height={200}
				image="/diamond.svg"
  			colors={["#112069", "#1f3ca3", "#3265e7", "#6bd8ff", "#ffe77a", "#ff9a1f", "#ff4d00"]}
				colorBack="#000000"
				contour={0.5}
				outerGlow={0.55}
				innerGlow={1}
				angle={0}
				speed={1}
				scale={0.9}
			/>
		</div>
	);
}

/**
 * Visual generation empty state with Sider Claw style unified minimalist inspiration card,
 * strictly matching the ChatEmptyState aesthetic and interaction.
 */
export const VisualEmptyState = memo(function VisualEmptyState({
	onSelectPrompt,
}: VisualEmptyStateProps) {
	const [isExpanded, setIsExpanded] = useState(false);

	const displayLimit = 3;
	const hasMore = VISUAL_INSPIRATIONS.length > displayLimit;
	const visibleItems = isExpanded
		? VISUAL_INSPIRATIONS
		: VISUAL_INSPIRATIONS.slice(0, displayLimit);

	return (
		<div className="flex flex-col items-center justify-center text-center py-6 px-3 w-full max-w-[390px] mx-auto animate-in fade-in duration-300">
			{/* Top Hero Art */}
			<VisualHeroIllustration />

			{/* Title & Narrative Intro */}
			<h2 className="text-xl font-bold text-foreground tracking-tight mb-2">
				认识 AI 视觉创作搭档
			</h2>
			<p className="text-xs text-muted leading-relaxed max-w-[320px] mb-5">
				不只是一个生图工具——而是一位懂构图与创意的视觉设计搭档。输入画面描述，选择比例与视觉模型，开启多风格
				AI 图像与视频生成。
			</p>

			{/* Sider Claw Style Unified Minimalist Card Container */}
			<div className="w-full rounded-2xl border border-border/80 bg-surface/90 dark:bg-neutral-900/80 shadow-2xs overflow-hidden text-left transition-all">
				<div className="px-4 py-4">
					{visibleItems.map((item) => {
						const ItemIcon = item.icon;
						return (
							<button
								key={item.id}
								type="button"
								onClick={() => onSelectPrompt(item.prompt)}
								className="w-full text-left flex items-start gap-3.5 py-2.5 px-3 rounded-xl hover:bg-surface-secondary/70 dark:hover:bg-neutral-800/60 cursor-pointer transition-colors group active:scale-[0.99]"
							>
								{/* Clean line-art icon */}
								<div className="mt-0.5 text-foreground/80 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors shrink-0">
									<ItemIcon className="w-4.5 h-4.5 stroke-[1.8]" />
								</div>

								{/* Content area */}
								<div className="flex-1 min-w-0">
									<div className="flex items-center justify-between gap-1.5">
										<div className="text-xs font-semibold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
											<span>{item.title}</span>
											{item.badge && (
												<span className="text-[10px] font-normal px-1.5 py-0.2 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
													{item.badge}
												</span>
											)}
										</div>
										<ArrowUpRight className="w-3.5 h-3.5 text-muted/30 group-hover:text-blue-600 dark:group-hover:text-blue-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
									</div>
									<div className="text-[11.5px] text-muted leading-relaxed mt-1.5 line-clamp-2">
										{item.subtitle}
									</div>
								</div>
							</button>
						);
					})}
				</div>

				{/* Bottom expansive bar matching ChatEmptyState */}
				{hasMore && (
					<button
						type="button"
						onClick={() => setIsExpanded((prev) => !prev)}
						className="w-full py-2.5 px-4 bg-blue-500/5 hover:bg-blue-500/10 dark:bg-blue-500/10 dark:hover:bg-blue-500/15 text-blue-600 dark:text-blue-400 text-xs font-medium border-t border-border/50 flex items-center justify-center gap-1 transition-colors cursor-pointer"
					>
						<span>
							{isExpanded
								? "收起示例"
								: `查看全部 ${VISUAL_INSPIRATIONS.length} 个灵感 ↗`}
						</span>
					</button>
				)}
			</div>
		</div>
	);
});
