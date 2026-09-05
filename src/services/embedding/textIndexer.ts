/**
 * Builds rich semantic indexing text from a bookmark item
 */
export function createIndexingText(item: {
	title: string;
	url?: string;
	description?: string;
	keywords?: string;
	summary?: string;
	tags?: string | string[];
	parent_title?: string;
}): string {
	const parts: string[] = [];
	if (item.title) parts.push(`标题: ${item.title}`);
	if (item.summary && item.summary !== item.title)
		parts.push(`摘要: ${item.summary}`);
	if (item.description) parts.push(`描述: ${item.description}`);
	if (item.keywords) parts.push(`关键词: ${item.keywords}`);
	if (item.parent_title) parts.push(`分类: ${item.parent_title}`);

	let tagList: string[] = [];
	if (Array.isArray(item.tags)) {
		tagList = item.tags;
	} else if (typeof item.tags === "string" && item.tags.trim()) {
		try {
			tagList = JSON.parse(item.tags);
		} catch {
			tagList = item.tags.split(",").map((s) => s.trim());
		}
	}
	if (tagList.length > 0) parts.push(`标签: ${tagList.join(", ")}`);

	return parts.join("\n");
}
