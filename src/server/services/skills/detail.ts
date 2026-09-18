import { type Dirent, promises as fs } from "node:fs";
import path from "node:path";
import type { SkillDetail } from "../../../components/skills/types.ts";
import { scanSkillsOverview } from "./overview.ts";
import { findSkillMd } from "./scanCore.ts";

const MAX_DETAIL_FILES = 300;
const MAX_MARKDOWN_BYTES = 256 * 1024;

async function listFiles(
	dir: string,
	base: string,
	out: string[],
	depth = 0,
): Promise<void> {
	if (depth > 6 || out.length >= MAX_DETAIL_FILES) return;
	let entries: Dirent[];
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (out.length >= MAX_DETAIL_FILES) return;
		if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
		const full = path.join(dir, entry.name);
		const rel = base ? `${base}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			await listFiles(full, rel, out, depth + 1);
		} else if (entry.isFile()) {
			out.push(rel);
		}
	}
}

/** 读取单个 skill 详情（SKILL.md 全文 + 文件清单），路径必须位于已知根目录内 */
export async function readSkillDetail(dirPath: string): Promise<SkillDetail> {
	const overview = await scanSkillsOverview();
	const skill = overview.skills.find((s) => s.dirPath === dirPath);
	if (!skill) {
		throw new Error(`Skill not found in known roots: ${dirPath}`);
	}
	let markdown: string | null = null;
	let truncated = false;
	try {
		// 详情页需要全文，但仍按 256KB 上限截断，且读入本身也限量（不再整文件入内存）
		const skillMdResult = await findSkillMd(dirPath, MAX_MARKDOWN_BYTES);
		if (skillMdResult) {
			markdown = skillMdResult.content;
			truncated = skillMdResult.truncated;
		}
	} catch {
		markdown = null;
	}
	const files: string[] = [];
	await listFiles(dirPath, "", files);
	if (files.length >= MAX_DETAIL_FILES) truncated = true;
	return { skill, markdown, files: files.sort(), truncated };
}
