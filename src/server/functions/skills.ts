import { createServerFn } from "@tanstack/react-start";
import type {
	InstallSkillResult,
	SkillDetail,
	SkillsOverview,
	UninstallSkillResult,
} from "../../components/skills/types.ts";
import {
	type InstallSkillOptions,
	inspectGitHubSkill,
	installSkill,
	openSkillDirectory,
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
 * Server Function: 在系统文件管理器中打开技能所在目录
 */
export const openSkillDirFn = createServerFn({ method: "POST" })
	.validator((data: { dirPath: string }) => data)
	.handler(
		async ({ data }): Promise<{ success: boolean; message?: string }> => {
			return await openSkillDirectory(data.dirPath);
		},
	);

/**
 * Server Function: 安装新技能 (支持 Git 仓库克隆、脚手架生成或本地上传)
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

/**
 * Server Function: 识别 GitHub 仓库或子路径的技能元数据
 */
export const inspectGitHubSkillFn = createServerFn({ method: "POST" })
	.validator((data: { repoInput: string }) => data)
	.handler(async ({ data }) => {
		return await inspectGitHubSkill(data.repoInput);
	});
