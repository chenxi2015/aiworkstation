import { BASE_SYSTEM_PROMPT } from "./base.ts";
import { bookmarksPrompt } from "./modules/bookmarks.ts";
import { creatorPrompt } from "./modules/creator.ts";
import {
	defaultPrompt,
	ecommercePrompt,
	skillsPrompt,
} from "./modules/default.ts";
import { editorPrompt } from "./modules/editor.ts";
import { learnPrompt } from "./modules/learn.ts";
import { workbenchPrompt } from "./modules/workbench.ts";
import type {
	BuildSystemPromptParams,
	ModulePromptDefinition,
} from "./types.ts";

export * from "./types.ts";

/**
 * Registry mapping module code to its specialized prompt definition
 */
const MODULE_PROMPT_REGISTRY: Record<string, ModulePromptDefinition> = {
	workbench: workbenchPrompt,
	bookmarks: bookmarksPrompt,
	creator: creatorPrompt,
	editor: editorPrompt,
	learn: learnPrompt,
	ecommerce: ecommercePrompt,
	skills: skillsPrompt,
};

/**
 * Retrieve targeted prompt definition for the active module
 */
export function getModulePrompt(
	module?: string | null,
): ModulePromptDefinition {
	if (module && MODULE_PROMPT_REGISTRY[module]) {
		return MODULE_PROMPT_REGISTRY[module];
	}
	return defaultPrompt;
}

/**
 * Compose clean and isolated System Prompt combining base guidelines and module-specific persona
 */
export function buildSystemPrompt(params: BuildSystemPromptParams): string {
	const {
		module,
		dateStr,
		timeStr,
		folderScopePrompt = "",
		combinedContextPrompt = "",
		contextSnippets = "",
	} = params;

	const promptDef = getModulePrompt(module);

	const sections: string[] = [
		BASE_SYSTEM_PROMPT,
		`【当前运行环境与时间】:
- 当前本地日期: ${dateStr}
- 当前本地时间: ${timeStr}${folderScopePrompt}${combinedContextPrompt}`,
		`【当前模块角色与核心使命（${promptDef.code} 模块专属）】:
${promptDef.persona}`,
	];

	if (promptDef.instructions) {
		sections.push(promptDef.instructions);
	}

	if (promptDef.outputContract) {
		sections.push(promptDef.outputContract);
	}

	if (promptDef.toolGuidelines) {
		sections.push(promptDef.toolGuidelines);
	}

	if (contextSnippets) {
		sections.push(
			`以下是从本地知识库语义检索到的背景记忆片段（仅供你在思考和回答时参考；若用户提问是宏观规划、创作构思或日常对话，请忽略与主题无关的条目）：\n${contextSnippets}`,
		);
	}

	return sections.join("\n\n");
}
