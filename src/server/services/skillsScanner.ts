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

const OVERVIEW_CACHE_MS = 60_000;
const MAX_DETAIL_FILES = 300;
const MAX_MARKDOWN_BYTES = 256 * 1024;

let overviewCache: { data: SkillsOverview; at: number } | null = null;

function expandHome(p: string): string {
	if (p === "~") return os.homedir();
	if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
	if (path.isAbsolute(p)) return p;
	return path.resolve(process.cwd(), p);
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
	}
}

/**
 * Safely search and read SKILL.md or skill.md from a directory
 */
async function findSkillMd(dirPath: string): Promise<{
	content: string;
	rawBuffer: Buffer;
} | null> {
	for (const candidate of ["SKILL.md", "skill.md"]) {
		try {
			const full = path.join(dirPath, candidate);
			const rawBuffer = await fs.readFile(full);
			return {
				content: rawBuffer.toString("utf8"),
				rawBuffer,
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

	const results: DiscoveredSkillTarget[] = [];
	for (const entry of entries) {
		if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
		const fullPath = path.join(currentDir, entry.name);
		try {
			const stat = await fs.stat(fullPath);
			if (!stat.isDirectory()) continue;
		} catch {
			continue;
		}

		const skillMdResult = await findSkillMd(fullPath);
		const relPath = path.relative(baseDir, fullPath);

		if (skillMdResult !== null) {
			// Found a valid skill directory
			results.push({
				dirPath: fullPath,
				relPath,
				markdown: skillMdResult.content,
			});
		} else if (depth < maxDepth) {
			// Category directory or unfinished skill: probe subdirectories
			const subResults = await discoverSkillTargets(
				fullPath,
				baseDir,
				depth + 1,
				maxDepth,
			);
			if (subResults.length > 0) {
				results.push(...subResults);
			} else if (depth === 0) {
				// Top-level directory without SKILL.md and without child skills: retain as unfinished skill
				results.push({ dirPath: fullPath, relPath, markdown: null });
			}
		}
	}
	return results;
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

async function scanRoot(
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
	const skills: SkillInfo[] = [];
	for (const target of targets) {
		const skill = await scanSkillDir(
			target.dirPath,
			rootPath,
			root.label,
			target.relPath,
			target.markdown,
		);
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
	const seenPaths = new Set<string>();
	const usedLabels = new Set<string>();

	for (const root of DEFAULT_SKILL_ROOTS) {
		const expanded = expandHome(root.path);
		if (seenPaths.has(expanded)) continue;
		seenPaths.add(expanded);

		const { info, skills: rootSkills } = await scanRoot(root);

		// "有就加载，没有就不加载"：只保留本机实际存在（exists=true）的根目录
		if (!info.exists) {
			continue;
		}

		// Avoid duplicate tab labels if multiple paths resolve for the same vendor
		let finalLabel = info.label;
		if (usedLabels.has(finalLabel)) {
			finalLabel = `${info.label} (${path.basename(path.dirname(info.path))})`;
		}
		usedLabels.add(finalLabel);
		info.label = finalLabel;

		if (finalLabel !== root.label) {
			for (const s of rootSkills) {
				s.rootLabel = finalLabel;
			}
		}

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
		const skillMdResult = await findSkillMd(dirPath);
		const raw = skillMdResult?.rawBuffer;
		if (raw) {
			if (raw.byteLength > MAX_MARKDOWN_BYTES) {
				markdown = raw.subarray(0, MAX_MARKDOWN_BYTES).toString("utf8");
				truncated = true;
			} else {
				markdown = raw.toString("utf8");
			}
		}
	} catch {
		markdown = null;
	}
	const files: string[] = [];
	await listFiles(dirPath, "", files);
	if (files.length >= MAX_DETAIL_FILES) truncated = true;
	return { skill, markdown, files: files.sort(), truncated };
}

export interface SkillContextBundle {
	skillName: string;
	dirPath: string;
	skillMd: string;
	inlinedFiles: Array<{ path: string; content: string }>;
	allFiles: string[];
}

/**
 * Find skill directory by absolute path or name/dirName
 */
export async function resolveSkillDir(
	dirPathOrName: string,
): Promise<string | null> {
	if (!dirPathOrName) return null;
	const overview = await scanSkillsOverview();
	const trimmed = dirPathOrName.trim();
	const normalized = trimmed.toLowerCase();

	const found = overview.skills.find(
		(s) =>
			s.dirPath === trimmed ||
			s.name.toLowerCase() === normalized ||
			s.dirName.toLowerCase() === normalized ||
			path.basename(s.dirPath).toLowerCase() === normalized,
	);
	if (found) return found.dirPath;

	// Check direct absolute path exists
	if (path.isAbsolute(trimmed)) {
		try {
			const stat = await fs.stat(trimmed);
			if (stat.isDirectory()) return trimmed;
		} catch {
			// not a valid directory
		}
	}
	return null;
}

/**
 * Safely read a resource file inside a skill directory
 */
export async function readSkillResourceFile(
	skillDirPathOrName: string,
	relativePath: string,
): Promise<{
	success: boolean;
	content?: string;
	error?: string;
	filePath?: string;
}> {
	const dirPath = await resolveSkillDir(skillDirPathOrName);
	if (!dirPath) {
		return {
			success: false,
			error: `Skill directory not found: ${skillDirPathOrName}`,
		};
	}

	// Normalize and prevent path traversal
	const cleanRelPath = path
		.normalize(relativePath)
		.replace(/^(\.\.[/\\])+/, "");
	const targetPath = path.resolve(dirPath, cleanRelPath);

	if (!targetPath.startsWith(dirPath)) {
		return { success: false, error: "Access denied: Path traversal detected" };
	}

	try {
		const stat = await fs.stat(targetPath);
		if (!stat.isFile()) {
			return { success: false, error: `Path is not a file: ${cleanRelPath}` };
		}
		const content = await fs.readFile(targetPath, "utf8");
		return { success: true, content, filePath: cleanRelPath };
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		return { success: false, error: `Failed to read file: ${msg}` };
	}
}

/**
 * Load complete local skill bundle for AI context injection in a fully generic way.
 * - Inlines SKILL.md
 * - Automatically discovers and inlines lightweight index/reference markdown files within a safe token budget (<= 64KB)
 * - If user query mentions keywords matching any sub-file basename, prioritizes inlining that file
 * - Provides full relative file manifest so LLM can read remaining files via read_skill_resource tool
 */
export async function loadSkillContextBundle(
	dirPathOrName: string,
	userQuery = "",
): Promise<SkillContextBundle | null> {
	const dirPath = await resolveSkillDir(dirPathOrName);
	if (!dirPath) return null;

	let skillDetail: SkillDetail;
	try {
		skillDetail = await readSkillDetail(dirPath);
	} catch {
		return null;
	}

	const skillMd = skillDetail.markdown || "";
	const allFiles = skillDetail.files || [];
	const inlinedFiles: Array<{ path: string; content: string }> = [];

	// Find all candidate markdown files (excluding root SKILL.md which is already loaded)
	const candidateMdFiles = allFiles.filter(
		(f) =>
			f.endsWith(".md") &&
			f.toLowerCase() !== "skill.md" &&
			!f.toLowerCase().endsWith("/skill.md"),
	);

	// Rank candidate files generically:
	// 1. Files whose basename matches words in userQuery
	// 2. Index / summary / guide / config files (matching generic naming conventions)
	// 3. Files in references/ or docs/
	const queryLower = userQuery.toLowerCase();
	const scoredFiles = candidateMdFiles.map((relPath) => {
		let score = 0;
		const baseName = path.basename(relPath, ".md").toLowerCase();
		const tokens = baseName.split(/[-_.]/).filter((t) => t.length >= 2);

		// Match user query words against filename tokens
		if (tokens.some((t) => queryLower.includes(t))) {
			score += 50;
		}

		// Generic documentation index/overview indicators
		if (
			/index|overview|summary|guide|spec|schema|common|main/i.test(baseName)
		) {
			score += 30;
		}

		// Prefer files under references/ or docs/
		if (relPath.startsWith("references/") || relPath.startsWith("docs/")) {
			score += 10;
		}

		return { relPath, score };
	});

	// Sort by score descending
	scoredFiles.sort((a, b) => b.score - a.score);

	// Inline candidate files within safe token budget (up to 64KB total across all inlined files)
	const MAX_INLINED_BYTES = 64 * 1024;
	let currentBytes = 0;

	for (const { relPath } of scoredFiles) {
		if (currentBytes >= MAX_INLINED_BYTES) break;

		const res = await readSkillResourceFile(dirPath, relPath);
		if (res.success && res.content) {
			const contentBytes = Buffer.byteLength(res.content, "utf8");
			if (
				currentBytes + contentBytes <= MAX_INLINED_BYTES ||
				inlinedFiles.length === 0
			) {
				inlinedFiles.push({ path: relPath, content: res.content });
				currentBytes += contentBytes;
			}
		}
	}

	return {
		skillName: skillDetail.skill.name,
		dirPath,
		skillMd,
		inlinedFiles,
		allFiles,
	};
}

/**
 * Check if a URL looks like an attempt to fetch a skill resource from GitHub/raw.
 * If so, intercepts and returns the local file content if found.
 */
export async function tryInterceptSkillUrl(
	url: string,
): Promise<string | null> {
	if (!url || !/github(usercontent)?\.com/i.test(url)) return null;

	try {
		const parsed = new URL(url);
		const pathname = decodeURIComponent(parsed.pathname);

		// Match relative markdown file target, e.g. references/theme-index.md or SKILL.md
		const fileMatch = pathname.match(
			/(?:references\/[^/]+\.md|SKILL\.md|[^/]+\.md)$/i,
		);
		if (!fileMatch) return null;

		const targetFile = fileMatch[0];

		const overview = await scanSkillsOverview();
		for (const skill of overview.skills) {
			const skillKey = skill.dirName.toLowerCase();
			const cleanKey = skillKey.replace(/[-_]/g, "");
			const pathLower = pathname.toLowerCase();
			if (pathLower.includes(skillKey) || pathLower.includes(cleanKey)) {
				const res = await readSkillResourceFile(skill.dirPath, targetFile);
				if (res.success && res.content) {
					return `[系统保护：已拦截外网爬虫请求，直接从本地读取]\n检测到正在尝试通过网络抓取本地技能「${skill.name}」的文档 [${targetFile}]。该技能已完整安装于本地，已直接从本地磁盘载入内容：\n\n${res.content}`;
				}
			}
		}
	} catch {
		// Ignore URL parsing errors
	}
	return null;
}
