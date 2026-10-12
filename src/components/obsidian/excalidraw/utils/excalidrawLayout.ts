import type { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
	generateExcalidrawElements,
	type SharedRawElement,
} from "@/shared/excalidraw/elementFactory.ts";
import type { ExcalidrawDrawInput } from "../../types";

export type ConvertToExcalidrawElementsFn = typeof convertToExcalidrawElements;

export * from "./arrowRouter.ts";
export * from "./constants.ts";
export * from "./dag.ts";
export * from "./dimensions.ts";
export * from "./layouts/index.ts";
// Re-export core utilities for consumers and tests
export * from "./types.ts";

/**
 * Generate standard Excalidraw elements from abstract AI draw inputs.
 *
 * Delegates layout math and raw config building to the shared dependency-free
 * factory (`src/shared/excalidraw/elementFactory`), then optionally enhances
 * the result through the official `convertToExcalidrawElements` converter for
 * maximum client-side fidelity. Without a converter, raw configs are returned
 * as-is (the view's `restore()` backfills missing runtime fields).
 */
export function buildExcalidrawElements(
	input: ExcalidrawDrawInput,
	existingElements: readonly ExcalidrawElement[] = [],
	converter?: ConvertToExcalidrawElementsFn,
): readonly ExcalidrawElement[] {
	const { mode = "append" } = input;

	const rawConfigs = generateExcalidrawElements(input, {
		existingElements: existingElements as readonly SharedRawElement[],
	});

	// Enhance via official converter when available, otherwise use raw JSON
	const generated =
		(converter
			? converter(
					rawConfigs as unknown as Parameters<ConvertToExcalidrawElementsFn>[0],
				)
			: (rawConfigs as unknown as ExcalidrawElement[])) || [];

	if (mode === "replace") {
		return generated;
	}

	return [...existingElements, ...generated];
}
