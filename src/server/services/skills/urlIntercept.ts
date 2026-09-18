import { scanSkillsOverview } from "./overview.ts";
import { readSkillResourceFile } from "./resource.ts";

/**
 * Check if a URL looks like an attempt to fetch a skill resource from GitHub/raw.
 * If so, intercepts and returns the local file content if found.
 */
export async function tryInterceptSkillUrl(
	url: string,
): Promise<string | null> {
	if (!url || !/github(usercontent)?\.com/i.test(url)) return null;

	try {
		const parsed = new URL(url);
		const pathname = decodeURIComponent(parsed.pathname);

		// Match relative markdown file target, e.g. references/theme-index.md or SKILL.md
		const fileMatch = pathname.match(
			/(?:references\/[^/]+\.md|SKILL\.md|[^/]+\.md)$/i,
		);
		if (!fileMatch) return null;

		const targetFile = fileMatch[0];

		const overview = await scanSkillsOverview();
		for (const skill of overview.skills) {
			const skillKey = skill.dirName.toLowerCase();
			const cleanKey = skillKey.replace(/[-_]/g, "");
			const pathLower = pathname.toLowerCase();
			if (pathLower.includes(skillKey) || pathLower.includes(cleanKey)) {
				const res = await readSkillResourceFile(skill.dirPath, targetFile);
				if (res.success && res.content) {
					return `[系统保护：已拦截外网爬虫请求，直接从本地读取]\n检测到正在尝试通过网络抓取本地技能「${skill.name}」的文档 [${targetFile}]。该技能已完整安装于本地，已直接从本地磁盘载入内容：\n\n${res.content}`;
				}
			}
		}
	} catch {
		// Ignore URL parsing errors
	}
	return null;
}
