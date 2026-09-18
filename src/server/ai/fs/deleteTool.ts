import { randomUUID } from "node:crypto";
import {
	cpSync,
	existsSync,
	mkdirSync,
	renameSync,
	rmSync,
	statSync,
} from "node:fs";
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
	const recursive = args.recursive ?? false;
	if (statSync(target).isDirectory() && !recursive) {
		throw new Error(
			`${target} 是目录，删除目录需要显式设置 recursive: true（请确认目录内容后再操作）`,
		);
	}
	if (args.permanent ?? false) {
		rmSync(target, { recursive, force: false });
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
	// 同一秒内删除同名文件时避免回收目录内冲突
	let trashPath = join(TRASH_DIR, `${stamp}_${basename(target)}`);
	if (existsSync(trashPath)) {
		trashPath = join(
			TRASH_DIR,
			`${stamp}_${randomUUID().slice(0, 8)}_${basename(target)}`,
		);
	}
	try {
		renameSync(target, trashPath);
	} catch (err: unknown) {
		// 跨盘 rename 失败（EXDEV）：复制到回收目录后再删源，保持「可恢复」承诺
		if ((err as { code?: string })?.code !== "EXDEV") throw err;
		cpSync(target, trashPath, { recursive: true });
		rmSync(target, { recursive, force: false });
		return {
			toolName: "fs_delete",
			summary: `已将 ${target} 移入回收目录 ${trashPath}（跨磁盘为复制迁移），需要时可移回恢复。`,
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
