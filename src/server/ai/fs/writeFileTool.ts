import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { ToolExecutionResult } from "../tools/types.ts";
import {
	assertWritablePath,
	formatBytes,
	resolveUserPath,
} from "./fsSafety.ts";

export const writeFileInputSchema = z
	.object({
		path: z
			.string()
			.describe("目标文件绝对路径，支持 ~ 开头。父目录不存在时会自动创建"),
		content: z.string().describe("要写入的完整文本内容"),
		append: z
			.boolean()
			.nullable()
			.optional()
			.describe("true 表示追加到文件末尾，默认 false（覆盖写入）"),
	})
	.passthrough();

export type WriteFileInput = z.infer<typeof writeFileInputSchema>;

export function executeWriteFile(args: WriteFileInput): ToolExecutionResult {
	const filePath = resolveUserPath(args.path);
	assertWritablePath(filePath);

	const existed = existsSync(filePath);
	const append = args.append ?? false;
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, args.content, {
		encoding: "utf-8",
		flag: append ? "a" : "w",
	});

	const action = append ? "追加写入" : existed ? "覆盖写入" : "创建";
	return {
		toolName: "fs_write_file",
		summary: `成功${action}文件 ${filePath}（${formatBytes(Buffer.byteLength(args.content, "utf-8"))}）。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const writeFileToolDef = toolDefinition({
	name: "fs_write_file",
	description:
		"在本地创建新文件或覆盖/追加写入已有文件（父目录自动创建）。注意：覆盖会丢失原内容，只想修改局部时请优先用 fs_patch_file。",
	inputSchema: writeFileInputSchema,
});
