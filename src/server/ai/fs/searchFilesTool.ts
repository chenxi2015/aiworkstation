import { readdirSync, type Stats, statSync } from "node:fs";
import { join } from "node:path";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { ToolExecutionResult } from "../tools/types.ts";
import {
	defaultSearchRoots,
	formatBytes,
	MAX_SEARCH_RESULTS,
	resolveUserPath,
} from "./fsSafety.ts";

export const searchFilesInputSchema = z
	.object({
		path: z
			.string()
			.nullable()
			.optional()
			.describe(
				"搜索的起始目录，支持 ~ 开头（如 ~/Documents）。不传则全局搜索用户常用目录（桌面/文稿/下载/主目录）",
			),
		pattern: z
			.string()
			.describe(
				"名称匹配模式，支持 * 通配符（如 *.md、report*、*.png）。不区分大小写",
			),
		type: z
			.enum(["file", "directory", "both"])
			.nullable()
			.optional()
			.describe(
				"搜索目标类型：file 仅文件、directory 仅文件夹、both 两者都搜，默认 both",
			),
		maxDepth: z
			.number()
			.nullable()
			.optional()
			.describe("最大递归深度，默认 5（全局搜索时默认 4）"),
	})
	.passthrough();

export type SearchFilesInput = z.infer<typeof searchFilesInputSchema>;

/** 把 * 通配符模式转为正则（不区分大小写） */
function patternToRegex(pattern: string): RegExp {
	const escaped = pattern
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replace(/\*/g, ".*")
		.replace(/\?/g, ".");
	return new RegExp(`^${escaped}$`, "i");
}

const IGNORED_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	".next",
	"build",
	".cache",
	"Library",
]);

export function executeSearchFiles(
	args: SearchFilesInput,
): ToolExecutionResult {
	const regex = patternToRegex(args.pattern);
	const type = args.type ?? "both";
	const matchFile = type !== "directory";
	const matchDir = type !== "file";

	const isGlobal = !args.path?.trim();
	const roots = isGlobal
		? defaultSearchRoots()
		: [resolveUserPath(args.path as string)];
	// 显式指定隐藏目录（如 ~/.aiworkstation）为搜索根时，自动包含隐藏条目
	const includeHidden =
		(args.includeHidden ?? false) ||
		(!isGlobal &&
			roots.some((r) => r.split("/").some((seg) => seg.startsWith("."))));
	const maxDepth = Math.min(
		Math.max(args.maxDepth ?? (isGlobal ? 4 : 5), 1),
		10,
	);

	const matches: string[] = [];
	let truncated = false;

	const walk = (dir: string, level: number) => {
		if (truncated || level > maxDepth) return;
		let names: string[];
		try {
			names = readdirSync(dir);
		} catch {
			return;
		}
		for (const name of names) {
			if (truncated) return;
			if ((!includeHidden && name.startsWith(".")) || IGNORED_DIRS.has(name))
				continue;
			const full = join(dir, name);
			let stat: Stats;
			try {
				stat = statSync(full);
			} catch {
				continue;
			}
			if (stat.isDirectory()) {
				if (matchDir && regex.test(name)) {
					matches.push(`📁 ${full}/`);
					if (matches.length >= MAX_SEARCH_RESULTS) {
						truncated = true;
						return;
					}
				}
				walk(full, level + 1);
			} else if (matchFile && regex.test(name)) {
				matches.push(`📄 ${full} (${formatBytes(stat.size)})`);
				if (matches.length >= MAX_SEARCH_RESULTS) {
					truncated = true;
					return;
				}
			}
		}
	};

	for (const root of roots) {
		if (truncated) break;
		walk(root, 1);
	}

	const scopeDesc = isGlobal ? `常用目录（${roots.join("、")}）` : roots[0];
	const typeDesc =
		type === "both" ? "文件和文件夹" : type === "file" ? "文件" : "文件夹";

	const summary =
		matches.length === 0
			? `在${scopeDesc}（深度 ${maxDepth}）内未找到匹配「${args.pattern}」的${typeDesc}。可尝试换关键词、放宽通配符或指定更深/其他目录。`
			: `在${scopeDesc}内找到 ${matches.length} 个匹配「${args.pattern}」的${typeDesc}${truncated ? "（已达结果上限，可能还有更多，建议缩小目录范围）" : ""}：\n${matches.join("\n")}`;

	return {
		toolName: "fs_search_files",
		summary,
		items: [],
		references: [],
		isMutation: false,
	};
}

export const searchFilesToolDef = toolDefinition({
	name: "fs_search_files",
	description:
		"在本地搜索文件和文件夹：按名称模式递归匹配（支持 * 通配符，如 *.md、invoice*）。不传 path 时自动全局搜索用户常用目录（桌面/文稿/下载等，不含隐藏目录）；type 参数可限定只搜文件或只搜文件夹；搜索隐藏目录（如 ~/.aiworkstation）时将其显式作为 path 传入即可自动包含隐藏条目。自动跳过 node_modules/.git 等目录，返回完整路径列表。",
	inputSchema: searchFilesInputSchema,
});
