import { existsSync, mkdirSync } from "node:fs";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { ToolExecutionResult } from "../tools/types.ts";
import { assertWritablePath, resolveUserPath } from "./fsSafety.ts";

export const createDirectoryInputSchema = z
	.object({
		path: z
			.string()
			.describe("要创建的目录路径，支持 ~ 开头。不存在的父目录会自动创建"),
	})
	.passthrough();

export type CreateDirectoryInput = z.infer<typeof createDirectoryInputSchema>;

export function executeCreateDirectory(
	args: CreateDirectoryInput,
): ToolExecutionResult {
	const dirPath = resolveUserPath(args.path);
	assertWritablePath(dirPath);

	if (existsSync(dirPath)) {
		return {
			toolName: "fs_create_directory",
			summary: `目录 ${dirPath} 已存在，无需重复创建。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}
	mkdirSync(dirPath, { recursive: true });

	return {
		toolName: "fs_create_directory",
		summary: `成功创建目录 ${dirPath}（含缺失的父目录）。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const createDirectoryToolDef = toolDefinition({
	name: "fs_create_directory",
	description: "在本地创建目录，不存在的父级目录会一并自动创建。",
	inputSchema: createDirectoryInputSchema,
});
