import { useEffect, useMemo, useState } from "react";
import { fetchSkillsOverview } from "../../../services/api/skillsClient";
import type { SkillInfo } from "../../skills/types";

export interface SlashItem {
	id: string;
	type: "skill";
	name: string;
	description: string;
	iconName?: "box";
	skill?: SkillInfo;
}

// Module-level cached skills to avoid duplicate network/file scans across multiple input mounts
let cachedSkillsList: SlashItem[] | null = null;
let cachePromise: Promise<SlashItem[]> | null = null;

async function loadAllSlashSkills(): Promise<SlashItem[]> {
	if (cachedSkillsList) return cachedSkillsList;
	if (cachePromise) return cachePromise;

	cachePromise = (async () => {
		try {
			const overview = await fetchSkillsOverview(false);
			const rawSkills = overview.skills || [];

			// Deduplicate skills by normalized name (prefer hasSkillMd and latest modified)
			const skillMap = new Map<string, SkillInfo>();
			for (const s of rawSkills) {
				const key = s.name.trim().toLowerCase();
				const existing = skillMap.get(key);
				if (!existing) {
					skillMap.set(key, s);
				} else if (!existing.hasSkillMd && s.hasSkillMd) {
					skillMap.set(key, s);
				} else if (s.modifiedAt > existing.modifiedAt) {
					skillMap.set(key, s);
				}
			}

			const skillItems: SlashItem[] = Array.from(skillMap.values())
				.sort((a, b) => a.name.localeCompare(b.name))
				.map((skill) => ({
					id: `skill_${skill.dirPath}`,
					type: "skill" as const,
					name: skill.name,
					description: skill.description || `Local skill in ${skill.rootLabel}`,
					iconName: "box" as const,
					skill,
				}));

			cachedSkillsList = skillItems;
			return skillItems;
		} catch (err) {
			console.warn("[useSlashSkills] Error loading skills:", err);
			return [];
		} finally {
			cachePromise = null;
		}
	})();

	return cachePromise;
}

/**
 * Hook providing local skills with fuzzy/substring search
 */
export function useSlashSkills(query: string | null) {
	const [skills, setSkills] = useState<SlashItem[]>(cachedSkillsList || []);
	const [isLoading, setIsLoading] = useState(!cachedSkillsList);

	useEffect(() => {
		let isMounted = true;
		loadAllSlashSkills().then((items) => {
			if (isMounted) {
				setSkills(items);
				setIsLoading(false);
			}
		});
		return () => {
			isMounted = false;
		};
	}, []);

	const allItems = useMemo(() => {
		return skills;
	}, [skills]);

	const filteredItems = useMemo(() => {
		if (query === null) return [];
		const q = query.trim().toLowerCase();
		if (!q) return allItems;

		return allItems
			.filter((item) => {
				const name = item.name.toLowerCase();
				const desc = item.description.toLowerCase();
				return name.includes(q) || desc.includes(q);
			})
			.sort((a, b) => {
				// Exact prefix matches rank higher
				const aStarts = a.name.toLowerCase().startsWith(q);
				const bStarts = b.name.toLowerCase().startsWith(q);
				if (aStarts && !bStarts) return -1;
				if (!aStarts && bStarts) return 1;
				return 0;
			});
	}, [allItems, query]);

	return {
		allItems,
		filteredItems,
		isLoading,
	};
}
