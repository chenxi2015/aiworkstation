import path from "node:path";
import type {
	SkillInfo,
	SkillRootInfo,
	SkillsOverview,
} from "../../../components/skills/types.ts";
import { DEFAULT_SKILL_ROOTS, expandHome } from "./roots.ts";
import { scanRoot } from "./scanCore.ts";

const OVERVIEW_CACHE_MS = 60_000;

let overviewCache: { data: SkillsOverview; at: number } | null = null;
let overviewInflight: Promise<SkillsOverview> | null = null;

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
	// 并发去重：缓存空窗期内多个调用方共享同一次扫描
	if (!force && overviewInflight) return overviewInflight;
	const task = doScanSkillsOverview();
	overviewInflight = task;
	try {
		return await task;
	} finally {
		if (overviewInflight === task) overviewInflight = null;
	}
}

async function doScanSkillsOverview(): Promise<SkillsOverview> {
	// 先同步去重根目录，再并行扫描（原串行 for-await 在 ~35 个根目录上延迟叠加）
	const uniqueRoots: Array<{ label: string; path: string }> = [];
	const seenPaths = new Set<string>();
	for (const root of DEFAULT_SKILL_ROOTS) {
		const expanded = expandHome(root.path);
		if (seenPaths.has(expanded)) continue;
		seenPaths.add(expanded);
		uniqueRoots.push(root);
	}
	const scanned = await Promise.all(uniqueRoots.map((root) => scanRoot(root)));

	const roots: SkillRootInfo[] = [];
	const skills: SkillInfo[] = [];
	const usedLabels = new Set<string>();

	for (const { info, skills: rootSkills } of scanned) {
		// "有就加载，没有就不加载"：只保留本机实际存在（exists=true）的根目录
		if (!info.exists) {
			continue;
		}

		// Avoid duplicate tab labels if multiple paths resolve for the same vendor
		const originalLabel = info.label;
		let finalLabel = info.label;
		if (usedLabels.has(finalLabel)) {
			finalLabel = `${info.label} (${path.basename(path.dirname(info.path))})`;
		}
		usedLabels.add(finalLabel);
		info.label = finalLabel;

		if (finalLabel !== originalLabel) {
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
