import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type {
	InstallSkillResult,
	UninstallSkillResult,
} from "../../../components/skills/types.ts";
import { openInOs } from "../systemOpener.ts";
import { clearOverviewCache } from "./overview.ts";
import { DEFAULT_SKILL_ROOTS, expandHome } from "./roots.ts";

const execFileAsync = promisify(execFile);

export interface UploadFileItem {
	path: string;
	content: string;
	isBase64?: boolean;
}

export interface InstallSkillOptions {
	mode: "git" | "scaffold" | "upload";
	skillName: string;
	targetRoot?: string;
	repoUrl?: string;
	title?: string;
	description?: string;
	category?: string;
	uploadFiles?: UploadFileItem[];
	zipBase64?: string;
}

export interface InspectGitHubSkillResult {
	success: boolean;
	normalizedRepoUrl: string;
	skillName: string;
	title: string;
	description: string;
	category?: string;
	subpath?: string;
	hasSkillMd?: boolean;
	message?: string;
}

/**
 * Inspect a GitHub repository or subpath URL to extract skill metadata.
 */
export async function inspectGitHubSkill(
	input: string,
): Promise<InspectGitHubSkillResult> {
	const raw = (input || "").trim();
	if (!raw) {
		return {
			success: false,
			normalizedRepoUrl: "",
			skillName: "",
			title: "",
			description: "",
			message: "请输入 GitHub URL 或 owner/repository",
		};
	}

	let owner = "";
	let repo = "";
	let branch = "main";
	let subpath = "";

	// Handle git@github.com:owner/repo
	const sshMatch = raw.match(
		/git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/,
	);
	// Handle owner/repo
	const shorthandMatch = raw.match(/^([\w.-]+)\/([\w.-]+)$/);
	// Handle https://github.com/owner/repo/...
	const urlMatch = raw.match(
		/(?:https?:\/\/)?github\.com\/([\w.-]+)\/([\w.-]+)(?:\/(?:tree|blob)\/([\w.-]+)(?:\/(.*))?)?/,
	);

	if (sshMatch) {
		owner = sshMatch[1];
		repo = sshMatch[2].replace(/\.git$/, "");
	} else if (shorthandMatch) {
		owner = shorthandMatch[1];
		repo = shorthandMatch[2].replace(/\.git$/, "");
	} else if (urlMatch) {
		owner = urlMatch[1];
		repo = urlMatch[2].replace(/\.git$/, "");
		branch = urlMatch[3] || "main";
		subpath = (urlMatch[4] || "").replace(/^\/+|\/+$/g, "");
	} else {
		// Fallback: extract last segment
		const segments = raw.split("/").filter(Boolean);
		repo = segments[segments.length - 1]?.replace(/\.git$/, "") || "skill";
	}

	const normalizedRepoUrl =
		owner && repo ? `https://github.com/${owner}/${repo}.git` : raw;

	// Suggested slug: last part of subpath, or repo name
	const rawSlug = subpath ? subpath.split("/").pop() || repo : repo;
	const skillName = rawSlug.toLowerCase().replace(/[^a-zA-Z0-9_\-.]/g, "-");

	let title = skillName;
	let description = `来自 GitHub 仓库 ${owner ? `${owner}/${repo}` : repo} 的技能`;
	let category = "开发编程";
	let hasSkillMd = false;

	// Attempt to fetch SKILL.md from raw.githubusercontent.com with a short timeout
	if (owner && repo) {
		try {
			const candidateBranches = [branch, "main", "master"];
			for (const b of candidateBranches) {
				const rawUrl = subpath
					? `https://raw.githubusercontent.com/${owner}/${repo}/${b}/${subpath}/SKILL.md`
					: `https://raw.githubusercontent.com/${owner}/${repo}/${b}/SKILL.md`;

				const ctrl = new AbortController();
				const timer = setTimeout(() => ctrl.abort(), 3500);
				try {
					const res = await fetch(rawUrl, { signal: ctrl.signal });
					if (res.ok) {
						const text = await res.text();
						hasSkillMd = true;
						// Parse frontmatter
						const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
						if (fmMatch) {
							const fm = fmMatch[1];
							const nameMatch = fm.match(/^name:\s*["']?(.+?)["']?$/m);
							const descMatch = fm.match(/^description:\s*["']?(.+?)["']?$/m);
							const catMatch = fm.match(/^category:\s*["']?(.+?)["']?$/m);
							if (nameMatch) title = nameMatch[1].trim();
							if (descMatch) description = descMatch[1].trim();
							if (catMatch) category = catMatch[1].trim();
						}
						break;
					}
				} catch {
					// Fall through to next branch or fallback
				} finally {
					clearTimeout(timer);
				}
			}
		} catch {
			// Ignore network errors, use fallback metadata
		}
	}

	return {
		success: true,
		normalizedRepoUrl,
		skillName,
		title,
		description,
		category,
		subpath,
		hasSkillMd,
		message: hasSkillMd ? "已成功识别技能配置 (SKILL.md)" : "已解析仓库信息",
	};
}

/**
 * Install a skill via Git clone, direct scaffolding, or local upload into a target skills root directory.
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
		uploadFiles,
		zipBase64,
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
		} else if (mode === "upload") {
			await fs.mkdir(targetSkillDir, { recursive: true });

			if (zipBase64) {
				// Handle zip archive upload
				const os = await import("node:os");
				const tempZipPath = path.join(
					os.tmpdir(),
					`skill-upload-${Date.now()}-${safeDirName}.zip`,
				);
				const buffer = Buffer.from(zipBase64, "base64");
				await fs.writeFile(tempZipPath, buffer);

				try {
					await execFileAsync("unzip", [
						"-q",
						"-o",
						tempZipPath,
						"-d",
						targetSkillDir,
					]);
				} finally {
					await fs.rm(tempZipPath, { force: true }).catch(() => {});
				}

				// Check if unzipped into a single child directory
				const entries = await fs.readdir(targetSkillDir, {
					withFileTypes: true,
				});
				if (entries.length === 1 && entries[0].isDirectory()) {
					const singleChildPath = path.join(targetSkillDir, entries[0].name);
					const subEntries = await fs.readdir(singleChildPath);
					for (const sub of subEntries) {
						await fs.rename(
							path.join(singleChildPath, sub),
							path.join(targetSkillDir, sub),
						);
					}
					await fs
						.rm(singleChildPath, { recursive: true, force: true })
						.catch(() => {});
				}
			} else if (uploadFiles && uploadFiles.length > 0) {
				// Handle directory/files upload
				let hasSkillMd = false;
				for (const file of uploadFiles) {
					const cleanRelPath = file.path.replace(/^[/\\]+/, "");
					const destFilePath = path.join(targetSkillDir, cleanRelPath);
					await fs.mkdir(path.dirname(destFilePath), { recursive: true });

					if (file.isBase64) {
						const buf = Buffer.from(file.content, "base64");
						await fs.writeFile(destFilePath, buf);
					} else {
						await fs.writeFile(destFilePath, file.content, "utf-8");
					}

					if (path.basename(cleanRelPath).toLowerCase() === "skill.md") {
						hasSkillMd = true;
					}
				}

				// If no SKILL.md was present in uploaded files, generate one
				if (!hasSkillMd) {
					const displayTitle = (title || skillName).trim();
					const descText = (description || "本地上传的 Agent Skill").trim();
					const skillMdContent = `---
name: "${displayTitle.replace(/"/g, '\\"')}"
description: "${descText.replace(/"/g, '\\"')}"
category: "${category}"
version: "1.0.0"
author: "Local Upload"
---

# ${displayTitle}

${descText}
`;
					await fs.writeFile(
						path.join(targetSkillDir, "SKILL.md"),
						skillMdContent,
						"utf-8",
					);
				}
			} else {
				// Single file or fallback: create default SKILL.md
				const displayTitle = (title || skillName).trim();
				const descText = (description || "本地上传的 Agent Skill").trim();
				const skillMdContent = `---
name: "${displayTitle.replace(/"/g, '\\"')}"
description: "${descText.replace(/"/g, '\\"')}"
category: "${category}"
version: "1.0.0"
author: "Local Upload"
---

# ${displayTitle}

${descText}
`;
				await fs.writeFile(
					path.join(targetSkillDir, "SKILL.md"),
					skillMdContent,
					"utf-8",
				);
			}
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
 * Validate that a directory path is a descendant of one of the defined skill roots.
 */
export function isPathInSkillRoots(dirPath: string): boolean {
	if (!dirPath || typeof dirPath !== "string") return false;
	const normalizedTarget = path.resolve(dirPath);
	return DEFAULT_SKILL_ROOTS.some((r) => {
		const rootResolved = path.resolve(expandHome(r.path));
		const relative = path.relative(rootResolved, normalizedTarget);
		return (
			!relative.startsWith("..") &&
			!path.isAbsolute(relative) &&
			relative !== ""
		);
	});
}

/**
 * Safely reveal/open a skill directory in the host OS file manager.
 */
export async function openSkillDirectory(
	dirPath: string,
): Promise<{ success: boolean; message?: string }> {
	if (!dirPath || typeof dirPath !== "string") {
		return { success: false, message: "无效的技能路径" };
	}

	const normalizedTarget = path.resolve(dirPath);

	if (!isPathInSkillRoots(normalizedTarget)) {
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

		await openInOs(normalizedTarget, { skipRootCheck: true });
		return {
			success: true,
			message: "已在系统文件管理器中打开技能目录",
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			message: `打开目录失败: ${msg}`,
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

	if (!isPathInSkillRoots(normalizedTarget)) {
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
