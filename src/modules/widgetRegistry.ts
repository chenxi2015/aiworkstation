import {
	Blocks,
	CalendarDays,
	FolderOpen,
	Gauge,
	Inbox,
	type LucideIcon,
	Megaphone,
	PenLine,
	Sparkles,
} from "lucide-react";

/**
 * Workbench Widget Registry — 工作台仪表盘的单一事实源（约定大于配置）。
 *
 * 工作台不再是文件夹网格，而是跨模块汇总的可组合仪表盘：
 * 每个 widget 是一个信息/快捷入口卡片，用户通过 settings.workbenchLayout
 * 自由组合（顺序 / 显隐 / 宽窄）。新增 widget = 注册表加一行 + 建一个组件。
 */

export interface WidgetDef {
	/** 稳定标识，settings.workbenchLayout 通过它关联 */
	id: string;
	/** 卡片标题 */
	label: string;
	/** 卡片副标题（用途说明） */
	description: string;
	icon: LucideIcon;
	/** 默认占两列（宽卡），缺省占一列 */
	defaultWide?: boolean;
	/** 所属模块 code：卡片提供「进入模块」跳转；无则为纯信息卡 */
	moduleCode?: string;
	/** 色彩身份（卡片图标/高亮的柔和配色，见 WidgetCard 的 TONE_STYLES） */
	tone: WidgetTone;
}

export type WidgetTone =
	| "amber"
	| "sky"
	| "violet"
	| "emerald"
	| "indigo"
	| "cyan"
	| "teal"
	| "rose";

export const WORKBENCH_WIDGETS: readonly WidgetDef[] = [
	{
		id: "inbox",
		label: "待整理",
		description: "未分类缓冲池：新采集内容等待归位",
		icon: Inbox,
		tone: "amber",
	},
	{
		id: "recent-bookmarks",
		label: "最近收藏",
		description: "全库最新入库的书签",
		icon: Sparkles,
		defaultWide: true,
		tone: "sky",
	},
	{
		id: "creator-pipeline",
		label: "自媒体管道",
		description: "素材 → 二创 → 审稿的流水线状态",
		icon: Megaphone,
		moduleCode: "creator",
		tone: "violet",
	},
	{
		id: "editor-recent",
		label: "创作文档",
		description: "最近编辑的创作台文档",
		icon: PenLine,
		moduleCode: "editor",
		tone: "emerald",
	},
	{
		id: "folder-shortcuts",
		label: "常用文件夹",
		description: "按内容量排序的文件夹速览",
		icon: FolderOpen,
		tone: "indigo",
	},
	{
		id: "skills-overview",
		label: "Skills 概览",
		description: "本机 skills 目录集合状态",
		icon: Blocks,
		moduleCode: "skills",
		tone: "cyan",
	},
	{
		id: "insights",
		label: "资产与健康",
		description: "知识资产统计、向量覆盖与死链巡检",
		icon: Gauge,
		defaultWide: true,
		tone: "teal",
	},
	{
		id: "activity-calendar",
		label: "活动日历",
		description: "按日热点：收藏/素材/二创/创作的当日任务",
		icon: CalendarDays,
		defaultWide: true,
		tone: "rose",
	},
] as const;

/** 用户自定义仪表盘布局（存 settings.workbenchLayout），未出现的 widget 按默认顺序追加 */
export interface WorkbenchLayoutEntry {
	id: string;
	visible: boolean;
	/** 宽卡（占两列）；缺省用注册表 defaultWide */
	wide?: boolean;
}

export interface ResolvedWidget extends WidgetDef {
	wide: boolean;
}

export function getWidgetById(id: string): WidgetDef | undefined {
	return WORKBENCH_WIDGETS.find((w) => w.id === id);
}

/** 合并注册表与用户布局，得到最终渲染的 widget 列表（有序、按 visible 过滤、解析 wide） */
export function resolveWorkbenchLayout(
	layout?: WorkbenchLayoutEntry[],
): ResolvedWidget[] {
	const toResolved = (def: WidgetDef, wide?: boolean): ResolvedWidget => ({
		...def,
		wide: wide ?? def.defaultWide ?? false,
	});
	if (!layout || layout.length === 0) {
		return WORKBENCH_WIDGETS.map((w) => toResolved(w));
	}
	const ordered: ResolvedWidget[] = [];
	const seen = new Set<string>();
	for (const entry of layout) {
		if (!entry.visible) continue;
		const def = getWidgetById(entry.id);
		if (def && !seen.has(def.id)) {
			ordered.push(toResolved(def, entry.wide));
			seen.add(def.id);
		}
	}
	for (const def of WORKBENCH_WIDGETS) {
		if (!seen.has(def.id)) ordered.push(toResolved(def));
	}
	return ordered;
}
