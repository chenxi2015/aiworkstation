import type {
	BinaryFiles,
	LibraryItem,
	LibraryItems,
} from "@excalidraw/excalidraw/types";
import {
	getItemBounds,
	type LibraryElement,
} from "../../shared/excalidraw/libraryItem.ts";
import { getDb } from "../db/connection.ts";

/**
 * Personal Excalidraw library access for UI and AI tools.
 *
 * Items come from `excalidraw_library_items` — the user's own curated library,
 * decoupled from the public catalog (`excalidrawCatalog.json` + cache).
 * Referenced image dataURLs live in `excalidraw_library_files`.
 */

export interface PersonalLibraryItem {
	/** LibraryItem.id — stable handle for insertion */
	id: string;
	name?: string;
	elements: LibraryElement[];
}

interface ItemRow {
	id: string;
	name: string;
	payload: string;
}

const LEGACY_LIBRARY_KEY = "excalidrawPersonalLibrary";
const LEGACY_FILES_KEY = "excalidrawPersonalLibraryFiles";

let isMigrationDone = false;

function isLibraryItem(value: unknown): value is LibraryItem {
	return (
		typeof value === "object" &&
		value !== null &&
		Array.isArray((value as { elements?: unknown }).elements) &&
		typeof (value as { id?: unknown }).id === "string"
	);
}

