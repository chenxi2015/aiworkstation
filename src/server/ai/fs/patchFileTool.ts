import { readFileSync } from "node:fs";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { ToolExecutionResult } from "../tools/types.ts";
import {
	assertWritablePath,
	detectLineEndings,
	normalizeLineEndings,
	resolveUserPath,
	restoreLineEndings,
	writeTextAtomicSync,
} from "./fsSafety.ts";

export const patchFileInputSchema = z
	.object({
		path: z.string().describe("要修改的文件路径，支持 ~ 开头"),
		oldText: z
			.string()
			.describe(
				"要被替换的原始文本（必须在文件中唯一出现，修改前请先用 fs_read_file 确认）",
			),
		newText: z.string().describe("替换后的新文本"),
		replaceAll: z
			.boolean()
			.nullable()
			.optional()
			.describe(
				"true 表示替换所有出现的位置，默认 false（要求 oldText 在文件中唯一出现）",
			),
	})
	.passthrough();

export type PatchFileInput = z.infer<typeof patchFileInputSchema>;

export function executePatchFile(args: PatchFileInput): ToolExecutionResult {
	const filePath = resolveUserPath(args.path);
	assertWritablePath(filePath);

	const raw = readFileSync(filePath, "utf-8");
	// CRLF 文件与模型传入的 LF 文本对齐：归一化后匹配，写回时还原原换行风格
	const lineEndings = detectLineEndings(raw);
	const content = normalizeLineEndings(raw);
	const oldText = normalizeLineEndings(args.oldText);
	if (oldText.length === 0) {
		throw new Error("oldText 不能为空字符串");
	}
	const newText = normalizeLineEndings(args.newText);
	const occurrences = content.split(oldText).length - 1;
	if (occurrences === 0) {
		throw new Error(
			`在 ${filePath} 中未找到要替换的文本，请先用 fs_read_file 读取文件确认准确内容（注意空格和换行）`,
		);
	}
	const replaceAll = args.replaceAll ?? false;
	if (!replaceAll && occurrences > 1) {
		throw new Error(
			`要替换的文本在 ${filePath} 中出现了 ${occurrences} 次，请提供更长的上下文使其唯一，或确认后设 replaceAll: true 全部替换`,
		);
	}

	const edited = replaceAll
		? content.split(oldText).join(newText)
		: content.replace(oldText, newText);
	// 原子写：崩溃/中断不会留下写了一半的文件
	writeTextAtomicSync(filePath, restoreLineEndings(edited, lineEndings));

	return {
		toolName: "fs_patch_file",
		summary: `成功修改文件 ${filePath}：${replaceAll ? `全部 ${occurrences} 处` : "1 处"}替换完成（${oldText.length} 字符 → ${newText.length} 字符）。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const patchFileToolDef = toolDefinition({
	name: "fs_patch_file",
	description:
		"对本地文本文件做局部精确修改：把唯一出现的 oldText 替换为 newText（replaceAll: true 可全部替换）。自动兼容 CRLF/LF 换行差异并保持原文件换行风格。修改文件局部内容时优先使用本工具而非整文件覆盖。修改前必须先 fs_read_file。",
	inputSchema: patchFileInputSchema,
});
