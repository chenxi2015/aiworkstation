import { Heatmap } from "@paper-design/shaders-react";
import {
	ArrowUpRight,
	Compass,
	Flame,
	Shirt,
	Smile,
	Sun,
	Type,
} from "lucide-react";
import { memo, useState } from "react";

export interface VisualEmptyStateProps {
	onSelectPrompt: (prompt: string) => void;
}

interface VisualInspirationItem {
	id: string;
	icon: typeof Smile;
	title: string;
	badge: string;
	subtitle: string;
	prompt: string;
}

const VISUAL_INSPIRATIONS: VisualInspirationItem[] = [
	{
		id: "capybara-emojis",
		icon: Smile,
		title: "水豚噜噜，3D十六宫格表情",
		badge: "3D表情",
		subtitle:
			"生成4×4 十六宫格全新有趣夸张3D表情包，一系列可爱3dQ版水豚噜噜，白色背景，设计姿势和文字排版，以创造一套变化丰富的贴图，确保没有相似的贴图。各种情绪表情，不同的造型，各种动作，配上有趣的字句，所有文字清晰美观协调不能崩坏，开心等日常生活主题，兴奋，骑车，晚安，趴着睡觉，穿着雨衣，开心喝奶茶，洗澡，游泳，打球，手持饮料，具有开心表情、悲伤表情、戴眼镜、梳发髻发型、戴帽子等特征，简笔画，扁平插画，加入一些可爱的符号使表情更丰富，涂鸦风格，多巴胺色，线稿，大师手稿，杰作，超清纹理，光影美学，丰富层次感，细腻画质",
		prompt:
			"生成4×4 十六宫格全新有趣夸张3D表情包，一系列可爱3dQ版水豚噜噜，白色背景，设计姿势和文字排版，以创造一套变化丰富的贴图，确保没有相似的贴图。各种情绪表情，不同的造型，各种动作，配上有趣的字句，所有文字清晰美观协调不能崩坏，开心等日常生活主题，兴奋，骑车，晚安，趴着睡觉，穿着雨衣，开心喝奶茶，洗澡，游泳，打球，手持饮料，具有开心表情、悲伤表情、戴眼镜、梳发髻发型、戴帽子等特征，简笔画，扁平插画，加入一些可爱的符号使表情更丰富，涂鸦风格，多巴胺色，线稿，大师手稿，杰作，超清纹理，光影美学，丰富层次感，细腻画质",
	},
	{
		id: "morning-poster",
		icon: Sun,
		title: "总监级早安海报，治愈暖橙光",
		badge: "商业海报",
		subtitle:
			"早安海报，商业级设计总监水准，早安主题正能量海报，超前设计思维，严格遵循美学三大构成与黄金比例，视觉冲击力极强，在众多海报中一眼脱颖而出；画面核心位置突出原创正能量标语“每一个清晨，都是重启热爱的序章。”，字体简约大气且富有力量感，标注日期“2025.11.9”（日期以简洁小号字体置于海报角落，不抢主体）；色彩搭配和谐高级，以暖橙渐变+柔白为基底，点缀低饱和金箔光泽，传递温暖治愈的正能量；装饰元素与主题强相关，仅加入极简线条勾勒的日出光影、悬浮的微光粒子、纤细的叶脉纹理，元素大小比例适配，细节精致不杂乱；无多余文字、无重复元素、无侵权设计，整体风格独特小众、富有思想深度，兼具艺术感与商业实用性，原创性拉满，引人深思。",
		prompt:
			"早安海报，商业级设计总监水准，早安主题正能量海报，超前设计思维，严格遵循美学三大构成与黄金比例，视觉冲击力极强，在众多海报中一眼脱颖而出；画面核心位置突出原创正能量标语“每一个清晨，都是重启热爱的序章。”，字体简约大气且富有力量感，标注日期“2025.11.9”（日期以简洁小号字体置于海报角落，不抢主体）；色彩搭配和谐高级，以暖橙渐变+柔白为基底，点缀低饱和金箔光泽，传递温暖治愈的正能量；装饰元素与主题强相关，仅加入极简线条勾勒的日出光影、悬浮的微光粒子、纤细的叶脉纹理，元素大小比例适配，细节精致不杂乱；无多余文字、无重复元素、无侵权设计，整体风格独特小众、富有思想深度，兼具艺术感与商业实用性，原创性拉满，引人深思。",
	},
	{
		id: "sports-cover",
		icon: Flame,
		title: "潮流运动封面，试试又能怎",
		badge: "潮流封面",
		subtitle:
			"自媒体封面设计，黑色背景干净简洁，画面中心是创意字体设计“试试又能怎”，白色字体，采用夸张的笔画弧度，造型充满动感且棱角分明，融合尖锐边缘与流畅曲线，部分笔画进行连接和共用笔画，笔画转角圆角处理并向外延伸，加入绿色线条和星星适当装饰，字体下方是仰视特写视角的黄色卡通形象，充满活力，穿着带有黄色标志的黑色运动鞋，正处于迈步的动态中，一只手抬起比出耶的手势，手势旁边有黄色爆炸边框英文“JUST DO IT”，整体色彩以黑白为主，黄色和绿色作为点缀，营造出欢快、运动的感觉，视觉冲击力强，适合运动活动宣传，街头涂鸦风格，现代运动插画结合",
		prompt:
			"自媒体封面设计，黑色背景干净简洁，画面中心是创意字体设计“试试又能怎”，白色字体，采用夸张的笔画弧度，造型充满动感且棱角分明，融合尖锐边缘与流畅曲线，部分笔画进行连接和共用笔画，笔画转角圆角处理并向外延伸，加入绿色线条和星星适当装饰，字体下方是仰视特写视角的黄色卡通形象，充满活力，穿着带有黄色标志的黑色运动鞋，正处于迈步的动态中，一只手抬起比出耶的手势，手势旁边有黄色爆炸边框英文“JUST DO IT”，整体色彩以黑白为主，黄色和绿色作为点缀，营造出欢快、运动的感觉，视觉冲击力强，适合运动活动宣传，街头涂鸦风格，现代运动插画结合",
	},
	{
		id: "travel-livestream-cover",
		icon: Compass,
		title: "拼贴风文旅封面，自驾游黔江",
		badge: "文旅直播",
		subtitle:
			"创作一张拼贴风文旅直播自媒体封面，背景融合黔江风景（油菜花田、山峦、古建筑、“黔江欢迎您” 木质路标）与手绘蓝天、太阳、云朵；排版采用分层布局，标识；中间用手写感字体呈现 “跨越山海 去黔江”，人物居中，下方大字突出 “一起出发吧！”；底部黄色块区域排版 “万车自驾游黔江 BE SELF-DRIVE”（搭配绿色自驾车插画）；整体色调以清新明快的蓝（天空）、绿（山峦、草地）、黄（油菜花、底部块）为主，风格结合拼贴元素与手绘趣味，传递黔江文旅直播的活力与吸引力。",
		prompt:
			"创作一张拼贴风文旅直播自媒体封面，背景融合黔江风景（油菜花田、山峦、古建筑、“黔江欢迎您” 木质路标）与手绘蓝天、太阳、云朵；排版采用分层布局，标识；中间用手写感字体呈现 “跨越山海 去黔江”，人物居中，下方大字突出 “一起出发吧！”；底部黄色块区域排版 “万车自驾游黔江 BE SELF-DRIVE”（搭配绿色自驾车插画）；整体色调以清新明快的蓝（天空）、绿（山峦、草地）、黄（油菜花、底部块）为主，风格结合拼贴元素与手绘趣味，传递黔江文旅直播的活力与吸引力。",
	},
	{
		id: "tutorial-typography",
		icon: Type,
		title: "涂鸦风创意字，封面万能公式",
		badge: "字体设计",
		subtitle:
			"设计一组 “新手教程 封面设计万能公式” 主题的手绘涂鸦风创意美术字组合，风格活泼醒目、具干货亲和力；“新手教程” 采用带毛边的卡通黑体美术字（笔画块面感强，边缘手绘粗糙，笔锋为块面化圆润 + 毛糙边缘）；主体 “封面设计 万能公式” 为粗壮块面的创意美术字（笔画饱满、边缘带刷痕式手绘肌理，笔锋呈粗犷随性的锋感），搭配小巧无衬线拼音字体；色彩以高饱和玫粉色为背景，紫色对话框为基底，“新手教程” 用黑色字体 + 白色带黑边对话框，主体字为白色，拼音与小字用黄色、黑色，营造对比强烈的吸睛干货氛围。",
		prompt:
			"设计一组 “新手教程 封面设计万能公式” 主题的手绘涂鸦风创意美术字组合，风格活泼醒目、具干货亲和力；“新手教程” 采用带毛边的卡通黑体美术字（笔画块面感强，边缘手绘粗糙，笔锋为块面化圆润 + 毛糙边缘）；主体 “封面设计 万能公式” 为粗壮块面的创意美术字（笔画饱满、边缘带刷痕式手绘肌理，笔锋呈粗犷随性的锋感），搭配小巧无衬线拼音字体；色彩以高饱和玫粉色为背景，紫色对话框为基底，“新手教程” 用黑色字体 + 白色带黑边对话框，主体字为白色，拼音与小字用黄色、黑色，营造对比强烈的吸睛干货氛围。",
	},
	{
		id: "retro-care-guide",
		icon: Shirt,
		title: "复古手账拼贴，衣物养护技巧",
		badge: "手账拼贴",
		subtitle:
			"创作一张复古手账拼贴风的衣物养护类自媒体封面：背景为米黄色布纹肌理，搭配绿色手绘风边框 / 文字底；文案排版分层设计，顶部标注 “GAODING” 与 “稿定课堂”（复古字体 + 撕纸质感标签），主标题 “衣物养护小技巧” 以黑色粗体字衬绿色块突出展示，左侧辅 “GAODING KETANG” 复古标签；中间嵌入人物，穿搭图（照片底部带 “GAODING” 标识与箭头装饰）；底部用绿色椭圆框强调 “如何养护衣物？”，旁侧搭配 “简单技巧，一图看懂 >>>” 引导性文字；整体融合复古拼贴元素（拍立得、手写箭头、纹理底），色调清新柔和，传递出 “轻松学习衣物养护” 的实用感与活泼氛围。",
		prompt:
			"创作一张复古手账拼贴风的衣物养护类自媒体封面：背景为米黄色布纹肌理，搭配绿色手绘风边框 / 文字底；文案排版分层设计，顶部标注 “GAODING” 与 “稿定课堂”（复古字体 + 撕纸质感标签），主标题 “衣物养护小技巧” 以黑色粗体字衬绿色块突出展示，左侧辅 “GAODING KETANG” 复古标签；中间嵌入人物，穿搭图（照片底部带 “GAODING” 标识与箭头装饰）；底部用绿色椭圆框强调 “如何养护衣物？”，旁侧搭配 “简单技巧，一图看懂 >>>” 引导性文字；整体融合复古拼贴元素（拍立得、手写箭头、纹理底），色调清新柔和，传递出 “轻松学习衣物养护” 的实用感与活泼氛围。",
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
				colors={[
					"#112069",
					"#1f3ca3",
					"#3265e7",
					"#6bd8ff",
					"#ffe77a",
					"#ff9a1f",
					"#ff4d00",
				]}
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
				AI 图像生成。
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
									<div className="flex items-center justify-between gap-1.5 min-w-0">
										<div className="text-xs font-semibold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center gap-1.5 min-w-0">
											<span className="truncate">{item.title}</span>
											{item.badge && (
												<span className="text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0 whitespace-nowrap">
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
