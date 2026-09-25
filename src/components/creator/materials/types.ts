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

export const KIND_BADGES: Record<Exclude<TypeTab, "all">, string> = {
	video: "视频",
	image: "图片",
	audio: "音频",
	doc: "文档",
	bookmark: "书签",
};

export const SOURCE_BADGES: Record<Material["sourceType"], string> = {
	manual: "手动",
	bookmark: "书签",
};

export const KIND_ICONS: Record<Exclude<TypeTab, "all">, typeof Layers> = {
	video: Film,
	image: ImageIcon,
	audio: Headphones,
	doc: FileText,
	bookmark: Bookmark,
};
