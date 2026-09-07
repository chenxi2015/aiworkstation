import type { SqliteDatabase } from "../types.ts";

export interface TagRecord {
	id: number;
	name: string;
	color: string;
	createdAt: string;
	updatedAt: string;
}

export interface TagWithCount extends TagRecord {
	count: number;
}

export interface AffectedBookmarkInfo {
	id: string;
	title: string;
	url?: string;
	tags: string[];
}

export interface AddTagsPlanItem {
	bookmarkIds?: string[] | null;
	itemNamesOrUrls?: string[] | null;
	tags: string[];
}

export interface AddTagsResult {
	createdTags: string[];
	affectedBookmarks: AffectedBookmarkInfo[];
	skipped: string[];
}

export interface RemoveTagsResult {
	removedTags: string[];
	affectedBookmarks: Array<{ id: string; title: string; tags: string[] }>;
	deletedGlobal: boolean;
}

export interface RenameOrMergeTagsResult {
	mergedFrom: string[];
	targetTag: string;
	affectedBookmarksCount: number;
	affectedBookmarks: Array<{ id: string; title: string; tags: string[] }>;
}

/**
 * Repository handling tag creation, assignment, removal and governance
 */
export class TagRepository {
	constructor(private db: SqliteDatabase) {}

	/**
	 * Create single or multiple tags idempotently
	 */
	createTags(tags: Array<{ name: string; color?: string | null }>): {
		createdTags: string[];
		skipped: string[];
	} {
		const now = new Date().toISOString();
		const insertStmt = this.db.prepare(
			"INSERT OR IGNORE INTO tags (name, color, created_at, updated_at) VALUES (?, ?, ?, ?)",
		);

		const createdTags: string[] = [];
		const skipped: string[] = [];

		const tx = this.db.transaction(() => {
			for (const tag of tags) {
				const trimmed = tag.name?.trim();
				if (!trimmed) continue;
				const res = insertStmt.run(trimmed, tag.color || "", now, now);
				if (res.changes > 0) {
					createdTags.push(trimmed);
				} else {
					skipped.push(trimmed);
				}
			}
		});

		tx();
		return { createdTags, skipped };
	}

	/**
	 * Get all tags with their associated bookmark count
	 */
	getAllTags(): TagWithCount[] {
		const rows = this.db
			.prepare(
				`SELECT t.id, t.name, t.color, t.created_at, t.updated_at, COUNT(bt.bookmark_id) as count
				 FROM tags t
				 LEFT JOIN bookmark_tags bt ON t.id = bt.tag_id
				 GROUP BY t.id
				 ORDER BY count DESC, t.name ASC`,
			)
			.all() as Array<{
			id: number;
			name: string;
			color: string;
			created_at: string;
			updated_at: string;
			count: number;
		}>;

		return rows.map((r) => ({
			id: r.id,
			name: r.name,
			color: r.color || "",
			createdAt: r.created_at,
			updatedAt: r.updated_at,
			count: Number(r.count || 0),
		}));
	}

