import type {
	SkillDetail,
	SkillsOverview,
} from "../../components/skills/types";
import {
	getSkillDetail,
	getSkillsOverview,
} from "../../server/functions/skills";

const EMPTY_OVERVIEW: SkillsOverview = { roots: [], skills: [], scannedAt: 0 };

/**
 * 获取本机 skills 扫描概览（force=true 绕过服务端 60s 缓存重新扫描）
 */
export async function fetchSkillsOverview(
	force = false,
): Promise<SkillsOverview> {
	try {
		return (await getSkillsOverview({ data: { force } })) ?? EMPTY_OVERVIEW;
	} catch (err) {
		console.warn("[skillsClient] getSkillsOverview error:", err);
		return EMPTY_OVERVIEW;
	}
}

/**
 * 读取单个 skill 的详情（SKILL.md 全文 + 文件清单）
 */
export async function fetchSkillDetail(
	dirPath: string,
): Promise<SkillDetail | null> {
	try {
		return await getSkillDetail({ data: { dirPath } });
	} catch (err) {
		console.warn("[skillsClient] getSkillDetail error:", err);
		return null;
	}
}
