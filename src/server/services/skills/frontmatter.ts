/** 轻量 frontmatter 解析：只支持顶层 key: value 与 metadata: 下的一级缩进字段 */
export function parseFrontmatter(content: string): {
	name?: string;
	description?: string;
	license?: string;
	version?: string;
	author?: string;
} {
	const result: Record<string, string> = {};
	const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
	if (!normalized.startsWith("---\n")) return result;
	const end = normalized.indexOf("\n---", 4);
	if (end === -1) return result;
	const block = normalized.slice(4, end);
	let inMetadata = false;
	for (const line of block.split("\n")) {
		if (!line.trim()) continue;
		const indent = line.length - line.trimStart().length;
		const match = line.trim().match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
		if (!match) continue;
		const [, key, rawValue] = match;
		const value = rawValue.replace(/^["']|["']$/g, "").trim();
		if (indent === 0) {
			inMetadata = key === "metadata";
			if (key === "name" || key === "description" || key === "license") {
				result[key] = value;
			}
		} else if (inMetadata && (key === "version" || key === "author")) {
			result[key] = value;
		}
	}
	return result;
}
