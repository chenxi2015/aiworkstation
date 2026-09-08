import { readFileSync, writeFileSync } from "node:fs";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { ToolExecutionResult } from "../tools/types.ts";
import { assertWritablePath, resolveUserPath } from "./fsSafety.ts";

export const patchFileInputSchema = z
	.object({
		path: z.string().describe("要修改的文件路径，支持 ~ 开头"),
		oldText: z
			.string()
			.describe(
				"要被替换的原始文本（必须在文件中唯一出现，修改前请先用 fs_read_file 确认）",
			),
		newText: z.string().describe("替换后的新文本"),
	})
	.passthrough();

export type PatchFileInput = z.infer<typeof patchFileInputSchema>;

export function executePatchFile(args: PatchFileInput): ToolExecutionResult {
	const filePath = resolveUserPath(args.path);
	assertWritablePath(filePath);

	const content = readFileSync(filePath, "utf-8");
	const occurrences = content.split(args.oldText).length - 1;
	if (occurrences === 0) {
		throw new Error(
			`在 ${filePath} 中未找到要替换的文本，请先用 fs_read_file 读取文件确认准确内容（注意空格和换行）`,
		);
	}
	if (occurrences > 1) {
		throw new Error(
			`要替换的文本在 ${filePath} 中出现了 ${occurrences} 次，请提供更长的上下文使其唯一`,
		);
	}

	writeFileSync(filePath, content.replace(args.oldText, args.newText), "utf-8");

	return {
		toolName: "fs_patch_file",
		summary: `成功修改文件 ${filePath}：将 ${args.oldText.length} 个字符替换为 ${args.newText.length} 个字符。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const patchFileToolDef = toolDefinition({
	name: "fs_patch_file",
	description:
		"对本地文本文件做局部精确修改：把唯一出现的 oldText 替换为 newText。修改文件局部内容时优先使用本工具而非整文件覆盖。修改前必须先 fs_read_file。",
	inputSchema: patchFileInputSchema,
});
