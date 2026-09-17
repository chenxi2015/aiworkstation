import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import {
	readSkillResourceFile,
	resolveSkillDir,
} from "../../services/skillsScanner.ts";
import type { ToolExecutionResult } from "./types.ts";

export const readSkillResourceInputSchema = z
	.object({
		relativePath: z
			.string()
			.describe(
				"技能目录下的相对文件路径（例如：references/theme-red-white.md、references/theme-index.md、references/common-components.md）",
			),
		skillName: z
			.string()
			.optional()
			.describe(
				"技能名称或目录名（例如：gzh-design，若省略则自动匹配当前技能）",
			),
	})
	.passthrough();

export type ReadSkillResourceInput = z.infer<
	typeof readSkillResourceInputSchema
>;

/**
 * Execute reading a local file within a skill directory
 */
export async function executeReadSkillResource(
	input: ReadSkillResourceInput,
	activeSkillDir?: string,
): Promise<ToolExecutionResult> {
	const skillTarget = input.skillName || activeSkillDir;

	if (!skillTarget) {
		return {
			toolName: "read_skill_resource",
			summary:
				"读取失败：未指定技能名称（skillName），且当前上下文中未检测到已激活的本地技能。请在入参中传入 skillName。",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const resolvedDir = await resolveSkillDir(skillTarget);

	if (!resolvedDir) {
		return {
			toolName: "read_skill_resource",
			summary: `未找到指定的本地技能目录「${skillTarget}」。请检查技能名称是否正确，且已安装于本机。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const res = await readSkillResourceFile(resolvedDir, input.relativePath);

	if (!res.success || !res.content) {
		return {
			toolName: "read_skill_resource",
			summary: `读取技能本地文件失败 [${input.relativePath}]：${res.error || "文件不存在或无读取权限"}`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	return {
		toolName: "read_skill_resource",
		summary: `[成功从本地读取技能资源: ${res.filePath}]\n\n${res.content}\n\n[系统提示] 该文件已完整载入，请直接依据上述本地规范与组件模板执行任务，无需再次读取或联网。`,
		items: [],
		references: [],
		isMutation: false,
	};
}

export const readSkillResourceToolDef = toolDefinition({
	name: "read_skill_resource",
	description:
		"从本机本地磁盘直接读取已激活 Agent 技能的参考文档、设计规范、主题组件库模板或脚本（例如 references/theme-red-white.md 等）。严禁为了获取技能文档而调用网络爬虫，请一律优先使用本工具从本地读取！",
	inputSchema: readSkillResourceInputSchema,
});
