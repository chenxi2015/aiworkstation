import { readdirSync, readFileSync, type Stats, statSync } from "node:fs";
import { join } from "node:path";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { ToolExecutionResult } from "../tools/types.ts";
import {
	defaultSearchRoots,
	looksBinary,
	MAX_CONTENT_MATCHES,
	MAX_CONTENT_SEARCH_FILE_BYTES,
	MAX_CONTENT_SEARCH_FILES_SCANNED,
	MAX_READ_BYTES,
	resolveUserPath,
} from "./fsSafety.ts";

export const searchContentInputSchema = z
	.object({
		query: z
			.string()
			.describe(
				"要搜索的文本内容（普通字符串，不区分大小写；useRegex 为 true 时按正则处理）",
			),
		path: z
			.string()
			.nullable()
			.optional()
			.describe(
				"搜索的起始目录，支持 ~ 开头。不传则全局搜索用户常用目录（桌面/文稿/下载/主目录）",
			),
		filePattern: z
			.string()
			.nullable()
			.optional()
			.describe(
				"限定文件名模式（支持 * 通配符，如 *.md、*.txt），默认搜索所有文本文件",
			),
		useRegex: z
			.boolean()
			.nullable()
			.optional()
			.describe("query 是否按正则表达式处理，默认 false（普通文本匹配）"),
		caseSensitive: z
			.boolean()
			.nullable()
			.optional()
			.describe("是否区分大小写，默认 false"),
		maxDepth: z.number().nullable().optional().describe("最大递归深度，默认 4"),
	})
	.passthrough();

export type SearchContentInput = z.infer<typeof searchContentInputSchema>;

const IGNORED_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	".next",
	"build",
	".cache",
	"Library",
]);

/** 默认只搜这些文本类后缀；filePattern 存在时以 filePattern 为准 */
const TEXT_EXTENSIONS = new Set([
	".md",
	".txt",
	".json",
	".js",
	".ts",
	".tsx",
	".jsx",
	".css",
	".html",
	".xml",
	".yml",
	".yaml",
	".toml",
	".ini",
	".conf",
	".log",
	".csv",
	".py",
	".java",
	".go",
	".rs",
	".c",
	".cpp",
	".h",
	".sh",
	".zsh",
	".sql",
	".vue",
	".svelte",
	".env",
	".gitignore",
	".editorconfig",
]);

function patternToRegex(pattern: string): RegExp {
	const escaped = pattern
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replace(/\*/g, ".*")
		.replace(/\?/g, ".");
	return new RegExp(`^${escaped}$`, "i");
}

function extOf(name: string): string {
	const i = name.lastIndexOf(".");
	return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function executeSearchContent(
	args: SearchContentInput,
): ToolExecutionResult {
	const query = (args.query || "").trim();
	if (!query) {
		throw new Error("搜索内容 query 不能为空");
	}

	let matcher: (line: string) => boolean;
	if (args.useRegex ?? false) {
		let regex: RegExp;
		try {
			regex = new RegExp(query, args.caseSensitive ? "" : "i");
		} catch (e) {
			throw new Error(`正则表达式无效：${e instanceof Error ? e.message : e}`);
		}
		matcher = (line) => regex.test(line);
	} else {
		const needle = args.caseSensitive ? query : query.toLowerCase();
		matcher = (line) =>
			(args.caseSensitive ? line : line.toLowerCase()).includes(needle);
	}

	const fileFilter = args.filePattern?.trim()
		? patternToRegex(args.filePattern.trim())
		: null;

	const isGlobal = !args.path?.trim();
	const roots = isGlobal
		? defaultSearchRoots()
		: [resolveUserPath(args.path as string)];
	// 显式指定隐藏目录（如 ~/.aiworkstation）为搜索根时，自动包含隐藏条目
	const includeHidden =
		!isGlobal &&
		roots.some((r) => r.split("/").some((seg) => seg.startsWith(".")));
	const maxDepth = Math.min(Math.max(args.maxDepth ?? 4, 1), 8);

	const matches: string[] = [];
	let scanned = 0;
	let skippedLarge = 0;
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
			if (truncated || scanned >= MAX_CONTENT_SEARCH_FILES_SCANNED) {
				if (scanned >= MAX_CONTENT_SEARCH_FILES_SCANNED) truncated = true;
				return;
			}
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
				walk(full, level + 1);
				continue;
			}
			if (
				fileFilter ? !fileFilter.test(name) : !TEXT_EXTENSIONS.has(extOf(name))
			) {
				continue;
			}
			if (stat.size > MAX_CONTENT_SEARCH_FILE_BYTES || stat.size === 0) {
				if (stat.size > MAX_CONTENT_SEARCH_FILE_BYTES) skippedLarge++;
				continue;
			}
			scanned++;
			let content: string;
			try {
				const buf = readFileSync(full);
				if (looksBinary(buf)) continue;
				content = buf.subarray(0, MAX_READ_BYTES).toString("utf-8");
			} catch {
				continue;
			}
			const lines = content.split("\n");
			let hitsInFile = 0;
			for (let i = 0; i < lines.length; i++) {
				if (hitsInFile >= 3) break;
				if (!matcher(lines[i])) continue;
				hitsInFile++;
				const preview = lines[i].trim().slice(0, 120);
				matches.push(`${full}:${i + 1}: ${preview}`);
				if (matches.length >= MAX_CONTENT_MATCHES) {
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
	const meta = `已扫描 ${scanned} 个文本文件${skippedLarge > 0 ? `，跳过 ${skippedLarge} 个超大文件` : ""}`;

	const summary =
		matches.length === 0
			? `在${scopeDesc}内未找到包含「${query}」的内容（${meta}）。可尝试指定其他目录、调整 filePattern 或换关键词。`
			: `在${scopeDesc}内找到 ${matches.length} 处包含「${query}」的内容（${meta}${truncated ? "，已达结果上限，建议缩小目录或用 filePattern 限定" : ""}）：\n${matches.join("\n")}`;

	return {
		toolName: "fs_search_content",
		summary,
		items: [],
		references: [],
		isMutation: false,
	};
}

export const searchContentToolDef = toolDefinition({
	name: "fs_search_content",
	description:
		"在本地文件内容中搜索包含指定文本的行（grep 式）。默认只扫描常见文本类文件（.md/.txt/.json/.ts 等），可用 filePattern 限定文件名（如 *.md），useRegex 支持正则。不传 path 时全局搜索用户常用目录。返回 路径:行号: 内容预览。超大文件与二进制自动跳过。",
	inputSchema: searchContentInputSchema,
});
