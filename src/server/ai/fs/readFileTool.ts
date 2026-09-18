import { closeSync, openSync, readSync, statSync } from "node:fs";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { ToolExecutionResult } from "../tools/types.ts";
import {
	formatBytes,
	looksBinary,
	MAX_FULL_READ_BYTES,
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
		// ≤8MB 的文件完整读入，保证 startLine/endLine 行分页真正可用；
		// 超大文件退化为只读首个 512KB 窗口（行分页不可用，建议改用 fs_search_content 定位）
		const readSize = Math.min(
			stat.size,
			stat.size <= MAX_FULL_READ_BYTES ? stat.size : MAX_READ_BYTES,
		);
		const buf = Buffer.alloc(readSize);
		readSync(fd, buf, 0, readSize, 0);
		if (looksBinary(buf)) {
			throw new Error(
				`${filePath} 是二进制文件（${formatBytes(stat.size)}），无法以文本读取`,
			);
		}
		byteTruncated = stat.size > readSize;
		content = buf.toString("utf-8");
	} finally {
		try {
			closeSync(fd);
		} catch {
			/* ignore */
		}
	}

	const allLines = content.split("\n");
	if (byteTruncated && allLines.length > 1) {
		// 字节截断点可能落在某行中间（甚至截断多字节 UTF-8 字符），丢弃末尾残行；
		// 仅一行的长行场景保留该残行，保证窗口内容可见
		allLines.pop();
	}
	const startLine = Math.max(args.startLine ?? 1, 1);
	const totalLines = allLines.length;
	if (startLine > totalLines && totalLines > 0) {
		throw new Error(
			byteTruncated
				? `文件 ${filePath} 过大（${formatBytes(stat.size)}），目前仅能读取前 ${totalLines} 行；请用 fs_search_content 按关键词定位，或指定更小的 startLine`
				: `起始行 ${startLine} 超出文件总行数（共 ${totalLines} 行）`,
		);
	}
	const endLine = args.endLine
		? Math.min(args.endLine, startLine + MAX_READ_LINES - 1)
		: startLine + MAX_READ_LINES - 1;
	const slice = allLines.slice(startLine - 1, endLine);
	const numbered = slice
		.map((line, i) => `${startLine + i}: ${line}`)
		.join("\n");

	const truncated =
		byteTruncated || endLine < totalLines || startLine > 1
			? `\n... (文件${byteTruncated ? `共 ${formatBytes(stat.size)}，已按字节截断，仅前 ${totalLines} 行可读` : `共 ${totalLines} 行`}，当前显示 ${startLine}-${Math.min(endLine, totalLines)} 行)`
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
