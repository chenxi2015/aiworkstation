import type { Folder } from "../../../types";

export interface MentionCandidate {
	id: string;
	type: "folder" | "bookmark";
	title: string;
	subtitle?: string;
	icon?: string;
	url?: string;
	folderId?: number;
	category?: string;
	score?: number;
	matchReason?: string;
}

/**
 * Extract hostname safely from a URL string
 */
function extractHostname(url?: string): string {
	if (!url) return "";
	try {
		return new URL(url).hostname;
	} catch {
		return "";
	}
}

/**
 * Score a single item candidate against query terms
 */
function scoreItem(
	title: string,
	q: string,
	terms: string[],
	domain: string,
	fullUrl: string,
): { score: number; reason?: string } {
	const tLower = title.toLowerCase();
	const tClean = tLower.replace(/\s+/g, "");
	const qClean = q.replace(/\s+/g, "");
	const dLower = domain.toLowerCase();
	const uLower = fullUrl.toLowerCase();

	// 1. Exact match on title (with or without spaces)
	if (tLower === q || (qClean && tClean === qClean)) {
		return { score: 100, reason: "标题完全匹配" };
	}

	// 2. Title starts with query
	if (tLower.startsWith(q) || (qClean && tClean.startsWith(qClean))) {
		return { score: 85, reason: "标题前缀匹配" };
	}

	// 3. Title contains full query
	if (tLower.includes(q) || (qClean && tClean.includes(qClean))) {
		return { score: 70, reason: "标题匹配" };
	}

	// 4. Domain exactly matches or contains query
	if (dLower && (dLower === q || dLower.includes(q))) {
		return { score: 45, reason: "域名匹配" };
	}

	// 5. Multi-term or URL path match
	let score = 0;
	let hasTitleTerm = false;
	let hasDomainTerm = false;

	for (const term of terms) {
		if (tLower.includes(term)) {
			score += 30;
			hasTitleTerm = true;
		}
		if (dLower.includes(term)) {
			score += 15;
			hasDomainTerm = true;
		} else if (uLower.includes(term)) {
			score += 8;
		}
	}

	if (score > 0) {
		const reason = hasTitleTerm
			? "关键词匹配"
			: hasDomainTerm
				? "域名匹配"
				: "链接匹配";
		return { score, reason };
	}

	return { score: 0 };
}

/**
 * Search and rank mention candidates based on weighted multi-field matching
 */
export function searchMentionCandidates(
	folders: Folder[],
	query: string,
	limit = 8,
): MentionCandidate[] {
	const q = query.toLowerCase().trim();

	// Default suggestions when no query is typed after '@'
	if (!q) {
		const defaultList: MentionCandidate[] = [];
		for (const f of folders) {
			defaultList.push({
				id: `mention_folder_${f.id}`,
				type: "folder",
				title: f.name,
				subtitle: `${f.items?.length ?? 0} 个书签 · ${f.category}`,
				folderId: f.id,
				category: f.category,
			});
		}
		for (const f of folders) {
			for (const item of f.items || []) {
				defaultList.push({
					id: `mention_bm_${item.id ?? item.url}`,
					type: "bookmark",
					title: item.name,
					subtitle: extractHostname(item.url) || f.name,
					url: item.url,
					icon: item.favicon,
					folderId: f.id,
					category: f.category,
				});
				if (defaultList.length >= limit) return defaultList;
			}
		}
		return defaultList.slice(0, limit);
	}

	const qClean = q.replace(/\s+/g, "");
	const terms = q.split(/\s+/).filter(Boolean);
	const scoredList: MentionCandidate[] = [];

	// 1. Folders matching (folders represent high-level collections, prioritized over bookmarks)
	for (const f of folders) {
		const fNameLower = f.name.toLowerCase();
		const fNameClean = fNameLower.replace(/\s+/g, "");
		const fDescLower = (f.desc || "").toLowerCase();
		let fScore = 0;
		let fReason: string | undefined;

		if (fNameLower === q || (qClean && fNameClean === qClean)) {
			fScore = 120;
			fReason = "文件夹完全匹配";
		} else if (
			fNameLower.startsWith(q) ||
			(qClean && fNameClean.startsWith(qClean))
		) {
			fScore = 105;
			fReason = "文件夹前缀匹配";
		} else if (
			fNameLower.includes(q) ||
			(qClean && fNameClean.includes(qClean))
		) {
			fScore = 90;
			fReason = "文件夹名匹配";
		} else if (
			fDescLower.includes(q) ||
			(qClean && fDescLower.replace(/\s+/g, "").includes(qClean))
		) {
			fScore = 55;
			fReason = "文件夹描述匹配";
		} else if (f.category?.toLowerCase().includes(q)) {
			fScore = 40;
			fReason = "分类匹配";
		} else {
			for (const term of terms) {
				if (fNameLower.includes(term)) {
					fScore += 35;
					fReason = "文件夹匹配";
				} else if (fDescLower.includes(term)) {
					fScore += 20;
					fReason = "简介匹配";
				}
			}
		}

		if (fScore > 0) {
			const subtitle = f.desc
				? `${f.desc} · ${f.items?.length ?? 0} 项`
				: `${f.items?.length ?? 0} 个书签 · ${f.category}`;
			scoredList.push({
				id: `mention_folder_${f.id}`,
				type: "folder",
				title: f.name,
				subtitle,
				folderId: f.id,
				category: f.category,
				score: fScore,
				matchReason: fReason,
			});
		}
	}

	// 2. Bookmarks matching
	for (const f of folders) {
		for (const item of f.items || []) {
			const host = extractHostname(item.url);
			const { score, reason } = scoreItem(
				item.name,
				q,
				terms,
				host,
				item.url || "",
			);

			if (score > 0) {
				scoredList.push({
					id: `mention_bm_${item.id ?? item.url}`,
					type: "bookmark",
					title: item.name,
					subtitle: host || f.name,
					url: item.url,
					icon: item.favicon,
					folderId: f.id,
					category: f.category,
					score,
					matchReason: reason,
				});
			}
		}
	}

	// Sort descending by score
	scoredList.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

	return scoredList.slice(0, limit);
}
