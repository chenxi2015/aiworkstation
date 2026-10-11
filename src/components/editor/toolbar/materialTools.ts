import { Image, Library, Music, Video } from "lucide-react";

/**
 * 创作台工具栏「素材库」工具注册表（约定大于配置，对齐 navLayout / workbenchLayout 既定约定，
 * 见 docs/studio-materials-link-plan.md 第四节）。
 * 新增素材工具 = 注册表加一行；用户布局（显隐/顺序）存 settings.editorToolbarLayout。
 */

/** 选择器预选的素材类型 */
export type MaterialToolKind = "image" | "video" | "audio" | "all";

export interface MaterialToolDef {
	/** 稳定 id（用户布局按 id 匹配） */
	id: string;
	label: string;
	icon: typeof Image;
	kind: MaterialToolKind;
}

export const MATERIAL_TOOLS: readonly MaterialToolDef[] = [
	{ id: "material:image", label: "图片素材", icon: Image, kind: "image" },
	{ id: "material:video", label: "视频素材", icon: Video, kind: "video" },
	{ id: "material:audio", label: "音频素材", icon: Music, kind: "audio" },
	{ id: "material:all", label: "浏览全部素材", icon: Library, kind: "all" },
] as const;

/** 用户自定义工具栏素材工具布局（存 settings.editorToolbarLayout） */
export interface EditorToolbarLayoutEntry {
	id: string;
	visible: boolean;
}

export function getMaterialToolById(id: string): MaterialToolDef | undefined {
	return MATERIAL_TOOLS.find((t) => t.id === id);
}

/** 合并注册表与用户布局，得到最终素材工具列表（有序、按 visible 过滤） */
export function resolveMaterialTools(
	layout?: EditorToolbarLayoutEntry[],
): MaterialToolDef[] {
	if (!layout || layout.length === 0) return [...MATERIAL_TOOLS];
	const ordered: MaterialToolDef[] = [];
	const seen = new Set<string>();
	for (const entry of layout) {
		if (!entry.visible) continue;
		const tool = getMaterialToolById(entry.id);
		if (tool && !seen.has(tool.id)) {
			ordered.push(tool);
			seen.add(tool.id);
		}
	}
	for (const tool of MATERIAL_TOOLS) {
		if (!seen.has(tool.id)) ordered.push(tool);
	}
	return ordered;
}
