import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type {
	InstallSkillResult,
	UninstallSkillResult,
} from "../../../components/skills/types.ts";
import { clearOverviewCache } from "./overview.ts";
import { DEFAULT_SKILL_ROOTS, expandHome } from "./roots.ts";

const execFileAsync = promisify(execFile);

export interface InstallSkillOptions {
	mode: "git" | "scaffold";
	skillName: string;
	targetRoot?: string;
	repoUrl?: string;
	title?: string;
	description?: string;
	category?: string;
}

/**
 * Install a skill via Git clone or direct scaffolding into a target skills root directory.
 */
export async function installSkill(
	options: InstallSkillOptions,
): Promise<InstallSkillResult> {
	const {
		mode,
		skillName,
		targetRoot,
		repoUrl,
		title,
		description,
		category = "开发编程",
	} = options;

	// Normalize clean folder name
	const safeDirName = (skillName || "new-skill")
		.trim()
		.toLowerCase()
		.replace(/[^a-zA-Z0-9_\-.]/g, "-");

	if (!safeDirName) {
		return { success: false, message: "无效的技能名称" };
	}

	// Determine destination root directory (default to project workspace: .agents/skills)
	let destRoot = targetRoot ? expandHome(targetRoot) : "";
	if (!destRoot) {
		destRoot = path.resolve(process.cwd(), ".agents/skills");
	}

	const targetSkillDir = path.join(destRoot, safeDirName);

	try {
		// Check if target directory already exists
		try {
			const stat = await fs.stat(targetSkillDir);
			if (stat.isDirectory()) {
				return {
					success: false,
					message: `安装失败：目标目录已存在 (${safeDirName})`,
				};
			}
		} catch {
			// Directory does not exist, continue
		}

		await fs.mkdir(destRoot, { recursive: true });

		if (mode === "git") {
			if (!repoUrl || !repoUrl.trim()) {
				return { success: false, message: "请输入有效的 Git 仓库地址" };
			}
			// Clone repository using shallow depth
			await execFileAsync(
				"git",
				["clone", "--depth", "1", repoUrl.trim(), safeDirName],
				{ cwd: destRoot, timeout: 60_000 },
			);
		} else {
			// Scaffold mode: create directory and initial SKILL.md
			await fs.mkdir(targetSkillDir, { recursive: true });

			const displayTitle = (title || skillName).trim();
			const descText = (description || "新安装的本地 Agent Skill").trim();

			const skillMdContent = `---
name: "${displayTitle.replace(/"/g, '\\"')}"
description: "${descText.replace(/"/g, '\\"')}"
category: "${category}"
version: "1.0.0"
author: "Local"
---

# ${displayTitle}

${descText}

## 触发与用法
在对话框中输入 \`/${safeDirName}\` 即可引用并激活本技能上下文。
`;

			await fs.writeFile(
				path.join(targetSkillDir, "SKILL.md"),
				skillMdContent,
				"utf-8",
			);
		}

		// Clear overview cache to immediately reflect changes
		clearOverviewCache();

		return {
			success: true,
			message: `技能「${safeDirName}」已成功安装至 ${path.basename(destRoot)}`,
			dirPath: targetSkillDir,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			message: `安装失败: ${msg}`,
		};
	}
}

/**
 * Safely uninstall/delete a skill directory from disk.
 * Includes strict path verification against recognized skill roots.
 */
export async function uninstallSkill(
	dirPath: string,
): Promise<UninstallSkillResult> {
	if (!dirPath || typeof dirPath !== "string") {
		return { success: false, message: "无效的技能路径" };
	}

	const normalizedTarget = path.resolve(dirPath);

	// Security validation: verify dirPath is within one of the valid skill roots
	const isAllowed = DEFAULT_SKILL_ROOTS.some((r) => {
		const rootResolved = path.resolve(expandHome(r.path));
		const relative = path.relative(rootResolved, normalizedTarget);
		// Must be a non-empty child path
		return (
			!relative.startsWith("..") &&
			!path.isAbsolute(relative) &&
			relative !== ""
		);
	});

	if (!isAllowed) {
		return {
			success: false,
			message: "安全拦截：目标路径不在允许的 Skills 根目录范围内",
		};
	}

	try {
		const stat = await fs.stat(normalizedTarget);
		if (!stat.isDirectory()) {
			return { success: false, message: "目标不是有效目录" };
		}

		await fs.rm(normalizedTarget, { recursive: true, force: true });

		// Clear overview cache to immediately reflect changes
		clearOverviewCache();

		return {
			success: true,
			message: "技能已成功卸载并清理文件",
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			message: `卸载失败: ${msg}`,
		};
	}
}
