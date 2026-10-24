import { FileText, LayoutGrid, Palette } from "lucide-react";
import type { ElementType } from "react";
import type { ChatDraftPayload } from "../../../../../hooks/ai/useChatMessages";

export interface DraftKindMeta {
	kindLabel: string;
	badgeLabel: string;
	icon: ElementType;
	iconBgClass: string;
	iconColorClass: string;
	badgeClass: string;
	isArticle: boolean;
	isJsonKind: boolean;
	displayTitle: string;
	summaryDesc: string;
}

/**
 * Returns UI metadata and theme styling for a given draft payload.
 */
export function getDraftKindMeta(draft: ChatDraftPayload): DraftKindMeta {
	const isExcalidraw = draft.kind === "excalidraw";
	const isCanvas = draft.kind === "canvas";

	if (isExcalidraw) {
		return {
			kindLabel: "画板",
			badgeLabel: "Excalidraw",
			icon: Palette,
			iconBgClass: "bg-fuchsia-500/10 dark:bg-fuchsia-500/20",
			iconColorClass: "text-fuchsia-600 dark:text-fuchsia-400",
			badgeClass:
				"bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/20",
			isArticle: false,
			isJsonKind: true,
			displayTitle: draft.title,
			summaryDesc: `画板 · 包含 ${draft.wordCount} 个图形与连线`,
		};
	}

	if (isCanvas) {
		return {
			kindLabel: "白板",
			badgeLabel: "Canvas",
			icon: LayoutGrid,
			iconBgClass: "bg-sky-500/10 dark:bg-sky-500/20",
			iconColorClass: "text-sky-600 dark:text-sky-400",
			badgeClass:
				"bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
			isArticle: false,
			isJsonKind: true,
			displayTitle: draft.title,
			summaryDesc: `白板 · 包含 ${draft.wordCount} 个节点与连线`,
		};
	}

	return {
		kindLabel: "笔记",
		badgeLabel: "草稿",
		icon: FileText,
		iconBgClass: "bg-accent/10 dark:bg-accent/20",
		iconColorClass: "text-accent",
		badgeClass: "bg-accent/10 text-accent border-accent/20",
		isArticle: true,
		isJsonKind: false,
		displayTitle: `《${draft.title}》`,
		summaryDesc: `文档 · 约 ${draft.wordCount} 字`,
	};
}
