import type {
	AIClassificationResult,
	BookmarkTDKItem,
	Folder,
	WorkbenchItem,
} from "../../components/workbench/types.ts";
import { getDb } from "./connection.ts";
import { BookmarkRepository } from "./repositories/bookmark.repo.ts";
import { FolderRepository } from "./repositories/folder.repo.ts";
import { SearchRepository } from "./repositories/search.repo.ts";
import type {
	BookmarkQueryParams,
	EmbeddingStats,
	NeedingEmbeddingBookmark,
	SearchBookmarkItem,
} from "./types.ts";

/**
 * SQLite Database Facade for AI Workstation
 * Composes domain repositories (Folder, Bookmark, Search/Embedding)
 */
export class WorkbenchDatabase {
	private folderRepo: FolderRepository;
	private bookmarkRepo: BookmarkRepository;
	private searchRepo: SearchRepository;

	constructor() {
		const db = getDb();
		this.folderRepo = new FolderRepository(db);
		this.bookmarkRepo = new BookmarkRepository(db);
		this.searchRepo = new SearchRepository(db);
	}

	// ================= Folder Operations =================
	getAllFolders(): Folder[] {
		return this.folderRepo.getAllFolders();
	}

	createFolder(
		name: string,
		category: string,
		desc: string,
		color?: string,
	): Folder {
		return this.folderRepo.createFolder(name, category, desc, color);
	}

	updateFolder(
		id: number,
		name: string,
		category: string,
		desc: string,
		color?: string,
	): void {
		this.folderRepo.updateFolder(id, name, category, desc, color);
	}

	deleteFolder(id: number): void {
		this.folderRepo.deleteFolder(id);
	}

	getFolderParentId(id: number): number | null {
		return this.folderRepo.getFolderParentId(id);
	}

	moveFolder(id: number, targetParentId: number | null): void {
		this.folderRepo.moveFolder(id, targetParentId);
	}

	reorderFolders(orderedIds: number[]): void {
		this.folderRepo.reorderFolders(orderedIds);
	}

	// ================= Bookmark Operations =================
	getUnclassifiedItems(): WorkbenchItem[] {
		return this.bookmarkRepo.getUnclassifiedItems();
	}

	insertBookmarksBatch(items: BookmarkTDKItem[]): number {
		return this.bookmarkRepo.insertBookmarksBatch(items);
	}

	insertLinkIntoFolder(
		folderId: number,
		item: { url: string; title: string; description?: string },
	): string {
		return this.bookmarkRepo.insertLinkIntoFolder(folderId, item);
	}

	applyAIClassification(results: AIClassificationResult[]): void {
		this.bookmarkRepo.applyAIClassification(results);
	}

	moveItem(
		itemId: string,
		sourceFolderId: number | null,
		targetFolderId: number | null,
	): void {
		this.bookmarkRepo.moveItem(itemId, sourceFolderId, targetFolderId);
	}

	deleteItem(itemId: string, folderId: number | null): void {
		this.bookmarkRepo.deleteItem(itemId, folderId);
	}

	getAllUrls(): Array<{ id: string; url: string; title: string }> {
		return this.bookmarkRepo.getAllUrls();
	}

	deleteItems(ids: string[]): number {
		return this.bookmarkRepo.deleteItems(ids);
	}

	clearAll(): void {
		this.bookmarkRepo.clearAll();
	}

	// ================= Embedding & Search Operations =================
	getEmbeddingStats(): EmbeddingStats {
		return this.searchRepo.getEmbeddingStats();
	}

	getBookmarksNeedingEmbedding(
		limit = 50,
		forceAll = false,
	): NeedingEmbeddingBookmark[] {
		return this.searchRepo.getBookmarksNeedingEmbedding(limit, forceAll);
	}

	updateBookmarkEmbedding(
		id: string,
		embedding: number[],
		embeddingText: string,
	): void {
		this.searchRepo.updateBookmarkEmbedding(id, embedding, embeddingText);
	}

	getAllBookmarksForSearch(): SearchBookmarkItem[] {
		return this.searchRepo.getAllBookmarksForSearch();
	}

	queryBookmarks(params: BookmarkQueryParams = {}): WorkbenchItem[] {
		return this.searchRepo.queryBookmarks(params);
	}
}

// Re-export query types for backward compatibility
export type {
	BookmarkQueryParams,
	EmbeddingStats,
	NeedingEmbeddingBookmark,
	SearchBookmarkItem,
};

// Singleton database instance
export const workbenchDb = new WorkbenchDatabase();
