import { createServerFn } from "@tanstack/react-start";
import type {
	InstallSkillResult,
	SkillDetail,
	SkillsOverview,
	UninstallSkillResult,
} from "../../components/skills/types.ts";
import {
	type InstallSkillOptions,
	installSkill,
	readSkillDetail,
	scanSkillsOverview,
	uninstallSkill,
} from "../services/skills/index.ts";

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

/**
 * Server Function: 安装新技能 (支持 Git 仓库克隆或脚手架生成)
 */
export const installSkillFn = createServerFn({ method: "POST" })
	.validator((data: InstallSkillOptions) => data)
	.handler(async ({ data }): Promise<InstallSkillResult> => {
		return await installSkill(data);
	});

/**
 * Server Function: 安全卸载指定技能目录
 */
export const uninstallSkillFn = createServerFn({ method: "POST" })
	.validator((data: { dirPath: string }) => data)
	.handler(async ({ data }): Promise<UninstallSkillResult> => {
		return await uninstallSkill(data.dirPath);
	});
