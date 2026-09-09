import {
	Blocks,
	Bookmark,
	GraduationCap,
	LayoutGrid,
	type LucideIcon,
	Megaphone,
	PenLine,
	ShoppingBag,
} from "lucide-react";

/**
 * Module Registry — 产品导航的单一事实源（约定大于配置）。
 *
 * 顶部导航是固定的「功能模块」集合，每个模块有稳定的 code 与独立 route。
 * folders.category 存模块 code（或历史中文别名），通过本注册表解析归属与展示名；
 * 不在注册表内的 category 值视为书签模块下的自定义分组。
 */

/** 书签模块内的两个内置筛选 */
export const ALL_CATEGORY = "全部";
export const UNCLASSIFIED_CATEGORY = "未分类";

/** 模块路由字面量联合（与各 route 文件一一对应） */
export type ModuleRoute =
	| "/workbench"
	| "/bookmarks"
	| "/creator"
	| "/learn"
	| "/editor"
	| "/ecommerce"
	| "/skills";

export interface ModuleDef {
	/** 稳定标识，folders.category 通过它关联模块 */
	code: string;
	/** 显示名（导航、标题） */
	label: string;
	/** 模块路由 */
	route: ModuleRoute;
	icon: LucideIcon;
	/** 模块定位描述（占位页/空态使用） */
	description: string;
	/** 历史中文分类名 → 模块 code 的别名（向后兼容，免数据迁移） */
	aliases?: string[];
}

export const MODULES: readonly ModuleDef[] = [
	{
		code: "workbench",
		label: "工作台",
		route: "/workbench",
		icon: LayoutGrid,
		description: "个人工作首页：快捷入口、待整理与功能卡片的可自定义组合。",
		aliases: ["工作台"],
	},
	{
		code: "bookmarks",
		label: "书签",
		route: "/bookmarks",
		icon: Bookmark,
		description: "全部书签库与未分类缓冲池，按分类筛选浏览。",
		aliases: ["书签"],
	},
	{
		code: "creator",
		label: "自媒体",
		route: "/creator",
		icon: Megaphone,
		description: "采集 → AI 二创 → 草稿审稿 → 人工确认发布的自媒体工作流。",
		aliases: ["自媒体"],
	},
	{
		code: "learn",
		label: "学习",
		route: "/learn",
		icon: GraduationCap,
		description: "学习主题资源聚合与学习路径管理。",
		aliases: ["学习"],
	},
	{
		code: "editor",
		label: "创作",
		route: "/editor",
		icon: PenLine,
		description: "强大的文本预览与 Markdown 操作台。",
		aliases: ["创作"],
	},
	{
		code: "ecommerce",
		label: "电商",
		route: "/ecommerce",
		icon: ShoppingBag,
		description: "电商选品、素材与运营资源的归集。",
		aliases: ["电商"],
	},
	{
		code: "skills",
		label: "Skills",
		route: "/skills",
		icon: Blocks,
		description: "本地散落的 skills 目录集合管理。",
	},
] as const;

/** 用户自定义导航布局（存 settings.navLayout），未出现的模块按默认顺序追加 */
export interface NavLayoutEntry {
	code: string;
	visible: boolean;
}

export function getModuleByCode(code: string): ModuleDef | undefined {
	return MODULES.find((m) => m.code === code);
}

export function getModuleByRoute(pathname: string): ModuleDef | undefined {
	return MODULES.find((m) => m.route === pathname);
}

/** 按 category 值（code 或别名）反查所属模块 */
export function getModuleByCategory(category: string): ModuleDef | undefined {
	const trimmed = category.trim();
	return MODULES.find(
		(m) => m.code === trimmed || m.aliases?.includes(trimmed),
	);
}

/** category 展示名：模块 code/别名 → 模块 label；否则原样（自定义分组） */
export function resolveCategoryLabel(category: string): string {
	return getModuleByCategory(category)?.label ?? category;
}

/** folder.category 是否归属于目标分类（code 与别名互通匹配） */
export function matchesCategory(
	folderCategory: string | undefined | null,
	target: string,
): boolean {
	if (!folderCategory) return false;
	const a = folderCategory.trim();
	const b = target.trim();
	if (a === b) return true;
	const moduleOfA = getModuleByCategory(a);
	const moduleOfB = getModuleByCategory(b);
	return Boolean(moduleOfA && moduleOfB && moduleOfA.code === moduleOfB.code);
}

/** 系统保留分类：内置筛选（全部/未分类）或模块 code/别名 —— 不可重命名 */
export function isSystemCategory(category: string): boolean {
	const trimmed = category.trim();
	return (
		trimmed === ALL_CATEGORY ||
		trimmed === UNCLASSIFIED_CATEGORY ||
		Boolean(getModuleByCategory(trimmed))
	);
}

/** 合并注册表与用户布局，得到最终导航项（有序、按 visible 过滤） */
export function resolveNavModules(navLayout?: NavLayoutEntry[]): ModuleDef[] {
	if (!navLayout || navLayout.length === 0) return [...MODULES];
	const ordered: ModuleDef[] = [];
	const seen = new Set<string>();
	for (const entry of navLayout) {
		if (!entry.visible) continue;
		const mod = getModuleByCode(entry.code);
		if (mod && !seen.has(mod.code)) {
			ordered.push(mod);
			seen.add(mod.code);
		}
	}
	for (const mod of MODULES) {
		if (!seen.has(mod.code)) ordered.push(mod);
	}
	return ordered;
}

/** 书签页分类筛选的初始值清洗：模块 code/别名/空值 → 全部 */
export function sanitizeBookmarkFilter(category?: string | null): string {
	const trimmed = category?.trim();
	if (!trimmed) return ALL_CATEGORY;
	if (trimmed === ALL_CATEGORY || trimmed === UNCLASSIFIED_CATEGORY) {
		return trimmed;
	}
	if (getModuleByCategory(trimmed)) return ALL_CATEGORY;
	return trimmed;
}
