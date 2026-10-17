import {
	generateVisualImage,
	type GenerateVisualImageInput,
	type GenerateVisualImageResult,
} from "../../server/functions/visualGen.ts";

/**
 * Call server-side visual image generation API.
 */
export async function requestVisualImageGeneration(
	input: GenerateVisualImageInput,
): Promise<GenerateVisualImageResult> {
	return generateVisualImage({ data: input });
}

