import type { AgentToolHooks, ToolExecutionResult } from "./types.ts";

export * from "./addTagsToBookmarksTool.ts";
export * from "./chartTool.ts";
export * from "./crawlWebpageViaExtensionTool.ts";
export * from "./createFolderTool.ts";
export * from "./createTagsTool.ts";
export * from "./deleteFolderTool.ts";
export * from "./getStatsTool.ts";
export * from "./mergeFoldersTool.ts";
export * from "./mermaidTool.ts";
export * from "./moveBookmarksTool.ts";
export * from "./moveFolderTool.ts";
export * from "./queryBookmarksTool.ts";
export * from "./readWebpageTool.ts";
export * from "./removeBookmarksTool.ts";
export * from "./removeTagsTool.ts";
export * from "./renameOrMergeTagsTool.ts";
export * from "./reorderFoldersTool.ts";
export * from "./timeResolver.ts";
// Re-export all tool definitions and helpers
export * from "./types.ts";
export * from "./updateFolderTool.ts";
export * from "./webFetchTool.ts";
export * from "./webSearchTool.ts";

/**
 * Generic execution wrapper that logs metrics and dispatches lifecycle hooks.
 *
 * Tool failures are returned to the model as an error tool-result string
 * instead of throwing, so the agent loop keeps running and the model can
 * recover (retry with different args, pick another tool, or explain the
 * failure to the user). Only aborts propagate as exceptions.
 */
export async function wrapExecution<TArgs>(
	toolName: string,
	args: TArgs,
	executor: () => ToolExecutionResult | Promise<ToolExecutionResult>,
	hooks?: AgentToolHooks,
): Promise<string> {
	const start = Date.now();
	const stepId = hooks?.onToolStart?.(
		toolName,
		(args || {}) as Record<string, unknown>,
	);
	try {
		const res = await executor();
		if (res.isMutation) {
			hooks?.onMutated?.();
		}
		if (res.references && res.references.length > 0) {
			hooks?.onReferencesFound?.(res.references);
		}
		const durationMs = Date.now() - start;
		hooks?.onToolEnd?.(
			toolName,
			res.summary,
			true,
			durationMs,
			res.navigation,
			typeof stepId === "string" ? stepId : undefined,
		);
		return res.summary;
	} catch (err: unknown) {
		// User-initiated aborts must interrupt the loop, not feed back to the model
		if (err instanceof Error && err.name === "AbortError") {
			throw err;
		}
		const durationMs = Date.now() - start;
		const errMsg = err instanceof Error ? err.message : String(err);
		const failureSummary = `执行失败: ${errMsg}`;
		hooks?.onToolEnd?.(
			toolName,
			failureSummary,
			false,
			durationMs,
			undefined,
			typeof stepId === "string" ? stepId : undefined,
		);
		return failureSummary;
	}
}
