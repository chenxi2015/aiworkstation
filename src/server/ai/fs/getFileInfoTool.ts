import { statSync } from "node:fs";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { ToolExecutionResult } from "../tools/types.ts";
import { formatBytes, resolveUserPath } from "./fsSafety.ts";

export const getFileInfoInputSchema = z
	.object({
		path: z.string().describe("要查询的文件或目录路径，支持 ~ 开头"),
	})
	.passthrough();

export type GetFileInfoInput = z.infer<typeof getFileInfoInputSchema>;

export function executeGetFileInfo(
	args: GetFileInfoInput,
): ToolExecutionResult {
	const target = resolveUserPath(args.path);
	const stat = statSync(target);
	const type = stat.isDirectory()
		? "目录"
		: stat.isSymbolicLink()
			? "符号链接"
			: "文件";

	const summary = [
		`路径：${target}`,
		`类型：${type}`,
		`大小：${formatBytes(stat.size)}`,
		`创建时间：${stat.birthtime.toLocaleString()}`,
		`修改时间：${stat.mtime.toLocaleString()}`,
	].join("\n");

	return {
		toolName: "fs_get_file_info",
		summary,
		items: [],
		references: [],
		isMutation: false,
	};
}

export const getFileInfoToolDef = toolDefinition({
	name: "fs_get_file_info",
	description: "查询本地文件或目录的元信息：类型、大小、创建时间、修改时间。",
	inputSchema: getFileInfoInputSchema,
});
