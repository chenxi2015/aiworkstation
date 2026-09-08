import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { ToolExecutionResult } from "../tools/types.ts";
import { assertWritablePath, resolveUserPath } from "./fsSafety.ts";

const TRASH_DIR = join(homedir(), ".aiworkstation", ".trash");

export const deleteInputSchema = z
	.object({
		path: z
			.string()
			.describe(
				"要删除的文件或目录路径，支持 ~ 开头。删除前会优先移入回收目录 ~/.aiworkstation/.trash/，可恢复",
			),
		recursive: z
			.boolean()
			.nullable()
			.optional()
			.describe("删除非空目录时必须显式设为 true"),
		permanent: z
			.boolean()
			.nullable()
			.optional()
			.describe("true 表示彻底删除（不进回收目录，不可恢复），默认 false"),
	})
	.passthrough();

export type DeleteInput = z.infer<typeof deleteInputSchema>;

export function executeDelete(args: DeleteInput): ToolExecutionResult {
	const target = resolveUserPath(args.path);
	assertWritablePath(target);

	if (!existsSync(target)) {
		throw new Error(`路径不存在：${target}`);
	}
	if (args.permanent ?? false) {
		rmSync(target, { recursive: args.recursive ?? false, force: false });
		return {
			toolName: "fs_delete",
			summary: `已彻底删除 ${target}（不可恢复）。`,
			items: [],
			references: [],
			isMutation: true,
		};
	}

	// 默认：移入回收目录，可恢复
	mkdirSync(TRASH_DIR, { recursive: true });
	const stamp = new Date()
		.toISOString()
		.replace(/[:.]/g, "-")
		.replace("T", "_")
		.slice(0, 19);
	const trashPath = join(TRASH_DIR, `${stamp}_${basename(target)}`);
	try {
		renameSync(target, trashPath);
	} catch {
		// 跨盘 rename 失败时退化为永久删除
		rmSync(target, { recursive: args.recursive ?? false, force: false });
		return {
			toolName: "fs_delete",
			summary: `已删除 ${target}。注意：因跨磁盘无法移入回收目录，本次为彻底删除。`,
			items: [],
			references: [],
			isMutation: true,
		};
	}

	return {
		toolName: "fs_delete",
		summary: `已将 ${target} 移入回收目录 ${trashPath}，需要时可移回恢复。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const deleteToolDef = toolDefinition({
	name: "fs_delete",
	description:
		"删除本地文件或目录。默认先移入回收目录 ~/.aiworkstation/.trash/（可恢复）；仅当 permanent: true 时才彻底删除。删除非空目录需 recursive: true。",
	inputSchema: deleteInputSchema,
});
