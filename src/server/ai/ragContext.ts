/**
 * ragContext.ts — Backwards-compatible re-export shim.
 *
 * All implementation has been migrated to src/server/ai/context/ for cleaner
 * separation of concerns. External callers (agentRunner.ts, rag.ts, etc.)
 * continue to import from this file without any change.
 */
export type { PreparedRagContext, RagAgentParams } from "./context/index.ts";
export {
	prepareRagAgentContext,
	resolveLlmConfig,
	resolveEmbeddingConfig,
} from "./context/index.ts";

// Re-export types and image gen config from config.ts
export type { LlmConfigOverrides, ImageGenConfig } from "./context/config.ts";
export { resolveImageGenConfig } from "./context/config.ts";

