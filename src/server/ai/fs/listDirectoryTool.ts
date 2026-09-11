import { readdirSync, type Stats, statSync } from "node:fs";
import { join } from "node:path";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { ToolExecutionResult } from "../tools/types.ts";
import {
	DEFAULT_LIST_DEPTH,
	formatBytes,
	MAX_LIST_DEPTH,
	resolveUserPath,
} from "./fsSafety.ts";

export const listDirectoryInputSchema = z
	.object({
		path: z
			.string()
			.describe(
				"要列出的目录绝对路径，支持 ~ 开头（如 ~/Desktop、~/Documents/projects）",
			),
		depth: z
			.number()
			.nullable()
			.optional()
			.describe(`递归深度，默认 ${DEFAULT_LIST_DEPTH}，最大 ${MAX_LIST_DEPTH}`),
		showHidden: z
			.boolean()
			.nullable()
			.optional()
			.describe("是否显示 . 开头的隐藏文件，默认 false"),
	})
	.passthrough();

export type ListDirectoryInput = z.infer<typeof listDirectoryInputSchema>;

const MAX_ENTRIES = 500;

export function executeListDirectory(
	args: ListDirectoryInput,
): ToolExecutionResult {
	const dirPath = resolveUserPath(args.path);
	let stat: Stats;
	try {
		stat = statSync(dirPath);
	} catch (err: unknown) {
		const isEnoent = (err as { code?: string })?.code === "ENOENT";
		if (isEnoent) {
			throw new Error(
				`目录不存在: ${dirPath}。若目标是工作区内置文档，请改用 read_document，文档并非以本地文件形式保存在磁盘。`,
			);
		}
		throw err;
	}
	if (!stat.isDirectory()) {
		throw new Error(`${dirPath} 不是一个目录`);
	}
	const depth = Math.min(
		Math.max(args.depth ?? DEFAULT_LIST_DEPTH, 1),
		MAX_LIST_DEPTH,
	);
	const showHidden = args.showHidden ?? false;

	const lines: string[] = [];
	let entryCount = 0;
	let truncated = false;

	const walk = (dir: string, prefix: string, level: number) => {
		if (truncated) return;
		let names: string[];
		try {
			names = readdirSync(dir).sort();
		} catch {
			lines.push(`${prefix}[无权限读取]`);
			return;
		}
		if (!showHidden) {
			names = names.filter((n) => !n.startsWith("."));
		}
		for (const name of names) {
			if (truncated) return;
			if (entryCount >= MAX_ENTRIES) {
				lines.push(`${prefix}... (条目过多，已截断)`);
				truncated = true;
				return;
			}
			const full = join(dir, name);
			let childStat: Stats;
			try {
				childStat = statSync(full);
			} catch {
				lines.push(`${prefix}${name} [无法访问]`);
				entryCount++;
				continue;
			}
			entryCount++;
			if (childStat.isDirectory()) {
				lines.push(`${prefix}📁 ${name}/`);
				if (level < depth) {
					walk(full, `${prefix}  `, level + 1);
				}
			} else {
				lines.push(`${prefix}📄 ${name} (${formatBytes(childStat.size)})`);
			}
		}
	};

	lines.push(`📁 ${dirPath}/`);
	walk(dirPath, "  ", 1);

	return {
		toolName: "fs_list_directory",
		summary: `目录 ${dirPath} 的内容（共 ${entryCount} 个条目${truncated ? "，已截断" : ""}）：\n${lines.join("\n")}`,
		items: [],
		references: [],
		isMutation: false,
	};
}

export const listDirectoryToolDef = toolDefinition({
	name: "fs_list_directory",
	description:
		"列出本地电脑某个目录下的文件和子目录（树状展示，支持递归深度控制）。用于了解目录结构。路径支持 ~ 开头表示用户主目录。",
	inputSchema: listDirectoryInputSchema,
});