	/**
	 * Add tags to bookmarks in single-transaction batch mode
	 */
	addTagsToBookmarks(params: {
		bookmarkIds?: string[] | null;
		itemNamesOrUrls?: string[] | null;
		tags?: string[] | null;
		plans?: AddTagsPlanItem[] | null;
	}): AddTagsResult {
		const now = new Date().toISOString();
		const todayDateStr = now.split("T")[0];

		// Normalize plans
		const effectivePlans: AddTagsPlanItem[] = [];
		if (Array.isArray(params.plans) && params.plans.length > 0) {
			for (const plan of params.plans) {
				if (plan && Array.isArray(plan.tags) && plan.tags.length > 0) {
					effectivePlans.push(plan);
				}
			}
		}

		// Fallback or single plan
		const singleTags = Array.isArray(params.tags)
			? params.tags.filter(Boolean)
			: [];
		if (
			singleTags.length > 0 &&
			((params.bookmarkIds && params.bookmarkIds.length > 0) ||
				(params.itemNamesOrUrls && params.itemNamesOrUrls.length > 0))
		) {
			effectivePlans.push({
				bookmarkIds: params.bookmarkIds,
				itemNamesOrUrls: params.itemNamesOrUrls,
				tags: singleTags,
			});
		}

		const insertTagStmt = this.db.prepare(
			"INSERT OR IGNORE INTO tags (name, color, created_at, updated_at) VALUES (?, '', ?, ?)",
		);
		const getTagStmt = this.db.prepare(
			"SELECT id, name FROM tags WHERE name = ?",
		);
		const insertRelStmt = this.db.prepare(
			"INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id, created_at) VALUES (?, ?, ?)",
		);
		const updateBookmarkTagsStmt = this.db.prepare(
			"UPDATE bookmarks SET tags = ?, updated_at = ? WHERE id = ?",
		);

		const createdTagsSet = new Set<string>();
		const skippedKeywords: string[] = [];
		const affectedBookmarksMap = new Map<string, AffectedBookmarkInfo>();

		const tx = this.db.transaction(() => {
			for (const plan of effectivePlans) {
				const planTags = (plan.tags || []).map((t) => t.trim()).filter(Boolean);
				if (planTags.length === 0) continue;

				// 1. Ensure tags exist in tags table
				const planTagRecords: Array<{ id: number; name: string }> = [];
				for (const tagName of planTags) {
					const res = insertTagStmt.run(tagName, now, now);
					if (res.changes > 0) {
						createdTagsSet.add(tagName);
					}
					const tagRow = getTagStmt.get(tagName) as
						| { id: number; name: string }
						| undefined;
					if (tagRow) {
						planTagRecords.push(tagRow);
					}
				}

				// 2. Identify target bookmarks
				const matchedBookmarksMap = new Map<
					string,
					{ id: string; title: string; url?: string; currentTags: string[] }
				>();

				// Match by exact bookmarkIds
				if (Array.isArray(plan.bookmarkIds)) {
					for (const rawId of plan.bookmarkIds) {
						if (!rawId) continue;
						const id = String(rawId).trim();
						const row = this.db
							.prepare(
								"SELECT id, title, url, tags FROM bookmarks WHERE id = ?",
							)
							.get(id) as
							| { id: string; title: string; url: string; tags: string }
							| undefined;
						if (row) {
							matchedBookmarksMap.set(row.id, {
								id: row.id,
								title: row.title,
								url: row.url,
								currentTags: this.parseTags(row.tags),
							});
						} else {
							skippedKeywords.push(`ID:${id}`);
						}
					}
				}

				// Match by title or url fuzzy keywords
				if (Array.isArray(plan.itemNamesOrUrls)) {
					for (const rawKw of plan.itemNamesOrUrls) {
						if (!rawKw) continue;
						const kw = String(rawKw).trim();
						if (!kw) continue;
						const likeParam = `%${kw}%`;
						const rows = this.db
							.prepare(
								"SELECT id, title, url, tags FROM bookmarks WHERE title LIKE ? OR url LIKE ?",
							)
							.all(likeParam, likeParam) as Array<{
							id: string;
							title: string;
							url: string;
							tags: string;
						}>;

						if (rows.length > 0) {
							for (const row of rows) {
								if (!matchedBookmarksMap.has(row.id)) {
									matchedBookmarksMap.set(row.id, {
										id: row.id,
										title: row.title,
										url: row.url,
										currentTags: this.parseTags(row.tags),
									});
								}
							}
						} else {
							skippedKeywords.push(kw);
						}
					}
				}

				// 3. Associate tags with bookmarks
				for (const bm of matchedBookmarksMap.values()) {
					for (const t of planTagRecords) {
						insertRelStmt.run(bm.id, t.id, now);
					}

					// Update bookmarks.tags JSON array for fast querying and backward compatibility
					const existingSet = new Set(bm.currentTags);
					for (const t of planTagRecords) {
						existingSet.add(t.name);
					}
					const mergedTags = Array.from(existingSet);
					updateBookmarkTagsStmt.run(
						JSON.stringify(mergedTags),
						todayDateStr,
						bm.id,
					);

					// Store in affected map
					const existingAffected = affectedBookmarksMap.get(bm.id);
					if (existingAffected) {
						const unionTags = Array.from(
							new Set([...existingAffected.tags, ...mergedTags]),
						);
						existingAffected.tags = unionTags;
					} else {
						affectedBookmarksMap.set(bm.id, {
							id: bm.id,
							title: bm.title,
							url: bm.url,
							tags: mergedTags,
						});
					}
				}
			}
		});

		tx();

		return {
			createdTags: Array.from(createdTagsSet),
			affectedBookmarks: Array.from(affectedBookmarksMap.values()),
			skipped: Array.from(new Set(skippedKeywords)),
		};
	}

