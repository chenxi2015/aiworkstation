import { type Dirent, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
	SkillDetail,
	SkillInfo,
	SkillRootInfo,
	SkillsOverview,
} from "../../components/skills/types.ts";

/**
 * Skills 扫描器：读取本机散落的 skill 根目录，解析每个 SKILL.md 的
 * YAML frontmatter（仅取扁平字段：name/description/license + metadata.version/author），
 * 并统计目录文件数与体积。
 *
 * 根目录清单约定大于配置：改 DEFAULT_SKILL_ROOTS 即调整扫描范围。
 */

const DEFAULT_SKILL_ROOTS: ReadonlyArray<{ label: string; path: string }> = [
	{ label: "Codex", path: "~/.codex/skills" },
	{ label: "Agents", path: "~/.agents/skills" },
	{ label: "Claude", path: "~/.claude/skills" },
];

const OVERVIEW_CACHE_MS = 60_000;
const MAX_DETAIL_FILES = 300;
const MAX_MARKDOWN_BYTES = 256 * 1024;

let overviewCache: { data: SkillsOverview; at: number } | null = null;

function expandHome(p: string): string {
	if (p === "~") return os.homedir();
	if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
	return p;
}

/** 轻量 frontmatter 解析：只支持顶层 key: value 与 metadata: 下的一级缩进字段 */
function parseFrontmatter(content: string): {
	name?: string;
	description?: string;
	license?: string;
	version?: string;
	author?: string;
} {
	const result: Record<string, string> = {};
	const normalized = content.replace(/\r\n/g, "\n");
	if (!normalized.startsWith("---\n")) return result;
	const end = normalized.indexOf("\n---", 4);
	if (end === -1) return result;
	const block = normalized.slice(4, end);
	let inMetadata = false;
	for (const line of block.split("\n")) {
		if (!line.trim()) continue;
		const indent = line.length - line.trimStart().length;
		const match = line.trim().match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
		if (!match) continue;
		const [, key, rawValue] = match;
		const value = rawValue.replace(/^["']|["']$/g, "").trim();
		if (indent === 0) {
			inMetadata = key === "metadata";
			if (key === "name" || key === "description" || key === "license") {
				result[key] = value;
			}
		} else if (inMetadata && (key === "version" || key === "author")) {
			result[key] = value;
		}
	}
	return result;
}

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
	for (const entry of entries) {
		if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			await walkStats(full, state, depth + 1);
		} else if (entry.isFile()) {
			try {
				const stat = await fs.stat(full);
				state.fileCount += 1;
				state.sizeBytes += stat.size;
				if (stat.mtimeMs > state.modifiedAt) state.modifiedAt = stat.mtimeMs;
			} catch {
				// 忽略无权限文件
			}
		}
	}
}

async function scanSkillDir(
	rootPath: string,
	rootLabel: string,
	dirName: string,
): Promise<SkillInfo | null> {
	const dirPath = path.join(rootPath, dirName);
	const skillMdPath = path.join(dirPath, "SKILL.md");
	let markdown: string | null = null;
	try {
		markdown = await fs.readFile(skillMdPath, "utf8");
	} catch {
		// 无 SKILL.md 的目录也收录（标记 hasSkillMd=false），方便用户发现半成品 skill
	}
	const fm = markdown ? parseFrontmatter(markdown) : {};
	const stats = { fileCount: 0, sizeBytes: 0, modifiedAt: 0 };
	await walkStats(dirPath, stats);
	return {
		name: fm.name || dirName,
		description: fm.description || "",
		version: fm.version,
		author: fm.author,
		license: fm.license,
		dirName,
		dirPath,
		rootPath,
		rootLabel,
		fileCount: stats.fileCount,
		sizeBytes: stats.sizeBytes,
		modifiedAt: stats.modifiedAt,
		hasSkillMd: markdown !== null,
	};
}

async function scanRoot(
	root: (typeof DEFAULT_SKILL_ROOTS)[number],
): Promise<{ info: SkillRootInfo; skills: SkillInfo[] }> {
	const rootPath = expandHome(root.path);
	let entries: Dirent[];
	try {
		entries = await fs.readdir(rootPath, { withFileTypes: true });
	} catch {
		return {
			info: { path: rootPath, label: root.label, exists: false, skillCount: 0 },
			skills: [],
		};
	}
	const skills: SkillInfo[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
		const skill = await scanSkillDir(rootPath, root.label, entry.name);
		if (skill) skills.push(skill);
	}
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

/** 扫描全部 skill 根目录（60s 内存缓存，force 可绕过） */
export async function scanSkillsOverview(
	force = false,
): Promise<SkillsOverview> {
	if (
		!force &&
		overviewCache &&
		Date.now() - overviewCache.at < OVERVIEW_CACHE_MS
	) {
		return overviewCache.data;
	}
	const roots: SkillRootInfo[] = [];
	const skills: SkillInfo[] = [];
	for (const root of DEFAULT_SKILL_ROOTS) {
		const { info, skills: rootSkills } = await scanRoot(root);
		roots.push(info);
		skills.push(...rootSkills);
	}
	const data: SkillsOverview = { roots, skills, scannedAt: Date.now() };
	overviewCache = { data, at: Date.now() };
	return data;
}

async function listFiles(
	dir: string,
	base: string,
	out: string[],
	depth = 0,
): Promise<void> {
	if (depth > 6 || out.length >= MAX_DETAIL_FILES) return;
	let entries: Dirent[];
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (out.length >= MAX_DETAIL_FILES) return;
		if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
		const full = path.join(dir, entry.name);
		const rel = base ? `${base}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			await listFiles(full, rel, out, depth + 1);
		} else if (entry.isFile()) {
			out.push(rel);
		}
	}
}

/** 读取单个 skill 详情（SKILL.md 全文 + 文件清单），路径必须位于已知根目录内 */
export async function readSkillDetail(dirPath: string): Promise<SkillDetail> {
	const overview = await scanSkillsOverview();
	const skill = overview.skills.find((s) => s.dirPath === dirPath);
	if (!skill) {
		throw new Error(`Skill not found in known roots: ${dirPath}`);
	}
	let markdown: string | null = null;
	let truncated = false;
	try {
		const raw = await fs.readFile(path.join(dirPath, "SKILL.md"));
		if (raw.byteLength > MAX_MARKDOWN_BYTES) {
			markdown = raw.subarray(0, MAX_MARKDOWN_BYTES).toString("utf8");
			truncated = true;
		} else {
			markdown = raw.toString("utf8");
		}
	} catch {
		markdown = null;
	}
	const files: string[] = [];
	await listFiles(dirPath, "", files);
	if (files.length >= MAX_DETAIL_FILES) truncated = true;
	return { skill, markdown, files: files.sort(), truncated };
}
