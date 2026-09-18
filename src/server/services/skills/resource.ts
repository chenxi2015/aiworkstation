import { promises as fs } from "node:fs";
import path from "node:path";
import { assertPathWithinRoot, formatBytes } from "../../ai/fs/fsSafety.ts";
import { scanSkillsOverview } from "./overview.ts";
import { readFileCapped } from "./scanCore.ts";

/** read_skill_resource 单文件读取上限，超出截断 */
const MAX_SKILL_RESOURCE_BYTES = 1024 * 1024;

/**
 * Find skill directory by absolute path or name/dirName
 */
export async function resolveSkillDir(
	dirPathOrName: string,
): Promise<string | null> {
	if (!dirPathOrName) return null;
	const overview = await scanSkillsOverview();
	const trimmed = dirPathOrName.trim();
	const normalized = trimmed.toLowerCase();

	const found = overview.skills.find(
		(s) =>
			s.dirPath === trimmed ||
			s.name.toLowerCase() === normalized ||
			s.dirName.toLowerCase() === normalized ||
			path.basename(s.dirPath).toLowerCase() === normalized,
	);
	if (found) return found.dirPath;

	// Check direct absolute path exists
	if (path.isAbsolute(trimmed)) {
		try {
			const stat = await fs.stat(trimmed);
			if (stat.isDirectory()) return trimmed;
		} catch {
			// not a valid directory
		}
	}
	return null;
}

/**
 * Safely read a resource file inside a skill directory
 */
export async function readSkillResourceFile(
	skillDirPathOrName: string,
	relativePath: string,
): Promise<{
	success: boolean;
	content?: string;
	error?: string;
	filePath?: string;
}> {
	const dirPath = await resolveSkillDir(skillDirPathOrName);
	if (!dirPath) {
		return {
			success: false,
			error: `Skill directory not found: ${skillDirPathOrName}`,
		};
	}

	// Normalize and prevent path traversal
	const cleanRelPath = path
		.normalize(relativePath)
		.replace(/^(\.\.[/\\])+/, "");
	const targetPath = path.resolve(dirPath, cleanRelPath);

	// 基于 realpath 的包含校验（复用 fs 工具同款护栏）：
	// 同时拦截 ../ 穿越、无分隔符前缀误配（/a/bc 冒充 /a/b 子路径）与符号链接逃逸
	try {
		assertPathWithinRoot(targetPath, dirPath);
	} catch {
		return { success: false, error: "Access denied: Path traversal detected" };
	}

	try {
		const stat = await fs.stat(targetPath);
		if (!stat.isFile()) {
			return { success: false, error: `Path is not a file: ${cleanRelPath}` };
		}
		// 限量读入：超大文件（如误放的视频/数据集）不整个塞进工具结果
		const { rawBuffer, truncated } = await readFileCapped(
			targetPath,
			MAX_SKILL_RESOURCE_BYTES,
		);
		let content = rawBuffer.toString("utf8");
		if (truncated) {
			content += `\n\n[系统提示] 文件超过 ${formatBytes(MAX_SKILL_RESOURCE_BYTES)}，仅载入前 ${formatBytes(MAX_SKILL_RESOURCE_BYTES)}，其余内容已省略。`;
		}
		return { success: true, content, filePath: cleanRelPath };
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		return { success: false, error: `Failed to read file: ${msg}` };
	}
}
