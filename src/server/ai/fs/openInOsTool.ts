import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { openInOs } from "../../services/systemOpener.ts";
import type { ToolExecutionResult } from "../tools/types.ts";
import { resolveUserPath } from "./fsSafety.ts";

export const openInOsInputSchema = z
	.object({
		path: z
			.string()
			.describe(
				"要在系统文件管理器（访达/资源管理器）中打开的本地文件或文件夹路径，支持 ~ 开头",
			),
		reveal: z
			.boolean()
			.optional()
			.describe("若目标为文件，是否在文件管理器中定位高亮该文件。默认为 true"),
	})
	.passthrough();

export type OpenInOsInput = z.infer<typeof openInOsInputSchema>;

export async function executeOpenInOs(
	args: OpenInOsInput,
): Promise<ToolExecutionResult> {
	const targetPath = resolveUserPath(args.path);
	try {
		await openInOs(targetPath, { reveal: args.reveal ?? true });
		return {
			toolName: "fs_open_in_os",
			summary: `已在系统文件管理器中成功打开：${targetPath}`,
			items: [],
			references: [],
			isMutation: false,
		};
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			toolName: "fs_open_in_os",
			summary: `打开失败：${message}`,
			items: [],
			references: [],
			isMutation: false,
		};
	}
}

export const openInOsToolDef = toolDefinition({
	name: "fs_open_in_os",
	description:
		"在宿主操作系统的文件管理器（macOS 访达 / Windows 资源管理器 / Linux 文件管理器）中打开指定目录或定位高亮指定文件。",
	inputSchema: openInOsInputSchema,
});
