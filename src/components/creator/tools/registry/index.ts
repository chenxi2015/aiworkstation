import type { ToolDefinition } from "../types";
import { AUDIO_TOOLS } from "./audioTools";
import { IMAGE_TOOLS } from "./imageTools";
import { TEXT_TOOLS } from "./textTools";
import { VIDEO_TOOLS } from "./videoTools";

export { AUDIO_TOOLS } from "./audioTools";
export { IMAGE_TOOLS } from "./imageTools";
export { TEXT_TOOLS } from "./textTools";
export { VIDEO_TOOLS } from "./videoTools";

/**
 * Registry of all available creator tools categorized by media type.
 * Uses strategy & modular registry pattern for maintainability.
 */
export const CREATOR_TOOLS: ToolDefinition[] = [
	...VIDEO_TOOLS,
	...AUDIO_TOOLS,
	...IMAGE_TOOLS,
	...TEXT_TOOLS,
];

/** Quick lookup map by tool ID */
export const CREATOR_TOOLS_MAP = new Map<string, ToolDefinition>(
	CREATOR_TOOLS.map((tool) => [tool.id, tool]),
);
