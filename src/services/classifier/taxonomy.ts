/**
 * AI Classifier taxonomy and default configuration constants
 */

export const DEFAULT_LLM_KEY = "";
export const DEFAULT_LLM_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_LLM_MODEL = "deepseek-chat";

/**
 * Universal primary category taxonomy for AI classification.
 * Provides a universal cognitive foundation (Work, Study, Tools, Resources, Life, Workbench)
 * suitable for any demographic (students, researchers, developers, finance, creators, general public).
 */
export const UNIVERSAL_CATEGORY_DOMAINS = [
	"工作",
	"学习",
	"工具",
	"资源",
	"生活",
	"工作台",
] as const;

/**
 * Fallback category when AI returns empty or pseudo-category
 */
export const DEFAULT_FOLDER_CATEGORY = "工作台";

/**
 * Normalizes category name, falling back to DEFAULT_FOLDER_CATEGORY for empty or placeholder values
 */
export function sanitizeFolderCategory(category?: string): string {
	const trimmed = category?.trim();
	if (!trimmed || trimmed === "未分类") return DEFAULT_FOLDER_CATEGORY;
	return trimmed;
}
