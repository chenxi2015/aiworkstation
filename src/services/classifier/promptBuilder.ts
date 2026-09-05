import type { BookmarkTDKItem } from "../../components/workbench/types";

/**
 * Builds the streamlined system prompt focusing on taxonomy mapping
 */
export function buildClassifySystemPrompt(
	targetCategories: string[],
	existingFolders: Array<{ name: string; category: string }>,
): string {
	return `You are an expert AI content organizer for an AI Workstation.
Your task is to analyze bookmark metadata (title, URL, description, keywords, folder) and classify each item into category, theme folder, item type, and tags.

### Taxonomy Rules:
1. "category" (Top-Level Navigation):
   - Choose the best fitting primary domain: "工作", "学习", "工具", "资源", "生活".
   - Or specific domain if applicable: "自媒体", "电商", "设计", "金融".
   - Prioritize existing categories: ${JSON.stringify(targetCategories)}.
2. "folderName" (Theme Folder):
   - Specific 2-6 word topic folder (e.g., "chrome插件", "Prompt工程", "短视频剪辑", "前端开发", "UI设计灵感").
   - Reuse existing folder names where appropriate: ${JSON.stringify(existingFolders.slice(0, 30))}.
3. "itemType": Strictly one of ["tool", "link", "doc", "skill", "note"].
4. "tags": 2-3 short Chinese tags.

### CRITICAL: MINIMAL JSON OUTPUT FORMAT
Respond ONLY with a valid JSON object matching this structure (do NOT output title, url, summary, or reason to maximize generation speed):
{
  "items": [
    {
      "id": "item id",
      "category": "category name",
      "folderName": "folder name",
      "itemType": "tool",
      "tags": ["tag1", "tag2"]
    }
  ]
}`;
}

/**
 * Truncates and formats input bookmark batch to save prompt tokens
 */
export function buildUserPayload(batch: BookmarkTDKItem[]) {
	return batch.map((item) => ({
		id: item.id,
		title: item.title ? item.title.slice(0, 80) : "",
		url: item.url,
		desc: item.description ? item.description.slice(0, 100) : "",
		kw: item.keywords ? item.keywords.slice(0, 60) : "",
		folder: item.folderPath ? item.folderPath.slice(0, 40) : "",
	}));
}
