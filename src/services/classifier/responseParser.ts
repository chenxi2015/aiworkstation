import { jsonrepair } from "jsonrepair";
import type {
	AIClassificationResult,
	BookmarkTDKItem,
	ItemType,
} from "../../components/workbench/types";
import { DEFAULT_FOLDER_CATEGORY, sanitizeFolderCategory } from "./taxonomy";

interface RawClassificationItem {
	id?: string | number;
	title?: string;
	url?: string;
	category?: string;
	folderName?: string;
	folderDesc?: string;
	itemType?: string;
	summary?: string;
	tags?: string[];
	reason?: string;
}

const VALID_ITEM_TYPES: ItemType[] = ["tool", "link", "doc", "skill", "note"];

/**
 * Safely extracts and parses JSON from AI model response string using jsonrepair,
 * stripping reasoning tags (<think>...</think>) and repairing malformed JSON
 */
export function extractAndParseJSON(raw: unknown): unknown {
	if (raw === null || raw === undefined || raw === "") {
		throw new Error("Empty response from AI model");
	}
	if (typeof raw === "object") {
		return raw;
	}
	if (typeof raw !== "string") {
		throw new Error("Unexpected non-string response from AI model");
	}

	// 1. Strip reasoning / think tags (e.g. DeepSeek-R1 / reasoner models)
	const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

	// 2. Automatically repair and parse malformed / markdown-wrapped LLM JSON
	try {
		return JSON.parse(jsonrepair(cleaned));
	} catch (err) {
		throw new Error(
			`Failed to parse and repair JSON from AI response: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

/**
 * Normalizes and maps raw parsed LLM JSON output against the bookmark batch
 */
export function mapAIResponseToResults(
	rawParsed: unknown,
	batch: BookmarkTDKItem[],
): AIClassificationResult[] {
	let rawItems: RawClassificationItem[] = [];
	if (Array.isArray(rawParsed)) {
		rawItems = rawParsed as RawClassificationItem[];
	} else if (rawParsed && typeof rawParsed === "object") {
		const obj = rawParsed as Record<string, unknown>;
		const candidate = obj.items || obj.bookmarks || obj.data;
		if (Array.isArray(candidate)) {
			rawItems = candidate as RawClassificationItem[];
		}
	}

	return batch.map((item) => {
		const matched = rawItems.find(
			(p) =>
				String(p?.id) === String(item.id) || (p?.url && p.url === item.url),
		);

		const rawType =
			matched?.itemType || (item.url.includes("github.com") ? "tool" : "link");
		const itemType = VALID_ITEM_TYPES.includes(rawType as ItemType)
			? (rawType as ItemType)
			: "link";

		return {
			id: item.id,
			title: item.title || item.url,
			url: item.url,
			category: sanitizeFolderCategory(matched?.category),
			folderName: matched?.folderName || item.parentTitle || "常用收藏",
			folderDesc: matched?.folderDesc || "",
			itemType,
			summary: item.description || item.title || item.url,
			tags:
				Array.isArray(matched?.tags) && matched.tags.length > 0
					? matched.tags.filter(
							(t): t is string => typeof t === "string" && Boolean(t.trim()),
						)
					: item.keywords
						? item.keywords
								.split(",")
								.slice(0, 3)
								.map((s) => s.trim())
						: [],
			reason: matched?.reason || "Based on TDK analysis",
		};
	});
}

/**
 * Creates heuristic fallback classification items when AI batch fails after retries
 */
export function buildFallbackResults(
	batch: BookmarkTDKItem[],
	error?: Error | null,
): AIClassificationResult[] {
	return batch.map((item) => ({
		id: item.id,
		title: item.title,
		url: item.url,
		category: DEFAULT_FOLDER_CATEGORY,
		folderName: item.parentTitle || "常用收藏",
		folderDesc: "未分类书签归集",
		itemType: (item.url.includes("github.com") ? "tool" : "link") as ItemType,
		summary: item.description || item.title || item.url,
		tags: item.keywords
			? item.keywords
					.split(",")
					.slice(0, 3)
					.map((s) => s.trim())
			: [],
		reason: `AI classification error: ${error?.message || "Unknown error"}`,
	}));
}
