import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { workbenchDb } from "../../db/sqlite.ts";
import type { ToolExecutionResult } from "./types";

export const getStatsInputSchema = z
	.object({
		focus: z
			.enum(["all", "categories", "folders", "tags", "health"])
			.nullable()
			.optional()
			.describe(
				"统计聚焦点：'categories'（分类分布及下属文件夹，特别推荐用于分类治理、合并重构与宏观规划），'folders'（文件夹规模与内容量），'tags'（常用标签词频统计），'health'（空文件夹与超大文件夹等健康诊断），'all'（全量概览，默认）",
			),
	})
	.passthrough();

export type GetStatsInput = z.infer<typeof getStatsInputSchema>;

export const getStatsToolDef = toolDefinition({
	name: "get_stats",
	description:
		"获取个人知识库的宏观统计与架构全景（涵盖主分类列表及各分类下的文件夹、书签总数、未分类数量、常用标签分布与健康诊断）。当用户询问知识库体量、询问'当前分类太细/如何重组分类'、需要盘点整体结构、或要求分析知识库健康度时主动调用此工具。",
	inputSchema: getStatsInputSchema,
});

/**
 * Pure execution function to compute workspace statistics from SQLite
 */
export function executeGetStats(args: GetStatsInput): ToolExecutionResult {
	const focus = args.focus || "all";

	const allFolders = workbenchDb.getAllFolders();
	const unclassified = workbenchDb.getUnclassifiedItems();

	const totalFolders = allFolders.length;
	const totalUnclassified = unclassified.length;

	// Calculate classified items and collect tag frequencies
	let totalClassified = 0;
	const tagCounts: Record<string, number> = {};
	const categoryMap: Record<
		string,
		Array<{ id: number; name: string; itemCount: number; desc?: string }>
	> = {};

	const emptyFolders: string[] = [];
	const largeFolders: Array<{ name: string; count: number }> = [];

	for (const folder of allFolders) {
		const items = folder.items || [];
		const count = items.length;
		totalClassified += count;

		if (count === 0) {
			emptyFolders.push(folder.name);
		} else if (count >= 40) {
			largeFolders.push({ name: folder.name, count });
		}

		// Group by category
		const cat = folder.category?.trim() || "未归类";
		if (!categoryMap[cat]) {
			categoryMap[cat] = [];
		}
		categoryMap[cat].push({
			id: folder.id,
			name: folder.name,
			itemCount: count,
			desc: folder.desc,
		});

		// Count tags
		for (const item of items) {
			if (Array.isArray(item.tags)) {
				for (const t of item.tags) {
					const cleanTag = t.trim();
					if (cleanTag) {
						tagCounts[cleanTag] = (tagCounts[cleanTag] || 0) + 1;
					}
				}
			}
		}
	}

	// Also count tags from unclassified items
	for (const item of unclassified) {
		if (Array.isArray(item.tags)) {
			for (const t of item.tags) {
				const cleanTag = t.trim();
				if (cleanTag) {
					tagCounts[cleanTag] = (tagCounts[cleanTag] || 0) + 1;
				}
			}
		}
	}

	const totalBookmarks = totalClassified + totalUnclassified;

	// Sort categories by total item count descending
	const categorySummaries = Object.entries(categoryMap).map(
		([name, folders]) => {
			const totalItems = folders.reduce((sum, f) => sum + f.itemCount, 0);
			return {
				name,
				folderCount: folders.length,
				totalItems,
				folders: folders.map((f) => `${f.name}(${f.itemCount}项)`).join(", "),
			};
		},
	);
	categorySummaries.sort((a, b) => b.totalItems - a.totalItems);

	// Top tags
	const sortedTags = Object.entries(tagCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 15)
		.map(([t, count]) => `${t}(${count})`);

	// Format text summary based on focus
	const lines: string[] = [];
	lines.push("### 📊 知识库全景统计");
	lines.push(
		`- **总资产规模**: 共 ${totalBookmarks} 条书签（已归档: ${totalClassified} 条，待整理未分类: ${totalUnclassified} 条）`,
	);
	lines.push(
		`- **组织结构**: 包含 ${categorySummaries.length} 个主分类，共 ${totalFolders} 个文件夹`,
	);

	if (focus === "all" || focus === "categories") {
		lines.push("\n#### 🗂️ 主分类分布详情:");
		for (const cat of categorySummaries) {
			lines.push(
				`  - **「${cat.name}」** (${cat.folderCount} 个文件夹，共 ${cat.totalItems} 条书签): ${cat.folders || "无文件夹"}`,
			);
		}
	}

	if (focus === "all" || focus === "tags") {
		if (sortedTags.length > 0) {
			lines.push(`\n#### 🏷️ 常用高频标签 (Top 15):`);
			lines.push(`  ${sortedTags.join("、")}`);
		}
	}

	if (focus === "all" || focus === "health") {
		lines.push("\n#### 🩺 结构健康状态:");
		if (emptyFolders.length > 0) {
			lines.push(`  - 空文件夹 (${emptyFolders.length}个): ${emptyFolders.join("、")}`);
		} else {
			lines.push(`  - 空文件夹: 无`);
		}
		if (largeFolders.length > 0) {
			lines.push(
				`  - 较庞大文件夹 (≥40项): ${largeFolders.map((f) => `${f.name}(${f.count}项)`).join("、")}（可考虑拆分子主题）`,
			);
		}
		if (totalUnclassified > 30) {
			lines.push(
				`  - 待分类堆积: 尚有 ${totalUnclassified} 条未分类内容，建议使用 AI 一键归类清理`,
			);
		}
	}

	return {
		toolName: "get_stats",
		summary: lines.join("\n"),
		items: [],
		references: [],
		isMutation: false,
	};
}