function isBinaryFiles(value: unknown): value is BinaryFiles {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Migrate legacy monolithic setting KV blobs into row tables if needed.
 */
function migrateLegacyKvIfNeeded(): void {
	const db = getDb();
	const settingRow = db
		.prepare("SELECT value FROM settings WHERE key = ?")
		.get(LEGACY_LIBRARY_KEY) as { value: string } | undefined;
	const rawItems = settingRow?.value;

	if (rawItems) {
		try {
			const items = JSON.parse(rawItems);
			if (Array.isArray(items)) {
				const valid = items.filter(isLibraryItem);
				const now = new Date().toISOString();
				const insert = db.prepare(
					`INSERT OR IGNORE INTO excalidraw_library_items
					 (id, name, status, created, sort_order, updated_at, payload)
					 VALUES (?, ?, ?, ?, ?, ?, ?)`,
				);
				valid.forEach((item, index) => {
					insert.run(
						item.id,
						item.name ?? "",
						item.status ?? "unpublished",
						item.created ?? 0,
						index,
						now,
						JSON.stringify(item),
					);
				});
				console.log(
					`[personalLibrary] Migrated ${valid.length} items from legacy settings KV`,
				);
			}
		} catch (err) {
			console.warn("[personalLibrary] legacy items migration failed:", err);
		}
		db.prepare("DELETE FROM settings WHERE key = ?").run(LEGACY_LIBRARY_KEY);
	}

	const filesRow = db
		.prepare("SELECT value FROM settings WHERE key = ?")
		.get(LEGACY_FILES_KEY) as { value: string } | undefined;
	const rawFiles = filesRow?.value;

	if (rawFiles) {
		try {
			const files = JSON.parse(rawFiles);
			if (isBinaryFiles(files)) {
				const now = new Date().toISOString();
				const insert = db.prepare(
					`INSERT OR IGNORE INTO excalidraw_library_files
					 (file_id, mime_type, updated_at, payload) VALUES (?, ?, ?, ?)`,
				);
				for (const [fileId, file] of Object.entries(files)) {
					if (typeof file === "object" && file !== null) {
						insert.run(
							fileId,
							(file as { mimeType?: string }).mimeType ?? "",
							now,
							JSON.stringify(file),
						);
					}
				}
			}
		} catch (err) {
			console.warn("[personalLibrary] legacy files migration failed:", err);
		}
		db.prepare("DELETE FROM settings WHERE key = ?").run(LEGACY_FILES_KEY);
	}
}

/**
 * Lazy guard so legacy migration runs before any read or write.
 */
function ensureMigrated(): void {
	if (isMigrationDone) return;
	migrateLegacyKvIfNeeded();
	isMigrationDone = true;
}

function parseItemRows(rows: ItemRow[]): PersonalLibraryItem[] {
	const items: PersonalLibraryItem[] = [];
	for (const row of rows) {
		try {
			const parsed = JSON.parse(row.payload) as LibraryItem;
			if (!Array.isArray(parsed.elements) || parsed.elements.length === 0) {
				continue;
			}
			items.push({
				id: row.id,
				name: parsed.name ?? (row.name || undefined),
				elements: parsed.elements as unknown as LibraryElement[],
			});
		} catch {
			// tolerate a corrupted row instead of failing the whole library
		}
	}
	return items;
}

/**
 * Read the entire personal library and associated files for canvas hydration.
 */
export function getPersonalLibraryData(): {
	libraryItems: LibraryItems;
	files: BinaryFiles;
} {
	try {
		ensureMigrated();
		const itemRows = getDb()
			.prepare(
				"SELECT payload FROM excalidraw_library_items ORDER BY sort_order, created",
			)
			.all() as { payload: string }[];
		const fileRows = getDb()
			.prepare("SELECT file_id, payload FROM excalidraw_library_files")
			.all() as { file_id: string; payload: string }[];

		const libraryItems: LibraryItem[] = [];
		for (const row of itemRows) {
			try {
				const parsed = JSON.parse(row.payload);
				if (isLibraryItem(parsed)) libraryItems.push(parsed);
			} catch {
				// skip corrupted row rather than failing the whole library
			}
		}
		const files: Record<string, unknown> = {};
		for (const row of fileRows) {
			try {
				files[row.file_id] = JSON.parse(row.payload);
			} catch {
				// same tolerance for corrupted file rows
			}
		}
		return { libraryItems, files: files as BinaryFiles };
	} catch (err) {
		console.warn("[getPersonalLibraryData] read error:", err);
		return { libraryItems: [], files: {} };
	}
}

/**
 * Persist the personal library with incremental updates via transaction.
 */
export function savePersonalLibraryData(data: {
	libraryItems: LibraryItems;
	files?: BinaryFiles | null;
}): { success: boolean } {
	try {
		ensureMigrated();
		const items = Array.isArray(data.libraryItems)
			? data.libraryItems.filter(isLibraryItem)
			: [];
		const db = getDb();
		const now = new Date().toISOString();

		const upsertItem = db.prepare(
			`INSERT INTO excalidraw_library_items
			 (id, name, status, created, sort_order, updated_at, payload)
			 VALUES (?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET
			   name = excluded.name,
			   status = excluded.status,
			   sort_order = excluded.sort_order,
			   updated_at = excluded.updated_at,
			   payload = excluded.payload`,
		);
		const deleteMissing = db.prepare(
			"DELETE FROM excalidraw_library_items WHERE id = ?",
		);
		const existingIds = new Set(
			(db.prepare("SELECT id FROM excalidraw_library_items").all() as {
				id: string;
			}[]).map((r) => r.id),
		);
		const incomingIds = new Set(items.map((item) => item.id));

		const tx = db.transaction(() => {
			items.forEach((item, index) => {
				upsertItem.run(
					item.id,
					item.name ?? "",
					item.status,
					item.created ?? 0,
					index,
					now,
					JSON.stringify(item),
				);
			});
			for (const id of existingIds) {
				if (!incomingIds.has(id)) deleteMissing.run(id);
			}

			if (data.files && isBinaryFiles(data.files)) {
				const upsertFile = db.prepare(
					`INSERT INTO excalidraw_library_files
					 (file_id, mime_type, updated_at, payload) VALUES (?, ?, ?, ?)
					 ON CONFLICT(file_id) DO UPDATE SET
					   mime_type = excluded.mime_type,
					   updated_at = excluded.updated_at,
					   payload = excluded.payload`,
				);
				const deleteFile = db.prepare(
					"DELETE FROM excalidraw_library_files WHERE file_id = ?",
				);
				const existingFileIds = new Set(
					(
						db
							.prepare("SELECT file_id FROM excalidraw_library_files")
							.all() as { file_id: string }[]
					).map((r) => r.file_id),
				);
				const incomingFileIds = new Set(Object.keys(data.files));
				for (const [fileId, file] of Object.entries(data.files)) {
					if (typeof file === "object" && file !== null) {
						upsertFile.run(
							fileId,
							(file as { mimeType?: string }).mimeType ?? "",
							now,
							JSON.stringify(file),
						);
					}
				}
				for (const fileId of existingFileIds) {
					if (!incomingFileIds.has(fileId)) deleteFile.run(fileId);
				}
			}
		});
		tx();
		return { success: true };
	} catch (err) {
		console.error("[savePersonalLibraryData] write error:", err);
		return { success: false };
	}
}

/** All personal items in the user's arrangement order. */
export function listPersonalLibraryItems(): PersonalLibraryItem[] {
	const rows = getDb()
		.prepare(
			"SELECT id, name, payload FROM excalidraw_library_items ORDER BY sort_order, created",
		)
		.all() as ItemRow[];
	return parseItemRows(rows);
}

/** Rank personal items by token hits in name / element text content. */
export function searchPersonalLibraryItems(
	query: string,
	limit = 10,
): PersonalLibraryItem[] {
	const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
	const all = listPersonalLibraryItems();
	if (tokens.length === 0) return all.slice(0, limit);

	const scored = all.map((item) => {
		const name = (item.name ?? "").toLowerCase();
		const texts = item.elements
			.filter((e) => e.type === "text" && typeof e.text === "string")
			.map((e) => String(e.text).toLowerCase())
			.join(" ");
		const score = tokens.reduce(
			(sum, t) => sum + (name.includes(t) ? 3 : 0) + (texts.includes(t) ? 1 : 0),
			0,
		);
		return { item, score };
	});
	return scored
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map((s) => s.item);
}

/** Single item by id, or null when absent. */
export function getPersonalLibraryItem(id: string): PersonalLibraryItem | null {
	const row = getDb()
		.prepare("SELECT id, name, payload FROM excalidraw_library_items WHERE id = ?")
		.get(id) as ItemRow | undefined;
	if (!row) return null;
	return parseItemRows([row])[0] ?? null;
}

/**
 * Binary file payloads (BinaryFileData-shaped) for the given fileIds,
 * ready to be handed to the canvas' file store.
 */
export function getPersonalLibraryFiles(
	fileIds: string[],
): Record<string, unknown> {
	if (fileIds.length === 0) return {};
	const placeholders = fileIds.map(() => "?").join(",");
	const rows = getDb()
		.prepare(
			`SELECT file_id, payload FROM excalidraw_library_files WHERE file_id IN (${placeholders})`,
		)
		.all(...fileIds) as { file_id: string; payload: string }[];
	const files: Record<string, unknown> = {};
	for (const row of rows) {
		try {
			files[row.file_id] = JSON.parse(row.payload);
		} catch {
			// skip corrupted file rows
		}
	}
	return files;
}

/**
 * One-line description for the model to pick an item by size and text.
 * Same shape as describeItem() in excalidrawLibrary.ts, but keyed by id and
 * without the "含图片(不可用)" caveat — personal images are available.
 */
export function describePersonalItem(item: PersonalLibraryItem): string {
	const b = getItemBounds(item.elements);
	const texts = item.elements
		.filter((e) => e.type === "text" && typeof e.text === "string")
		.map((e) => String(e.text).replace(/\s+/g, " ").slice(0, 16))
		.slice(0, 3);
	const hasImage = item.elements.some((e) => e.fileId);
	return `${item.id}｜${item.name ?? "(未命名)"} · ${item.elements.length} 元素 · ${Math.round(b.width)}x${Math.round(b.height)}${texts.length ? ` · 文字: ${texts.join("/")}` : ""}${hasImage ? " · 含图片" : ""}`;
}
