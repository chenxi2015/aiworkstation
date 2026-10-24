import { createServerFn } from "@tanstack/react-start";
import type {
	BinaryFiles,
	LibraryItem,
	LibraryItems,
} from "@excalidraw/excalidraw/types";
import { workbenchDb } from "../db/sqlite.ts";

/**
 * Personal Excalidraw library persistence.
 *
 * The embedded <Excalidraw> component keeps 个人素材库 in React state only,
 * so imports vanish on page refresh. We persist the full LibraryItems array
 * into the SQLite settings KV (~/.aiworkstation/workbench.db) so it
 * survives reloads and can be synced/copied along with the rest of the
 * workbench data.
 *
 * Data model:
 *   settings["excalidrawPersonalLibrary"]      -> JSON: LibraryItems
 *   settings["excalidrawPersonalLibraryFiles"] -> JSON: BinaryFiles (image dataURLs)
 *
 * Binary files are stored alongside because library items containing image
 * elements only carry fileId references; without the dataURL payloads the
 * items would render as broken images after hydration.
 */

const LIBRARY_KEY = "excalidrawPersonalLibrary";
const LIBRARY_FILES_KEY = "excalidrawPersonalLibraryFiles";

// Loose structural guards — element payloads are opaque to us, but the
// persisted envelope must at least look like a library/files payload.
function isLibraryItem(value: unknown): value is LibraryItem {
	return (
		typeof value === "object" &&
		value !== null &&
		Array.isArray((value as { elements?: unknown }).elements)
	);
}

function isBinaryFiles(value: unknown): value is BinaryFiles {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const getExcalidrawPersonalLibrary = createServerFn({
	method: "GET",
}).handler(
	async (): Promise<{
		libraryItems: LibraryItems;
		files: BinaryFiles;
	}> => {
		try {
			const rawItems = workbenchDb.getSetting(LIBRARY_KEY);
			const rawFiles = workbenchDb.getSetting(LIBRARY_FILES_KEY);
			const libraryItems = rawItems ? JSON.parse(rawItems) : [];
			const files = rawFiles ? JSON.parse(rawFiles) : {};
			return {
				libraryItems: Array.isArray(libraryItems)
					? libraryItems.filter(isLibraryItem)
					: [],
				files: isBinaryFiles(files) ? files : {},
			};
		} catch (err) {
			console.warn("[getExcalidrawPersonalLibrary] read error:", err);
			return { libraryItems: [], files: {} };
		}
	},
);

export const saveExcalidrawPersonalLibrary = createServerFn({ method: "POST" })
	.validator(
		(data: { libraryItems: LibraryItems; files?: BinaryFiles | null }) =>
			data,
	)
	.handler(async ({ data }): Promise<{ success: boolean }> => {
		try {
			const items = Array.isArray(data.libraryItems)
				? data.libraryItems.filter(isLibraryItem)
				: [];
			workbenchDb.setSetting(LIBRARY_KEY, JSON.stringify(items));
			if (data.files && isBinaryFiles(data.files)) {
				workbenchDb.setSetting(LIBRARY_FILES_KEY, JSON.stringify(data.files));
			}
			return { success: true };
		} catch (err) {
			console.error("[saveExcalidrawPersonalLibrary] write error:", err);
			return { success: false };
		}
	});
