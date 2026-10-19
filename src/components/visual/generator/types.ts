import type { VisualAspectRatio } from "../../../types/visualGeneration";
import type { CoverItem } from "../../editor/publish-center/types";

export interface VisualCoverCardItem extends CoverItem {
	roleLabel?: string;
	pageIndex?: number;
	headline?: string;
	subHeadline?: string;
}

export type VisualGeneratorPlatform = "wechat" | "redbook" | "general" | "zhihu" | "twitter";

export interface StylePreset {
	id: string;
	name: string;
	tag: string;
	description: string;
	promptModifier: string;
}

export interface SocialVisualGeneratorProps {
	title: string;
	contentText: string;
	digest?: string;
	platform?: VisualGeneratorPlatform;
	covers: CoverItem[];
	selectedCoverIndex: number;
	selectedCoverIndices?: number[]; // Multi-selection for Redbook carousel
	defaultRatio?: VisualAspectRatio;
	defaultCount?: number;
	onSelectCover: (index: number) => void;
	onSelectCovers?: (indices: number[]) => void;
	onCoversChange: (covers: CoverItem[]) => void;
	className?: string;
}

