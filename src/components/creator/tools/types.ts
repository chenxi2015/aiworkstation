import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";

/** Tool categories for creator utilities */
export type ToolCategory = "all" | "video" | "audio" | "image" | "text";

/** Execution engine or processing strategy */
export type ToolEngine = "wasm" | "ai" | "native" | "browser";

/** Parameter input control types for tool mock/configuration */
export type ToolParamType = "select" | "slider" | "switch" | "text" | "radio";

export interface ToolParamOption {
	label: string;
	value: string;
}

export interface ToolParamConfig {
	id: string;
	label: string;
	type: ToolParamType;
	description?: string;
	defaultValue?: string | number | boolean;
	options?: ToolParamOption[];
	min?: number;
	max?: number;
	step?: number;
	unit?: string;
}

/** Definition for each creator tool */
export interface ToolDefinition {
	id: string;
	name: string;
	category: Exclude<ToolCategory, "all">;
	icon: LucideIcon;
	description: string;
	engine: ToolEngine;
	engineLabel: string;
	supportedFormats?: string[];
	acceptTypes?: string;
	badges?: string[];
	features: string[];
	params?: ToolParamConfig[];
	customComponent?: ComponentType<{ tool: ToolDefinition }>;
}
