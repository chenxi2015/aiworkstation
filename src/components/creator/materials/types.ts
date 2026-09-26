import {
	Bookmark,
	FileText,
	Film,
	Headphones,
	Image as ImageIcon,
	Layers,
} from "lucide-react";
import type { Material } from "../types";

/** Folder selection states: all / unfiled / starred / specific folder id */
export type FolderSelection = "all" | "unfiled" | "starred" | number;

/** Material content type filter tabs */
export type TypeTab = "all" | "video" | "image" | "audio" | "doc" | "bookmark";

export const TYPE_TABS: Array<{
	id: TypeTab;
	label: string;
	icon: typeof Layers;
}> = [
	{ id: "all", label: "全部", icon: Layers },
	{ id: "video", label: "视频", icon: Film },
	{ id: "image", label: "图片", icon: ImageIcon },
	{ id: "audio", label: "音频", icon: Headphones },
	{ id: "doc", label: "文档", icon: FileText },
	{ id: "bookmark", label: "书签", icon: Bookmark },
];

export type MaterialKind = Exclude<TypeTab, "all">;

export interface MaterialKindConfig {
	label: string;
	icon: typeof Layers;
	/** Badge/Chip container styles (subtle background, readable text, border) */
	badgeClass: string;
	/** Accent text color */
	colorClass: string;
	/** Icon-specific accent color */
	iconClass: string;
}

export const KIND_CONFIG: Record<MaterialKind, MaterialKindConfig> = {
	video: {
		label: "视频",
		icon: Film,
		badgeClass:
			"bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
		colorClass: "text-purple-600 dark:text-purple-400",
		iconClass: "text-purple-500 dark:text-purple-400",
	},
	image: {
		label: "图片",
		icon: ImageIcon,
		badgeClass:
			"bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
		colorClass: "text-emerald-600 dark:text-emerald-400",
		iconClass: "text-emerald-500 dark:text-emerald-400",
	},
	doc: {
		label: "文档",
		icon: FileText,
		badgeClass:
			"bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
		colorClass: "text-blue-600 dark:text-blue-400",
		iconClass: "text-blue-500 dark:text-blue-400",
	},
	audio: {
		label: "音频",
		icon: Headphones,
		badgeClass:
			"bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
		colorClass: "text-amber-600 dark:text-amber-400",
		iconClass: "text-amber-500 dark:text-amber-400",
	},
	bookmark: {
		label: "书签",
		icon: Bookmark,
		badgeClass:
			"bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
		colorClass: "text-rose-600 dark:text-rose-400",
		iconClass: "text-rose-500 dark:text-rose-400",
	},
};

export const KIND_BADGES: Record<MaterialKind, string> = {
	video: KIND_CONFIG.video.label,
	image: KIND_CONFIG.image.label,
	audio: KIND_CONFIG.audio.label,
	doc: KIND_CONFIG.doc.label,
	bookmark: KIND_CONFIG.bookmark.label,
};

export const SOURCE_BADGES: Record<Material["sourceType"], string> = {
	manual: "手动",
	bookmark: "书签",
};

export const KIND_ICONS: Record<MaterialKind, typeof Layers> = {
	video: KIND_CONFIG.video.icon,
	image: KIND_CONFIG.image.icon,
	audio: KIND_CONFIG.audio.icon,
	doc: KIND_CONFIG.doc.icon,
	bookmark: KIND_CONFIG.bookmark.icon,
};
