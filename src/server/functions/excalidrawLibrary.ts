import { createServerFn } from "@tanstack/react-start";
import type {
	BinaryFiles,
	LibraryItems,
} from "@excalidraw/excalidraw/types";
import {
	getPersonalLibraryData,
	savePersonalLibraryData,
} from "../services/personalLibrary.ts";

/**
 * Server Function: Retrieve personal Excalidraw library items and files
 */
export const getExcalidrawPersonalLibrary = createServerFn({
	method: "GET",
}).handler(
	async (): Promise<{
		libraryItems: LibraryItems;
		files: BinaryFiles;
	}> => {
		return getPersonalLibraryData();
	},
);

/**
 * Server Function: Save personal Excalidraw library items and files
 */
export const saveExcalidrawPersonalLibrary = createServerFn({ method: "POST" })
	.validator(
		(data: { libraryItems: LibraryItems; files?: BinaryFiles | null }) =>
			data,
	)
	.handler(async ({ data }): Promise<{ success: boolean }> => {
		return savePersonalLibraryData(data);
	});
