import { randomUUID } from "node:crypto";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { writeTextAtomicSync } from "../fs/fsSafety.ts";

export type DraftStatus = "pending" | "archived" | "expired";

export interface DraftArchivedTarget {
	kind: "document" | "note";
	ref: string;
}

export interface DraftMetadata {
	id: string;
	title: string;
	wordCount: number;
	createdAt: string;
	updatedAt: string;
	sessionId?: string;
	status: DraftStatus;
	archivedTo?: DraftArchivedTarget;
}

export interface DraftItem extends DraftMetadata {
	content: string;
	rawContent: string;
	filePath: string;
}

export interface CreateDraftInput {
	title: string;
	content: string;
	sessionId?: string;
}

export interface DraftStoreOptions {
	baseDir?: string;
	trashDir?: string;
	now?: () => Date;
	maxAgeDays?: number;
}

export const DEFAULT_DRAFT_DIR = join(homedir(), ".aiworkstation", "drafts");
export const DEFAULT_TRASH_DIR = join(homedir(), ".aiworkstation", ".trash");
const INDEX_FILENAME = "index.json";

/**
 * Parses markdown text to separate YAML frontmatter from article body
 */
export function parseDraftMarkdown(raw: string): { title?: string; body: string } {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (match) {
		const yaml = match[1];
		const body = match[2].trimStart();
		const titleMatch = yaml.match(/^title:\s*(.*)$/m);
		let title: string | undefined;
		if (titleMatch) {
			title = titleMatch[1].trim().replace(/^["'](.*)["']$/, "$1");
		}
		return { title, body };
	}
	return { body: raw };
}

/**
 * Formats draft markdown with YAML frontmatter containing the title
 */
export function formatDraftMarkdown(title: string, body: string): string {
	const { body: cleanBody } = parseDraftMarkdown(body);
	return `---\ntitle: ${JSON.stringify(title)}\n---\n\n${cleanBody}`;
}

/**
 * Moves a file safely into the trash directory, handling cross-filesystem moves
 */
export function moveFileToTrash(
	filePath: string,
	trashDir = DEFAULT_TRASH_DIR,
): string | null {
	if (!existsSync(filePath)) return null;
	mkdirSync(trashDir, { recursive: true });

	const stamp = new Date()
		.toISOString()
		.replace(/[:.]/g, "-")
		.replace("T", "_")
		.slice(0, 19);

	let trashPath = join(trashDir, `${stamp}_${basename(filePath)}`);
	if (existsSync(trashPath)) {
		trashPath = join(
			trashDir,
			`${stamp}_${randomUUID().slice(0, 8)}_${basename(filePath)}`,
		);
	}

	try {
		renameSync(filePath, trashPath);
	} catch (err: unknown) {
		if ((err as { code?: string })?.code === "EXDEV") {
			cpSync(filePath, trashPath, { recursive: true });
			rmSync(filePath, { force: true });
		} else {
			throw err;
		}
	}
	return trashPath;
}

/**
 * Reads metadata list from index.json
 */
export function readDraftIndex(baseDir = DEFAULT_DRAFT_DIR): DraftMetadata[] {
	const indexPath = join(baseDir, INDEX_FILENAME);
	if (!existsSync(indexPath)) {
		return [];
	}
	try {
		const content = readFileSync(indexPath, "utf-8");
		const data = JSON.parse(content);
		if (Array.isArray(data)) {
			return data;
		}
		if (data && Array.isArray(data.drafts)) {
			return data.drafts;
		}
		return [];
	} catch (error) {
		console.warn("[draftStore] Failed to read index.json, resetting to empty:", error);
		return [];
	}
}

/**
 * Writes metadata list atomically to index.json
 */
export function writeDraftIndex(
	baseDir: string,
	items: DraftMetadata[],
): void {
	const indexPath = join(baseDir, INDEX_FILENAME);
	writeTextAtomicSync(indexPath, JSON.stringify(items, null, 2));
}

/**
 * Creates a new draft, persists the markdown file and registers metadata in index.json
 */
export function createDraft(
	input: CreateDraftInput,
	options?: DraftStoreOptions,
): DraftItem {
	const baseDir = options?.baseDir ?? DEFAULT_DRAFT_DIR;
	if (!existsSync(baseDir)) {
		mkdirSync(baseDir, { recursive: true });
	}

	const id = randomUUID();
	const title = input.title.trim() || "未命名草稿";
	const { body: cleanBody } = parseDraftMarkdown(input.content);
	const rawContent = formatDraftMarkdown(title, cleanBody);
	const filePath = join(baseDir, `${id}.md`);

	writeTextAtomicSync(filePath, rawContent);

	const now = options?.now ? options.now() : new Date();
	const nowIso = now.toISOString();

	const metadata: DraftMetadata = {
		id,
		title,
		wordCount: cleanBody.length,
		createdAt: nowIso,
		updatedAt: nowIso,
		sessionId: input.sessionId,
		status: "pending",
	};

	const index = readDraftIndex(baseDir);
	index.unshift(metadata);
	writeDraftIndex(baseDir, index);

	return {
		...metadata,
		content: cleanBody,
		rawContent,
		filePath,
	};
}

/**
 * Retrieves a draft by ID. If the file is missing or expired, reflects that in status.
 */
export function getDraft(
	id: string,
	options?: DraftStoreOptions,
): DraftItem | null {
	const baseDir = options?.baseDir ?? DEFAULT_DRAFT_DIR;
	const index = readDraftIndex(baseDir);
	const metadata = index.find((item) => item.id === id);
	if (!metadata) {
		return null;
	}

	const filePath = join(baseDir, `${id}.md`);
	if (!existsSync(filePath)) {
		return {
			...metadata,
			status: metadata.status === "archived" ? "archived" : "expired",
			content: "",
			rawContent: "",
			filePath,
		};
	}

	try {
		const rawContent = readFileSync(filePath, "utf-8");
		const { body } = parseDraftMarkdown(rawContent);
		return {
			...metadata,
			content: body,
			rawContent,
			filePath,
		};
	} catch (err) {
		console.warn(`[draftStore] Failed to read draft file ${filePath}:`, err);
		return {
			...metadata,
			status: "expired",
			content: "",
			rawContent: "",
			filePath,
		};
	}
}

/**
 * Lists all draft records in descending order of creation time
 */
export function listDrafts(options?: DraftStoreOptions): DraftMetadata[] {
	const baseDir = options?.baseDir ?? DEFAULT_DRAFT_DIR;
	return readDraftIndex(baseDir);
}

/**
 * Overwrites draft content, refreshes word count and updatedAt timestamp
 */
export function updateDraftContent(
	id: string,
	content: string,
	options?: DraftStoreOptions,
): DraftItem {
	const baseDir = options?.baseDir ?? DEFAULT_DRAFT_DIR;
	const index = readDraftIndex(baseDir);
	const targetIndex = index.findIndex((item) => item.id === id);
	if (targetIndex === -1) {
		throw new Error(`Draft not found: ${id}`);
	}

	const existing = index[targetIndex];
	const { body: cleanBody } = parseDraftMarkdown(content);
	const rawContent = formatDraftMarkdown(existing.title, cleanBody);
	const filePath = join(baseDir, `${id}.md`);

	writeTextAtomicSync(filePath, rawContent);

	const now = options?.now ? options.now() : new Date();
	const nowIso = now.toISOString();

	const updatedMetadata: DraftMetadata = {
		...existing,
		wordCount: cleanBody.length,
		updatedAt: nowIso,
	};

	index[targetIndex] = updatedMetadata;
	writeDraftIndex(baseDir, index);

	return {
		...updatedMetadata,
		content: cleanBody,
		rawContent,
		filePath,
	};
}

/**
 * Marks a draft as archived to a persistent destination (document or note)
 */
export function markArchived(
	id: string,
	target: DraftArchivedTarget,
	options?: DraftStoreOptions,
): DraftMetadata {
	const baseDir = options?.baseDir ?? DEFAULT_DRAFT_DIR;
	const index = readDraftIndex(baseDir);
	const targetIndex = index.findIndex((item) => item.id === id);
	if (targetIndex === -1) {
		throw new Error(`Draft not found: ${id}`);
	}

	const now = options?.now ? options.now() : new Date();
	const updated: DraftMetadata = {
		...index[targetIndex],
		status: "archived",
		archivedTo: target,
		updatedAt: now.toISOString(),
	};

	index[targetIndex] = updated;
	writeDraftIndex(baseDir, index);
	return updated;
}

/**
 * Deletes a draft: moves its .md file to trash and marks index entry as expired
 */
export function deleteDraft(
	id: string,
	options?: DraftStoreOptions,
): boolean {
	const baseDir = options?.baseDir ?? DEFAULT_DRAFT_DIR;
	const trashDir = options?.trashDir ?? DEFAULT_TRASH_DIR;
	const index = readDraftIndex(baseDir);
	const targetIndex = index.findIndex((item) => item.id === id);
	if (targetIndex === -1) {
		return false;
	}

	const filePath = join(baseDir, `${id}.md`);
	moveFileToTrash(filePath, trashDir);

	const now = options?.now ? options.now() : new Date();
	index[targetIndex] = {
		...index[targetIndex],
		status: "expired",
		updatedAt: now.toISOString(),
	};
	writeDraftIndex(baseDir, index);
	return true;
}

export interface SweepResult {
	sweptPending: number;
	deletedArchivedFiles: number;
	expiredIds: string[];
}

/**
 * Sweep drafts:
 * 1. Move pending drafts older than maxAgeDays (default 7) to trash and mark as expired
 * 2. Delete files of archived drafts immediately from draft directory
 */
export function sweepDrafts(options?: DraftStoreOptions): SweepResult {
	const baseDir = options?.baseDir ?? DEFAULT_DRAFT_DIR;
	const trashDir = options?.trashDir ?? DEFAULT_TRASH_DIR;
	const maxAgeDays = options?.maxAgeDays ?? 7;
	const now = options?.now ? options.now() : new Date();
	const currentTime = now.getTime();
	const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

	const index = readDraftIndex(baseDir);
	let sweptPending = 0;
	let deletedArchivedFiles = 0;
	const expiredIds: string[] = [];

	let indexChanged = false;

	for (let i = 0; i < index.length; i++) {
		const item = index[i];
		const filePath = join(baseDir, `${item.id}.md`);

		if (item.status === "archived") {
			if (existsSync(filePath)) {
				try {
					rmSync(filePath, { force: true });
					deletedArchivedFiles++;
				} catch (err) {
					console.warn(`[draftStore] Failed to remove archived draft file ${filePath}:`, err);
				}
			}
		} else if (item.status === "pending") {
			const itemTime = new Date(item.updatedAt || item.createdAt).getTime();
			if (currentTime - itemTime >= maxAgeMs) {
				moveFileToTrash(filePath, trashDir);
				index[i] = {
					...item,
					status: "expired",
					updatedAt: now.toISOString(),
				};
				sweptPending++;
				expiredIds.push(item.id);
				indexChanged = true;
			}
		}
	}

	if (indexChanged) {
		writeDraftIndex(baseDir, index);
	}

	return {
		sweptPending,
		deletedArchivedFiles,
		expiredIds,
	};
}

let hasSweepRun = false;

/**
 * Run startup draft sweep once per application boot
 */
export function runStartupDraftSweep(): void {
	if (hasSweepRun) return;
	hasSweepRun = true;
	try {
		sweepDrafts();
	} catch (err) {
		console.error("[draftStore] Startup sweep failed:", err);
	}
}

/**
 * Synchronizes draft index metadata (word count and updatedAt) when a draft file is patched/edited directly
 */
export function syncDraftFileToIndex(
	filePath: string,
	baseDir = DEFAULT_DRAFT_DIR,
): void {
	if (!filePath.startsWith(baseDir)) return;
	const fileName = basename(filePath);
	if (!fileName.endsWith(".md")) return;
	const id = fileName.slice(0, -3);

	const index = readDraftIndex(baseDir);
	const targetIndex = index.findIndex((item) => item.id === id);
	if (targetIndex === -1) return;

	try {
		const raw = readFileSync(filePath, "utf-8");
		const { body } = parseDraftMarkdown(raw);
		index[targetIndex] = {
			...index[targetIndex],
			wordCount: body.length,
			updatedAt: new Date().toISOString(),
		};
		writeDraftIndex(baseDir, index);
	} catch (err) {
		console.warn("[draftStore] Failed to sync draft index on direct file edit:", err);
	}
}
