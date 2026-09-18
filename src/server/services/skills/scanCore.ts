import { type Dirent, promises as fs } from "node:fs";
import path from "node:path";
import type {
	SkillInfo,
	SkillRootInfo,
} from "../../../components/skills/types.ts";
import { parseFrontmatter } from "./frontmatter.ts";
import { type DEFAULT_SKILL_ROOTS, expandHome } from "./roots.ts";

/** discovery 阶段解析 frontmatter 只需读取文件头部 */
const FRONTMATTER_PROBE_BYTES = 16 * 1024;

/** 递归统计目录文件数 / 总大小 / 最新修改时间（带防御性上限） */
async function walkStats(
	dir: string,
	state: { fileCount: number; sizeBytes: number; modifiedAt: number },
	depth = 0,
): Promise<void> {
	if (depth > 6 || state.fileCount > 5000) return;
	let entries: Dirent[];
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	await Promise.all(
		entries.map(async (entry) => {
			if (entry.name === "node_modules" || entry.name.startsWith(".")) return;
			if (state.fileCount > 5000) return;
			const full = path.join(dir, entry.name);
			// Dirent 快速路径：常规目录直接递归，免去每个条目一次 stat
			if (entry.isDirectory()) {
				await walkStats(full, state, depth + 1);
				return;
			}
			// 非常规类型（符号链接等）才 stat 跟随，保持原行为
			if (!entry.isFile() && !entry.isSymbolicLink()) return;
			try {
				const stat = await fs.stat(full);
				if (stat.isDirectory()) {
					await walkStats(full, state, depth + 1);
				} else if (stat.isFile()) {
					state.fileCount += 1;
					state.sizeBytes += stat.size;
					if (stat.mtimeMs > state.modifiedAt) state.modifiedAt = stat.mtimeMs;
				}
			} catch {
				// Ignore unreadable files or broken symlinks
			}
		}),
	);
}

/**
 * Safely search and read SKILL.md or skill.md from a directory
 */
export async function readFileCapped(
	full: string,
	maxBytes: number,
): Promise<{ rawBuffer: Buffer; truncated: boolean }> {
	const handle = await fs.open(full, "r");
	try {
		const { size } = await handle.stat();
		const length = Math.min(size, maxBytes);
		const buf = Buffer.alloc(length);
		await handle.read(buf, 0, length, 0);
		return { rawBuffer: buf, truncated: size > maxBytes };
	} finally {
		await handle.close();
	}
}

/**
 * Safely search and read SKILL.md or skill.md from a directory.
 * maxBytes 限制实际读入的字节数（discovery 只需头部解析 frontmatter，
 * 避免把整份大文档读进内存）。
 */
export async function findSkillMd(
	dirPath: string,
	maxBytes: number = FRONTMATTER_PROBE_BYTES,
): Promise<{
	content: string;
	rawBuffer: Buffer;
	truncated: boolean;
} | null> {
	for (const candidate of ["SKILL.md", "skill.md"]) {
		try {
			const full = path.join(dirPath, candidate);
			const { rawBuffer, truncated } = await readFileCapped(full, maxBytes);
			return {
				content: rawBuffer.toString("utf8"),
				rawBuffer,
				truncated,
			};
		} catch {
			// continue trying other casing
		}
	}
	return null;
}

interface DiscoveredSkillTarget {
	dirPath: string;
	relPath: string;
	markdown: string | null;
}

/**
 * Discover skill directories under a given directory recursively (up to maxDepth).
 * Follows symlinks safely. When a directory has SKILL.md, it is treated as a skill
 * and will not be recursed deeper. Otherwise, subdirectories are scanned (handling categorized skills e.g. Hermes).
 */
async function discoverSkillTargets(
	currentDir: string,
	baseDir: string,
	depth = 0,
	maxDepth = 3,
): Promise<DiscoveredSkillTarget[]> {
	if (depth > maxDepth) return [];
	let entries: Dirent[];
	try {
		entries = await fs.readdir(currentDir, { withFileTypes: true });
	} catch {
		return [];
	}

	// 并行处理子条目：Dirent 已能判断常规目录，仅符号链接需要 stat 跟随目标
	const nested = await Promise.all(
		entries
			.filter(
				(entry) => !entry.name.startsWith(".") && entry.name !== "node_modules",
			)
			.map(async (entry): Promise<DiscoveredSkillTarget[]> => {
				const fullPath = path.join(currentDir, entry.name);
				if (!entry.isDirectory()) {
					if (!entry.isSymbolicLink()) return [];
					try {
						const stat = await fs.stat(fullPath);
						if (!stat.isDirectory()) return [];
					} catch {
						return [];
					}
				}

				const skillMdResult = await findSkillMd(fullPath);
				const relPath = path.relative(baseDir, fullPath);

				if (skillMdResult !== null) {
					// Found a valid skill directory
					return [
						{ dirPath: fullPath, relPath, markdown: skillMdResult.content },
					];
				}
				if (depth >= maxDepth) return [];
				// Category directory or unfinished skill: probe subdirectories
				const subResults = await discoverSkillTargets(
					fullPath,
					baseDir,
					depth + 1,
					maxDepth,
				);
				if (subResults.length > 0) return subResults;
				// Top-level directory without SKILL.md and without child skills: retain as unfinished skill
				if (depth === 0)
					return [{ dirPath: fullPath, relPath, markdown: null }];
				return [];
			}),
	);
	return nested.flat();
}

async function scanSkillDir(
	dirPath: string,
	rootPath: string,
	rootLabel: string,
	relPath: string,
	initialMarkdown?: string | null,
): Promise<SkillInfo | null> {
	let markdown = initialMarkdown ?? null;
	if (markdown === null) {
		const found = await findSkillMd(dirPath);
		markdown = found?.content ?? null;
	}
	const fm = markdown ? parseFrontmatter(markdown) : {};
	const stats = { fileCount: 0, sizeBytes: 0, modifiedAt: 0 };
	await walkStats(dirPath, stats);
	return {
		name: fm.name || path.basename(dirPath),
		description: fm.description || "",
		version: fm.version,
		author: fm.author,
		license: fm.license,
		dirName: relPath,
		dirPath,
		rootPath,
		rootLabel,
		fileCount: stats.fileCount,
		sizeBytes: stats.sizeBytes,
		modifiedAt: stats.modifiedAt,
		hasSkillMd: markdown !== null,
	};
}

export async function scanRoot(
	root: (typeof DEFAULT_SKILL_ROOTS)[number],
): Promise<{ info: SkillRootInfo; skills: SkillInfo[] }> {
	const rootPath = expandHome(root.path);
	let exists = false;
	try {
		const stat = await fs.stat(rootPath);
		exists = stat.isDirectory();
	} catch {
		exists = false;
	}

	if (!exists) {
		return {
			info: { path: rootPath, label: root.label, exists: false, skillCount: 0 },
			skills: [],
		};
	}

	const targets = await discoverSkillTargets(rootPath, rootPath);
	const scannedSkills = await Promise.all(
		targets.map((target) =>
			scanSkillDir(
				target.dirPath,
				rootPath,
				root.label,
				target.relPath,
				target.markdown,
			),
		),
	);
	const skills = scannedSkills.filter((s): s is SkillInfo => s !== null);
	skills.sort((a, b) => b.modifiedAt - a.modifiedAt);
	return {
		info: {
			path: rootPath,
			label: root.label,
			exists: true,
			skillCount: skills.length,
		},
		skills,
	};
}
