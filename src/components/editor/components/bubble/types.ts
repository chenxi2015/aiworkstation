// 划词 AI 动作定义已抽至共享模块（创作 / Obsidian 笔记共用同一份），此处仅做兼容 re-export
export {
	type ActionState,
	type AiBarAction,
	buildCustomInstructionPrompt,
	DEFAULT_ACTIONS,
	getActionInstruction,
} from "../../../ai/selectionActions";

export interface FloatPos {
	top: number;
	left: number;
}
