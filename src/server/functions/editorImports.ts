import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import {
	assertPathWithinRoot,
	MAX_READ_BYTES,
	resolveUserPath,
} from "../ai/fs/fsSafety.ts";
import { executeCrawlWebpageViaExtension } from "../ai/tools/crawlWebpageViaExtensionTool.ts";

export interface ObsidianNoteItem {
	relativePath: string;
	name: string;
	size: number;
	mtime: string;
}

/**
 * Server Function: 网页 URL 导入（复用插件爬虫通道与降级策略）
 */
export const importWebpageToEditor = createServerFn({ method: "POST" })
	.validator((data: { url: string }) => data)
	.handler(
		async ({
			data,
		}): Promise<{
			success: boolean;
			title: string;
			markdown: string;
			error?: string;
		}> => {
			const url = data.url.trim();
			if (!url.startsWith("http://") && !url.startsWith("https://")) {
				return {
					success: false,
					title: "",
					markdown: "",
					error: "请输入合法的 http:// 或 https:// 网址",
				};
			}

			try {
				const result = await executeCrawlWebpageViaExtension({
					url,
					mode: "content",
					waitMs: 1500,
				});

				// 从 summary 或抓取结果提取标题与内容
				let title = "";
				let markdown = "";

				const summary = result.summary || "";
				// 匹配可能包含的《标题》
				const titleMatch = summary.match(/《([^》]+)》/);
				if (titleMatch) {
					title = titleMatch[1];
				}

				// 清理系统前缀等辅助说明
				markdown = summary
					.replace(
						/^\[(插件静默爬虫通道|原生 fetch 通道)[^\]]*\][^\n]*\n+/g,
						"",
					)
					.replace(/\[系统提示\][^\n]*/g, "")
					.trim();

				if (!title) {
					// 尝试从 markdown 首行匹配 # Title
					const mdTitleMatch = markdown.match(/^#\s+(.+)$/m);
					if (mdTitleMatch) {
						title = mdTitleMatch[1].trim();
					} else {
						title = new URL(url).hostname;
					}
				}

				return {
					success: true,
					title: title.slice(0, 100),
					markdown,
				};
			} catch (err) {
				return {
					success: false,
					title: "",
					markdown: "",
					error: err instanceof Error ? err.message : "抓取网页失败",
				};
			}
		},
	);

/**
 * 递归扫描目录下的 .md 文件（受黑名单与深度保护）
 */
function scanMarkdownFiles(
	dir: string,
	baseDir: string,
	depth = 0,
	maxDepth = 5,
): ObsidianNoteItem[] {
	if (depth > maxDepth) return [];
	const results: ObsidianNoteItem[] = [];

	let entries: string[] = [];
	try {
		entries = readdirSync(dir);
	} catch {
		return [];
	}

	for (const entry of entries) {
		// 跳过隐藏文件夹、Obsidian 元数据、版本控制目录
		if (
			entry.startsWith(".") ||
			entry === "node_modules" ||
			entry === ".obsidian" ||
			entry === ".trash"
		) {
			continue;
		}

		const fullPath = join(dir, entry);
		try {
			const stat = statSync(fullPath);
			if (stat.isDirectory()) {
				results.push(
					...scanMarkdownFiles(fullPath, baseDir, depth + 1, maxDepth),
				);
			} else if (stat.isFile() && entry.toLowerCase().endsWith(".md")) {
				results.push({
					relativePath: relative(baseDir, fullPath),
					name: basename(entry, ".md"),
					size: stat.size,
					mtime: stat.mtime.toISOString(),
				});
			}
		} catch {
			// Ignore access errors for single entries
		}
	}

	return results;
}

/**
 * Server Function: 列出 Obsidian Vault 中的 Markdown 笔记列表
 */
export const listObsidianNotes = createServerFn({ method: "POST" })
	.validator((data: { vaultPath: string }) => data)
	.handler(
		async ({
			data,
		}): Promise<{
			success: boolean;
			notes: ObsidianNoteItem[];
			error?: string;
		}> => {
			try {
				const resolved = resolveUserPath(data.vaultPath);
				if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
					return {
						success: false,
						notes: [],
						error: "指定的 Obsidian 目录不存在或不是文件夹",
					};
				}

				const notes = scanMarkdownFiles(resolved, resolved);
				// 按修改时间倒序排列
				notes.sort(
					(a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime(),
				);

				return { success: true, notes };
			} catch (err) {
				return {
					success: false,
					notes: [],
					error: err instanceof Error ? err.message : "读取 Obsidian 目录失败",
				};
			}
		},
	);

/**
 * Server Function: 读取指定的 Obsidian Markdown 笔记内容
 */
export const readObsidianNote = createServerFn({ method: "POST" })
	.validator((data: { vaultPath: string; relativePath: string }) => data)
	.handler(
		async ({
			data,
		}): Promise<{
			success: boolean;
			title: string;
			content: string;
			error?: string;
		}> => {
			try {
				const root = resolveUserPath(data.vaultPath);

				const fullPath = join(root, data.relativePath);
				assertPathWithinRoot(fullPath, root);

				const stat = statSync(fullPath);
				if (stat.size > MAX_READ_BYTES) {
					return {
						success: false,
						title: "",
						content: "",
						error: `文件过大（超过 ${Math.round(MAX_READ_BYTES / 1024)}KB）`,
					};
				}

				const content = readFileSync(fullPath, "utf-8");
				const rawName = basename(data.relativePath, ".md");

				// 尝试解析首行作为标题
				const titleMatch = content.match(/^#\s+(.+)$/m);
				const title = titleMatch ? titleMatch[1].trim() : rawName;

				return { success: true, title, content };
			} catch (err) {
				return {
					success: false,
					title: "",
					content: "",
					error: err instanceof Error ? err.message : "读取笔记失败",
				};
			}
		},
	);
