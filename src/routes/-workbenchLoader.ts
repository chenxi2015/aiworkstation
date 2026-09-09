import { WorkbenchStorageService } from "../services/workbenchStorage";

/**
 * Shared route loader for workbench-style pages (folders + unclassified + settings).
 */
export async function workbenchLoader() {
	const { folders, unclassified, activeCategory } =
		await WorkbenchStorageService.fetchAllFromDb();
	const settings = await WorkbenchStorageService.fetchSettingsFromDb();
	return { folders, unclassified, settings, activeCategory };
}
