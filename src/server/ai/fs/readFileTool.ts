import { closeSync, openSync, readSync, statSync } from "node:fs";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { ToolExecutionResult } from "../tools/types.ts";
import {
	formatBytes,
	looksBinary,
	MAX_READ_BYTES,
	MAX_READ_LINES,
	resolveUserPath,
} from "./fsSafety.ts";

export const readFileInputSchema = z
	.object({
		path: z
			.string()
			.describe("要读取的文件绝对路径，支持 ~ 开头（如 ~/Desktop/notes.md）"),
		startLine: z
			.number()
			.nullable()
			.optional()
			.describe("起始行号（从 1 开始），默认 1"),
		endLine: z
			.number()
			.nullable()
			.optional()
			.describe("结束行号（含），默认读到上限"),
	})
	.passthrough();

export type ReadFileInput = z.infer<typeof readFileInputSchema>;

export function executeReadFile(args: ReadFileInput): ToolExecutionResult {
	const filePath = resolveUserPath(args.path);
	const stat = statSync(filePath);
	if (stat.isDirectory()) {
		throw new Error(`${filePath} 是目录，请改用 fs_list_directory 工具查看`);
	}
	const fd = openSync(filePath, "r");
	let content: string;
	let byteTruncated = false;
	try {
		const readSize = Math.min(stat.size, MAX_READ_BYTES);
		const buf = Buffer.alloc(readSize);
		readSync(fd, buf, 0, readSize, 0);
		if (looksBinary(buf)) {
			throw new Error(
				`${filePath} 是二进制文件（${formatBytes(stat.size)}），无法以文本读取`,
			);
		}
		byteTruncated = stat.size > MAX_READ_BYTES;
		content = buf.toString("utf-8");
	} finally {
		try {
			closeSync(fd);
		} catch {
			/* ignore */
		}
	}

	const allLines = content.split("\n");
	const startLine = Math.max(args.startLine ?? 1, 1);
	const endLine = args.endLine
		? Math.min(args.endLine, startLine + MAX_READ_LINES - 1)
		: startLine + MAX_READ_LINES - 1;
	const slice = allLines.slice(startLine - 1, endLine);
	const numbered = slice
		.map((line, i) => `${startLine + i}: ${line}`)
		.join("\n");

	const totalLines = allLines.length;
	const truncated =
		byteTruncated || endLine < totalLines
			? `\n... (文件共 ${totalLines} 行，当前显示 ${startLine}-${Math.min(endLine, totalLines)} 行${byteTruncated ? "，文件过大已按字节截断" : ""})`
			: "";

	return {
		toolName: "fs_read_file",
		summary: `文件 ${filePath} 的内容：\n${numbered}${truncated}`,
		items: [],
		references: [],
		isMutation: false,
	};
}

export const readFileToolDef = toolDefinition({
	name: "fs_read_file",
	description:
		"读取本地电脑上的文本文件内容（带行号，支持 startLine/endLine 分页读取大文件）。二进制文件会拒绝读取。修改文件前必须先读取确认内容。",
	inputSchema: readFileInputSchema,
});