	/**
	 * Remove tags from specific bookmarks or globally from the entire database
	 */
	removeTags(params: {
		bookmarkIds?: string[] | null;
		tags: string[];
		deleteGlobal?: boolean | null;
	}): RemoveTagsResult {
		const targetTags = (params.tags || []).map((t) => t.trim()).filter(Boolean);
		if (targetTags.length === 0) {
			return {
				removedTags: [],
				affectedBookmarks: [],
				deletedGlobal: false,
			};
		}

		const isGlobal = Boolean(params.deleteGlobal);
		const targetTagSet = new Set(targetTags);
		const affectedBookmarks: Array<{
			id: string;
			title: string;
			tags: string[];
		}> = [];
		const todayDateStr = new Date().toISOString().split("T")[0];

		const updateBookmarkTagsStmt = this.db.prepare(
			"UPDATE bookmarks SET tags = ?, updated_at = ? WHERE id = ?",
		);

		const tx = this.db.transaction(() => {
			// Find tag ids for requested tag names
			const placeholders = targetTags.map(() => "?").join(",");
			const tagRows = this.db
				.prepare(`SELECT id, name FROM tags WHERE name IN (${placeholders})`)
				.all(...targetTags) as Array<{ id: number; name: string }>;

			if (tagRows.length === 0) return;
			const tagIds = tagRows.map((r) => r.id);
			const tagIdPlaceholders = tagIds.map(() => "?").join(",");

			if (isGlobal) {
				// Mode 2: Global deletion
				// Find all bookmarks that currently have any of these tags
				const bookmarksWithTags = this.db
					.prepare(
						`SELECT DISTINCT b.id, b.title, b.tags
						 FROM bookmarks b
						 JOIN bookmark_tags bt ON b.id = bt.bookmark_id
						 WHERE bt.tag_id IN (${tagIdPlaceholders})`,
					)
					.all(...tagIds) as Array<{ id: string; title: string; tags: string }>;

				// Delete relations
				this.db
					.prepare(
						`DELETE FROM bookmark_tags WHERE tag_id IN (${tagIdPlaceholders})`,
					)
					.run(...tagIds);

				// Delete tags from tags table
				this.db
					.prepare(`DELETE FROM tags WHERE id IN (${tagIdPlaceholders})`)
					.run(...tagIds);

				// Sync bookmarks.tags JSON
				for (const bm of bookmarksWithTags) {
					const current = this.parseTags(bm.tags);
					const filtered = current.filter((t) => !targetTagSet.has(t));
					updateBookmarkTagsStmt.run(
						JSON.stringify(filtered),
						todayDateStr,
						bm.id,
					);
					affectedBookmarks.push({
						id: bm.id,
						title: bm.title,
						tags: filtered,
					});
				}
			} else {
				// Mode 1: Remove from specified bookmarks
				const bookmarkIds = (params.bookmarkIds || [])
					.map((id) => String(id).trim())
					.filter(Boolean);
				if (bookmarkIds.length === 0) return;

				const bmPlaceholders = bookmarkIds.map(() => "?").join(",");
				const bmRows = this.db
					.prepare(
						`SELECT id, title, tags FROM bookmarks WHERE id IN (${bmPlaceholders})`,
					)
					.all(...bookmarkIds) as Array<{
					id: string;
					title: string;
					tags: string;
				}>;

				for (const bm of bmRows) {
					// Delete from bookmark_tags
					this.db
						.prepare(
							`DELETE FROM bookmark_tags WHERE bookmark_id = ? AND tag_id IN (${tagIdPlaceholders})`,
						)
						.run(bm.id, ...tagIds);

					// Sync bookmarks.tags JSON
					const current = this.parseTags(bm.tags);
					const filtered = current.filter((t) => !targetTagSet.has(t));
					updateBookmarkTagsStmt.run(
						JSON.stringify(filtered),
						todayDateStr,
						bm.id,
					);
					affectedBookmarks.push({
						id: bm.id,
						title: bm.title,
						tags: filtered,
					});
				}
			}
		});

		tx();

		return {
			removedTags: targetTags,
			affectedBookmarks,
			deletedGlobal: isGlobal,
		};
	}

