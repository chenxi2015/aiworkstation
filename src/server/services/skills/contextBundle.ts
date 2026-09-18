import path from "node:path";
import type { SkillDetail } from "../../../components/skills/types.ts";
import { readSkillDetail } from "./detail.ts";
import { readSkillResourceFile, resolveSkillDir } from "./resource.ts";

export interface SkillContextBundle {
	skillName: string;
	dirPath: string;
	skillMd: string;
	inlinedFiles: Array<{ path: string; content: string }>;
	allFiles: string[];
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
