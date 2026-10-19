import type React from "react";
import type { VisualAspectRatio } from "../../../types/visualGeneration";
import { SocialVisualGenerator } from "../../visual/generator/SocialVisualGenerator";
import type { CoverItem } from "./types";

export interface PublishVisualSectionProps {
	title: string;
	contentText: string;
	digest: string;
	covers: CoverItem[];
	selectedCoverIndex: number;
	onSelectCover: (index: number) => void;
	onCoversChange: (covers: CoverItem[]) => void;
	defaultRatio?: VisualAspectRatio;
}

/**
 * Legacy bridge wrapper for SocialVisualGenerator to preserve backwards compatibility.
 */
export const PublishVisualSection: React.FC<PublishVisualSectionProps> = (
	props,
) => {
	return <SocialVisualGenerator {...props} />;
};
