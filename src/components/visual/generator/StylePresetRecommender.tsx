import { Sparkles } from "lucide-react";
import React from "react";
import type { StylePreset } from "./types";

export const STYLE_PRESETS: StylePreset[] = [
	{
		id: "editorial",
		name: "电子杂志风",
		tag: "Editorial",
		description: "大留白、优雅衬线体、微光胶片颗粒质感",
		promptModifier: "高端电子杂志排版风格，大面积呼吸感留白，优雅衬线美术字视觉中心，低饱和高级灰与局部柔和微光，胶片颗粒质感，电影感景深",
	},
	{
		id: "swiss",
		name: "瑞士国际网格",
		tag: "Swiss Grid",
		description: "严谨网格、冲击力粗黑体、单点高饱和强调色",
		promptModifier: "瑞士国际主义网格排版，严谨的信息层级对齐，粗黑大字艺术标题，克莱因蓝与暖橙单锚点视觉强调，极简现代设计",
	},
	{
		id: "3d_clay",
		name: "3D立体空间",
		tag: "3D Clay",
		description: "黏土与磨砂玻璃质感、漂浮几何构件、立体空间感",
		promptModifier: "现代3D立体设计，柔和低饱和黏土质感，磨砂玻璃与漂浮几何组件，柔和顶部漫射光照，微距景深虚化",
	},
	{
		id: "cyber_tech",
		name: "极客深色科技",
		tag: "Cyber Tech",
		description: "哑光暗黑底、霓虹微光呼吸线、硬核数码冷灰",
		promptModifier: "深色极客科技美学，哑光暗黑背景搭配单色霓虹微光呼吸线，高精细度数码矩阵，极简硬核质感",
	},
	{
		id: "retro_paper",
		name: "复古半色调纸纹",
		tag: "Retro Halftone",
		description: "复古网点印刷、温暖米黄纸纹底、文艺质感",
		promptModifier: "复古现代报纸印刷美学，半色调网点（Halftone）质感，温暖米黄纸纹底，双色胶版印刷感，浓郁复古文艺气息",
	},
	{
		id: "minimal_poster",
		name: "极简纯色海报",
		tag: "Minimal Poster",
		description: "纯色极简底、强烈黑白明暗对比、大字视觉锚点",
		promptModifier: "当代极简主义海报，大字视觉重心，极致黑白明暗对比，干净无杂质纯色背景，强烈视觉冲击力",
	},
];

interface StylePresetRecommenderProps {
	selectedPresetId?: string;
	onSelectPreset: (preset: StylePreset) => void;
	className?: string;
}

/**
 * Aesthetic style recommendation capsules for fast styling inspiration.
 */
export const StylePresetRecommender: React.FC<StylePresetRecommenderProps> =
	React.memo(function StylePresetRecommender({
		selectedPresetId,
		onSelectPreset,
		className = "",
	}) {
		return (
			<div className={`flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none ${className}`}>
				<div className="flex items-center gap-1 text-[11px] text-muted shrink-0 mr-0.5">
					<Sparkles className="w-3 h-3 text-accent" />
					<span>风格灵感:</span>
				</div>

				<div className="flex items-center gap-1.5 flex-nowrap">
					{STYLE_PRESETS.map((preset) => {
						const isSelected = selectedPresetId === preset.id;
						return (
							<button
								type="button"
								key={preset.id}
								onClick={() => onSelectPreset(preset)}
								className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium shrink-0 transition-all cursor-pointer border ${
									isSelected
										? "bg-accent/15 border-accent text-accent font-semibold shadow-2xs"
										: "bg-surface-secondary/60 hover:bg-surface-secondary border-border/70 text-foreground/80 hover:text-foreground"
								}`}
								title={`${preset.name}: ${preset.description}`}
							>
								<span>{preset.name}</span>
								<span className="text-[10px] text-muted/70 scale-90">
									{preset.tag}
								</span>
							</button>
						);
					})}
				</div>
			</div>
		);
	});