	/**
	 * Rename or merge multiple source tags into a single target tag
	 */
	renameOrMergeTags(
		sourceTags: string[],
		targetTag: string,
	): RenameOrMergeTagsResult {
		const targetTrimmed = (targetTag || "").trim();
		const sources = (sourceTags || [])
			.map((t) => t.trim())
			.filter((t) => Boolean(t) && t !== targetTrimmed);

		if (!targetTrimmed || sources.length === 0) {
			return {
				mergedFrom: sources,
				targetTag: targetTrimmed,
				affectedBookmarksCount: 0,
				affectedBookmarks: [],
			};
		}

		const now = new Date().toISOString();
		const todayDateStr = now.split("T")[0];
		const affectedBookmarks: Array<{
			id: string;
			title: string;
			tags: string[];
		}> = [];

		const tx = this.db.transaction(() => {
			// 1. Ensure target tag exists
			this.db
				.prepare(
					"INSERT OR IGNORE INTO tags (name, color, created_at, updated_at) VALUES (?, '', ?, ?)",
				)
				.run(targetTrimmed, now, now);

			const targetRow = this.db
				.prepare("SELECT id FROM tags WHERE name = ?")
				.get(targetTrimmed) as { id: number };
			const targetTagId = targetRow.id;

			// 2. Find source tag records
			const srcPlaceholders = sources.map(() => "?").join(",");
			const srcRows = this.db
				.prepare(`SELECT id, name FROM tags WHERE name IN (${srcPlaceholders})`)
				.all(...sources) as Array<{ id: number; name: string }>;

			if (srcRows.length === 0) return;
			const sourceTagIds = srcRows.map((r) => r.id);
			const sourceIdPlaceholders = sourceTagIds.map(() => "?").join(",");
			const sourceNameSet = new Set(srcRows.map((r) => r.name));

			// 3. Find all bookmarks linked to any source tag
			const linkedBookmarks = this.db
				.prepare(
					`SELECT DISTINCT b.id, b.title, b.tags
					 FROM bookmarks b
					 JOIN bookmark_tags bt ON b.id = bt.bookmark_id
					 WHERE bt.tag_id IN (${sourceIdPlaceholders})`,
				)
				.all(...sourceTagIds) as Array<{
				id: string;
				title: string;
				tags: string;
			}>;

			const insertRelStmt = this.db.prepare(
				"INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id, created_at) VALUES (?, ?, ?)",
			);
			const updateBookmarkTagsStmt = this.db.prepare(
				"UPDATE bookmarks SET tags = ?, updated_at = ? WHERE id = ?",
			);

			// 4. Link bookmarks to target tag
			for (const bm of linkedBookmarks) {
				insertRelStmt.run(bm.id, targetTagId, now);

				// Update bookmarks.tags JSON array: replace source tags with target tag, deduplicate
				const currentTags = this.parseTags(bm.tags);
				const updatedTagsSet = new Set<string>();
				for (const t of currentTags) {
					if (sourceNameSet.has(t)) {
						updatedTagsSet.add(targetTrimmed);
					} else {
						updatedTagsSet.add(t);
					}
				}
				updatedTagsSet.add(targetTrimmed);
				const updatedTags = Array.from(updatedTagsSet);

				updateBookmarkTagsStmt.run(
					JSON.stringify(updatedTags),
					todayDateStr,
					bm.id,
				);
				affectedBookmarks.push({
					id: bm.id,
					title: bm.title,
					tags: updatedTags,
				});
			}

			// 5. Delete source tags relationships
			this.db
				.prepare(
					`DELETE FROM bookmark_tags WHERE tag_id IN (${sourceIdPlaceholders})`,
				)
				.run(...sourceTagIds);

			// 6. Delete source tags from tags table
			this.db
				.prepare(`DELETE FROM tags WHERE id IN (${sourceIdPlaceholders})`)
				.run(...sourceTagIds);
		});

		tx();

		return {
			mergedFrom: sources,
			targetTag: targetTrimmed,
			affectedBookmarksCount: affectedBookmarks.length,
			affectedBookmarks,
		};
	}

	/**
	 * Helper: safely parse JSON string into string array
	 */
	private parseTags(tagsJson: string | null | undefined): string[] {
		if (!tagsJson) return [];
		try {
			const parsed = JSON.parse(tagsJson);
			return Array.isArray(parsed)
				? parsed.filter((t): t is string => typeof t === "string")
				: [];
		} catch {
			return [];
		}
	}
}
