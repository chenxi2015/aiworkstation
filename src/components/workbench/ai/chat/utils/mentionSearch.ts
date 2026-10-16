import type {
	MentionDocumentEntry,
	MentionMaterialEntry,
	MentionNoteEntry,
} from "../../../../../stores/mentionIndexStore";
import type { Folder } from "../../../types";

export type MentionType =
	| "folder"
	| "bookmark"
	| "note"
	| "document"
	| "material";

export interface MentionCandidate {
	id: string;
	type: MentionType;
	title: string;
	subtitle?: string;
	icon?: string;
	url?: string;
	folderId?: number;
	/** note 类型的 Vault 相对路径 */
	notePath?: string;
	/** document 类型主键 */
	documentId?: number;
	/** material 类型主键 */
	materialId?: number;
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
		const seenFolderIds = new Set<number>();
		for (const f of folders) {
			if (seenFolderIds.has(f.id)) continue;
			seenFolderIds.add(f.id);
			defaultList.push({
				id: `mention_folder_${f.id}`,
				type: "folder",
				title: f.name,
				subtitle: `${f.items?.length ?? 0} 个书签 · ${f.category}`,
				folderId: f.id,
				category: f.category,
			});
		}
		const seenBmKeys = new Set<string>();
		for (const f of folders) {
			for (const item of f.items || []) {
				const bmKey = String(item.id ?? item.url);
				if (seenBmKeys.has(bmKey)) continue;
				seenBmKeys.add(bmKey);
				defaultList.push({
					id: `mention_bm_${bmKey}`,
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
	const seenFolderIds = new Set<number>();
	for (const f of folders) {
		if (seenFolderIds.has(f.id)) continue;
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
			seenFolderIds.add(f.id);
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

	// 2. Bookmarks matching (deduplicating across folders and keeping highest score)
	const bookmarkMap = new Map<string, MentionCandidate>();
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
				const bmKey = String(item.id ?? item.url);
				const existing = bookmarkMap.get(bmKey);
				if (!existing || score > (existing.score ?? 0)) {
					bookmarkMap.set(bmKey, {
						id: `mention_bm_${bmKey}`,
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
	}

	for (const cand of bookmarkMap.values()) {
		scoredList.push(cand);
	}

	// Sort descending by score
	scoredList.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

	return scoredList.slice(0, limit);
}

// ---------- 多源聚合（笔记 / 文档 / 素材） ----------

/** 简单标题打分：完全 > 前缀 > 包含 > 多词 */
function scoreTitle(
	title: string,
	q: string,
	qClean: string,
	terms: string[],
): number {
	const t = title.toLowerCase();
	const tClean = t.replace(/\s+/g, "");
	if (t === q || (qClean && tClean === qClean)) return 100;
	if (t.startsWith(q) || (qClean && tClean.startsWith(qClean))) return 85;
	if (t.includes(q) || (qClean && tClean.includes(qClean))) return 70;
	let s = 0;
	for (const term of terms) if (t.includes(term)) s += 25;
	return s;
}

export interface AllSourceInput {
	folders: Folder[];
	notes: MentionNoteEntry[];
	documents: MentionDocumentEntry[];
	materials: MentionMaterialEntry[];
}

/** 每类在无查询时的默认展示条数 / 有查询时的各类配额 */
const PER_GROUP_DEFAULT = 4;
const PER_GROUP_SEARCH = 6;

/**
 * 跨模块多源 mention 检索：文件夹 + 书签 + 笔记 + 文档 + 素材。
 * 返回按类型分组的扁平数组（组内按分数降序），供菜单分组渲染。
 * 轻量标题级内存检索——mention 是「快速定位已知目标」，不走向量。
 */
export function searchAllMentionSources(
	input: AllSourceInput,
	query: string,
): MentionCandidate[] {
	const q = query.toLowerCase().trim();

	// 无查询：各源给默认建议（书签/文件夹复用现有打分逻辑取顶部）
	if (!q) {
		const bm = searchMentionCandidates(
			input.folders,
			"",
			PER_GROUP_DEFAULT * 2,
		);
		const notes: MentionCandidate[] = input.notes
			.slice(0, PER_GROUP_DEFAULT)
			.map((n) => ({
				id: `mention_note_${n.relPath}`,
				type: "note",
				title: n.bare,
				subtitle: n.dir || "根目录",
				notePath: n.relPath,
			}));
		const docs: MentionCandidate[] = input.documents
			.slice(0, PER_GROUP_DEFAULT)
			.map((d) => ({
				id: `mention_doc_${d.id}`,
				type: "document",
				title: d.title,
				subtitle: d.subtitle,
				documentId: d.id,
			}));
		const mats: MentionCandidate[] = input.materials
			.slice(0, PER_GROUP_DEFAULT)
			.map((m) => ({
				id: `mention_mat_${m.id}`,
				type: "material",
				title: m.title,
				subtitle: m.subtitle,
				materialId: m.id,
			}));
		return [...bm, ...notes, ...docs, ...mats];
	}

	const qClean = q.replace(/\s+/g, "");
	const terms = q.split(/\s+/).filter(Boolean);

	// 1. 文件夹 + 书签（沿用现有加权检索）
	const bmMatches = searchMentionCandidates(
		input.folders,
		query,
		PER_GROUP_SEARCH * 2,
	);

	// 2. 笔记（文件名 + 目录路径）
	const noteMatches: MentionCandidate[] = [];
	for (const n of input.notes) {
		const score =
			scoreTitle(n.bare, q, qClean, terms) ||
			scoreTitle(n.dir, q, qClean, terms) * 0.4;
		if (score > 0) {
			noteMatches.push({
				id: `mention_note_${n.relPath}`,
				type: "note",
				title: n.bare,
				subtitle: n.dir || "根目录",
				notePath: n.relPath,
				score,
				matchReason: "笔记",
			});
		}
	}
	noteMatches.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

	// 3. 文档（标题）
	const docMatches: MentionCandidate[] = [];
	for (const d of input.documents) {
		const score = scoreTitle(d.title, q, qClean, terms);
		if (score > 0) {
			docMatches.push({
				id: `mention_doc_${d.id}`,
				type: "document",
				title: d.title,
				subtitle: d.subtitle,
				documentId: d.id,
				score,
				matchReason: "文档",
			});
		}
	}
	docMatches.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

	// 4. 素材（标题）
	const matMatches: MentionCandidate[] = [];
	for (const m of input.materials) {
		const score = scoreTitle(m.title, q, qClean, terms);
		if (score > 0) {
			matMatches.push({
				id: `mention_mat_${m.id}`,
				type: "material",
				title: m.title,
				subtitle: m.subtitle,
				materialId: m.id,
				score,
				matchReason: "素材",
			});
		}
	}
	matMatches.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

	return [
		...bmMatches.slice(0, PER_GROUP_SEARCH),
		...noteMatches.slice(0, PER_GROUP_SEARCH),
		...docMatches.slice(0, PER_GROUP_SEARCH),
		...matMatches.slice(0, PER_GROUP_SEARCH),
	];
}
