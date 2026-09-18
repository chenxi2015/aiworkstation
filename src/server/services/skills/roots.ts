import os from "node:os";
import path from "node:path";

/**
 * 根目录清单约定大于配置：改 DEFAULT_SKILL_ROOTS 即调整扫描范围。
 */
export const DEFAULT_SKILL_ROOTS: ReadonlyArray<{
	label: string;
	path: string;
}> = [
	// Core & Official Agent roots
	{ label: "Antigravity", path: "~/.gemini/config/skills" },
	{ label: "Antigravity (IDE)", path: "~/.gemini/skills" },
	{ label: "Builtin", path: "~/.gemini/antigravity-ide/builtin/skills" },
	{ label: "Codex", path: "~/.codex/skills" },
	{ label: "Agents", path: "~/.agents/skills" },
	{ label: "Claude", path: "~/.claude/skills" },
	{ label: "OpenClaw", path: "~/.openclaw/skills" },
	{ label: "Hermes", path: "~/.hermes/skills" },

	// Mainstream & domestic AI tool roots
	{ label: "WorkBuddy", path: "~/.workbuddy/skills" },
	{ label: "千问", path: "~/.qwen/skills" },
	{ label: "豆包", path: "~/DoubaoWork/skills" },
	{ label: "豆包", path: "~/.doubao/skills" },
	{ label: "Cursor", path: "~/.cursor/skills" },
	{ label: "Trae", path: "~/.trae/skills" },
	{ label: "Trae CN", path: "~/.trae-cn/skills" },
	{ label: "Windsurf", path: "~/.codeium/windsurf/skills" },
	{ label: "Windsurf", path: "~/.windsurf/skills" },
	{ label: "Grok", path: "~/.grok/skills" },
	{ label: "通义灵码", path: "~/.lingma/skills" },
	{ label: "iFlow", path: "~/.iflow/skills" },
	{ label: "StepFun", path: "~/.stepfun/skills" },
	{ label: "Kiro", path: "~/.kiro/skills" },
	{ label: "CodeBuddy", path: "~/.codebuddy/skills" },
	{ label: "Devin", path: "~/.config/devin/skills" },
	{ label: "Devin", path: "~/.devin/skills" },
	{ label: "Junie", path: "~/.junie/skills" },
	{ label: "Augment", path: "~/.augment/skills" },
	{ label: "Tabnine", path: "~/.tabnine/agent/skills" },
	{ label: "Tabnine", path: "~/.tabnine/skills" },
	{ label: "MarsCode", path: "~/.marscode/builtin/global/skills" },
	{ label: "MarsCode", path: "~/.marscode/skills" },
	{ label: "CC-Switch", path: "~/.cc-switch/skills" },

	// Workspace-level skills
	{ label: "Workspace", path: ".agents/skills" },
	{ label: "Workspace (OpenClaw)", path: ".openclaw/skills" },
];

export function expandHome(p: string): string {
	if (p === "~") return os.homedir();
	if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
	if (path.isAbsolute(p)) return p;
	return path.resolve(process.cwd(), p);
}
