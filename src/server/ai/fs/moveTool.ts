import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { ToolExecutionResult } from "../tools/types.ts";
import { assertWritablePath, resolveUserPath } from "./fsSafety.ts";

export const moveInputSchema = z
	.object({
		sourcePath: z.string().describe("源文件或目录路径，支持 ~ 开头"),
		targetPath: z
			.string()
			.describe(
				"目标路径（移动或重命名后的完整新路径），支持 ~ 开头。父目录不存在时自动创建",
			),
		overwrite: z
			.boolean()
			.nullable()
			.optional()
			.describe("目标已存在时是否覆盖，默认 false（报错保护）"),
	})
	.passthrough();

export type MoveInput = z.infer<typeof moveInputSchema>;

export function executeMove(args: MoveInput): ToolExecutionResult {
	const source = resolveUserPath(args.sourcePath);
	const target = resolveUserPath(args.targetPath);
	assertWritablePath(source);
	assertWritablePath(target);

	if (!existsSync(source)) {
		throw new Error(`源路径不存在：${source}`);
	}
	if (existsSync(target) && !(args.overwrite ?? false)) {
		throw new Error(
			`目标路径已存在：${target}。如确认要覆盖，请将 overwrite 设为 true`,
		);
	}
	mkdirSync(dirname(target), { recursive: true });
	renameSync(source, target);

	return {
		toolName: "fs_move",
		summary: `成功将 ${source} 移动/重命名为 ${target}。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const moveToolDef = toolDefinition({
	name: "fs_move",
	description:
		"移动或重命名本地文件/目录（同盘秒移）。目标已存在时默认报错，需显式 overwrite: true 才覆盖。",
	inputSchema: moveInputSchema,
});
