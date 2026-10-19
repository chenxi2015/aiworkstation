import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import {
	runSystemCommand,
	validateCommandSafety,
} from "../../services/system/index.ts";
import type { ToolExecutionResult } from "./types.ts";

export const executeCommandInputSchema = z.object({
	command: z
		.string()
		.describe(
			"要在本地终端执行的命令字符串，例如 git clone ... 或 npm install",
		),
	cwd: z
		.string()
		.optional()
		.describe(
			"执行命令的工作目录绝对路径，支持 ~ 开头。默认为当前工作区根目录",
		),
	timeoutMs: z
		.number()
		.optional()
		.describe("命令执行超时时间(毫秒)，默认 60000ms"),
});

export type ExecuteCommandInput = z.infer<typeof executeCommandInputSchema>;

/**
 * Execute a local shell command safely across macOS and Windows
 */
export async function executeCommand(
	args: ExecuteCommandInput,
	signal?: AbortSignal,
): Promise<ToolExecutionResult> {
	const safetyCheck = validateCommandSafety(args.command);
	if (!safetyCheck.safe) {
		return {
			toolName: "execute_command",
			summary: `执行被安全策略拦截：${safetyCheck.reason}`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const result = await runSystemCommand(args.command, {
		cwd: args.cwd,
		timeoutMs: args.timeoutMs,
		signal,
	});

	const isSuccess = result.exitCode === 0;
	const stdoutTrimmed = result.stdout.slice(0, 800);
	const stderrTrimmed = result.stderr.slice(0, 800);

	let outputText = "";
	if (isSuccess) {
		outputText = stdoutTrimmed || stderrTrimmed || "命令执行完成，无标准输出。";
	} else {
		outputText = `命令退出异常 (Exit Code: ${result.exitCode}):\n${stderrTrimmed || stdoutTrimmed || "未知错误"}`;
	}

	return {
		toolName: "execute_command",
		summary: `[命令: ${args.command}] 耗时 ${result.durationMs}ms\n${outputText}`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const executeCommandToolDef = toolDefinition({
	metadata: { executionClass: "global-headless" },
	name: "execute_command",
	description:
		"在本地主机环境执行 Shell 命令行（如 git clone 安装 skills、npm/pnpm 安装依赖、编译或执行脚本、检查系统状态）。已跨平台适配 Windows 与 macOS。",
	inputSchema: executeCommandInputSchema,
});
