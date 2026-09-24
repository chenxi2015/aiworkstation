import { type Dirent, promises as fs } from "node:fs";
import path from "node:path";
import type {
	SkillInfo,
	SkillRootInfo,
} from "../../../components/skills/types.ts";
import { parseFrontmatter } from "./frontmatter.ts";
import { type DEFAULT_SKILL_ROOTS, expandHome } from "./roots.ts";

/** Probe up to 16KB for frontmatter during discovery */
const FRONTMATTER_PROBE_BYTES = 16 * 1024;

/** Cache entry for scanned skill to avoid disk I/O on unchanged folders */
interface SkillCacheEntry {
	mtimeMs: number;
	skill: SkillInfo;
}

const skillCache = new Map<string, SkillCacheEntry>();

export function clearScanCache(): void {
	skillCache.clear();
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
			// Continue trying next candidate
		}
	}
	return null;
}

interface DiscoveredSkillTarget {
	dirPath: string;
	relPath: string;
	markdown: string | null;
	mtimeMs: number;
}

/**
 * Fast discovery of skill directories.
 * Avoids deep full-tree traversal to keep I/O latency under 20ms.
 */
async function discoverSkillTargets(
	currentDir: string,
	baseDir: string,
	depth = 0,
	maxDepth = 2,
): Promise<DiscoveredSkillTarget[]> {
	if (depth > maxDepth) return [];
	let entries: Dirent[];
	try {
		entries = await fs.readdir(currentDir, { withFileTypes: true });
	} catch {
		return [];
	}

	const subTargets = await Promise.all(
		entries
			.filter(
				(entry) => !entry.name.startsWith(".") && entry.name !== "node_modules",
			)
			.map(async (entry): Promise<DiscoveredSkillTarget[]> => {
				const fullPath = path.join(currentDir, entry.name);
				let isDir = entry.isDirectory();

				if (!isDir && entry.isSymbolicLink()) {
					try {
						const stat = await fs.stat(fullPath);
						isDir = stat.isDirectory();
					} catch {
						return [];
					}
				}
				if (!isDir) return [];

				let dirMtime = 0;
				try {
					const stat = await fs.stat(fullPath);
					dirMtime = stat.mtimeMs;
				} catch {
					// Ignore stat failure
				}

				const skillMdResult = await findSkillMd(fullPath);
				const relPath = path.relative(baseDir, fullPath);

				if (skillMdResult !== null) {
					return [
						{
							dirPath: fullPath,
							relPath,
							markdown: skillMdResult.content,
							mtimeMs: dirMtime,
						},
					];
				}

				if (depth >= maxDepth) return [];
				return await discoverSkillTargets(
					fullPath,
					baseDir,
					depth + 1,
					maxDepth,
				);
			}),
	);

	return subTargets.flat();
}

/**
 * Fast scan of a single skill directory with mtime caching.
 * Performs shallow stat instead of recursive walking of thousands of files.
 */
async function scanSkillDir(
	dirPath: string,
	rootPath: string,
	rootLabel: string,
	relPath: string,
	initialMarkdown: string | null,
	dirMtimeMs: number,
): Promise<SkillInfo> {
	// 1. Check mtime incremental cache
	const cached = skillCache.get(dirPath);
	if (cached && cached.mtimeMs === dirMtimeMs) {
		return cached.skill;
	}

	let markdown = initialMarkdown;
	if (markdown === null) {
		const found = await findSkillMd(dirPath);
		markdown = found?.content ?? null;
	}

	const fm = markdown ? parseFrontmatter(markdown) : {};

	// Fast shallow count of direct children instead of deep walking
	let shallowCount = 0;
	try {
		const directEntries = await fs.readdir(dirPath);
		shallowCount = directEntries.length;
	} catch {
		shallowCount = 1;
	}

	// Guess category if not present
	const name = fm.name || path.basename(dirPath);
	const desc = fm.description || "";
	let category =
		((fm as Record<string, unknown>).category as string) || "常用工具";

	if (
		/code|dev|program|ts|js|python|api|git|rust|go|react|vue|web/i.test(
			name + desc,
		)
	) {
		category = "开发编程";
	} else if (/doc|word|pdf|ppt|excel|office|mail|sheet/i.test(name + desc)) {
		category = "办公效率";
	} else if (/search|know|wiki|note|read|obsidian|book/i.test(name + desc)) {
		category = "知识管理";
	} else if (/video|audio|image|design|music|media/i.test(name + desc)) {
		category = "设计多媒体";
	} else if (/life|health|weather|chat|family|parent/i.test(name + desc)) {
		category = "生活服务";
	}

	const skillInfo: SkillInfo = {
		id: path.basename(dirPath),
		name,
		description: desc,
		version: fm.version,
		author: fm.author,
		license: fm.license,
		dirName: relPath,
		dirPath,
		rootPath,
		rootLabel,
		fileCount: shallowCount,
		sizeBytes: 1024 * shallowCount, // Shallow estimate; full size computed on demand in detail view
		modifiedAt: dirMtimeMs || Date.now(),
		hasSkillMd: markdown !== null,
		category,
		source: rootLabel,
		verified: Boolean(fm.author || rootLabel === "Antigravity"),
		needsApiKey: /api.?key|token|secret|环境变量/i.test(desc),
		installed: true,
		installStatus: "installed",
	};

	skillCache.set(dirPath, { mtimeMs: dirMtimeMs, skill: skillInfo });
	return skillInfo;
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
	const skills = await Promise.all(
		targets.map((target) =>
			scanSkillDir(
				target.dirPath,
				rootPath,
				root.label,
				target.relPath,
				target.markdown,
				target.mtimeMs,
			),
		),
	);

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
