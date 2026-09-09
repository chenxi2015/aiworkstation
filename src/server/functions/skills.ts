import { createServerFn } from "@tanstack/react-start";
import type {
	SkillDetail,
	SkillsOverview,
} from "../../components/skills/types.ts";
import {
	readSkillDetail,
	scanSkillsOverview,
} from "../services/skillsScanner.ts";

/**
 * Server Function: 扫描本机 skill 根目录，返回聚合概览（60s 缓存）
 */
export const getSkillsOverview = createServerFn({ method: "GET" })
	.validator((data?: { force?: boolean }) => data ?? {})
	.handler(async ({ data }): Promise<SkillsOverview> => {
		return await scanSkillsOverview(Boolean(data.force));
	});

/**
 * Server Function: 读取单个 skill 的 SKILL.md 全文与文件清单
 */
export const getSkillDetail = createServerFn({ method: "POST" })
	.validator((data: { dirPath: string }) => data)
	.handler(async ({ data }): Promise<SkillDetail> => {
		return await readSkillDetail(data.dirPath);
	});
