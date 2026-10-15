import type {
	AIClassificationResult,
	BookmarkTDKItem,
	Folder,
	FolderViewPrefs,
	NotePayload,
	WorkbenchItem,
} from "../../components/workbench/types.ts";
import { closeDb, getDb } from "./connection.ts";
import { BookmarkRepository } from "./repositories/bookmark.repo.ts";
import {
	type ChatSessionRecord,
	ChatSessionRepository,
} from "./repositories/chatSession.repo.ts";
import { CreatorRepository } from "./repositories/creator.repo.ts";
import { DocumentRepository } from "./repositories/document.repo.ts";
import { FolderRepository } from "./repositories/folder.repo.ts";
import { PublishRepository } from "./repositories/publish.repo.ts";
import { SearchRepository } from "./repositories/search.repo.ts";
import {
	type AddTagsPlanItem,
	type AddTagsResult,
	type AffectedBookmarkInfo,
	type RemoveTagsResult,
	type RenameOrMergeTagsResult,
	TagRepository,
	type TagWithCount,
} from "./repositories/tag.repo.ts";
import type {
	BookmarkQueryParams,
	EmbeddingStats,
	NeedingEmbeddingBookmark,
	SearchBookmarkItem,
} from "./types.ts";

/**
 * SQLite Database Facade for AI Workstation
 * Composes domain repositories (Folder, Bookmark, Search/Embedding, ChatSession, Tag)
 */
export class WorkbenchDatabase {
	private folderRepo!: FolderRepository;
	private bookmarkRepo!: BookmarkRepository;
	private searchRepo!: SearchRepository;
	private chatSessionRepo!: ChatSessionRepository;
	private tagRepo!: TagRepository;
	private creatorRepo!: CreatorRepository;
	private documentRepo!: DocumentRepository;
	private publishRepo!: PublishRepository;

	private initRepositories(): void {
		const db = getDb();
		this.folderRepo = new FolderRepository(db);
		this.bookmarkRepo = new BookmarkRepository(db);
		this.searchRepo = new SearchRepository(db);
		this.chatSessionRepo = new ChatSessionRepository(db);
		this.tagRepo = new TagRepository(db);
		this.creatorRepo = new CreatorRepository(db);
		this.documentRepo = new DocumentRepository(db);
		this.publishRepo = new PublishRepository(db);
	}

	constructor() {
		this.initRepositories();
	}

	/**
	 * Rebind domain repositories with the active SQLite database connection
	 */
	reloadConnection(): void {
		closeDb();
		this.initRepositories();
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

	moveFolderToCategory(folderId: number, targetCategory: string): void {
		this.folderRepo.moveFolderToCategory(folderId, targetCategory);
	}

	renameCategory(oldCategory: string, newCategory: string): number {
		return this.folderRepo.renameCategory(oldCategory, newCategory);
	}

	updateFolderViewPrefs(id: number, prefs: FolderViewPrefs): void {
		this.folderRepo.updateFolderViewPrefs(id, prefs);
	}

	saveNote(params: {
		id?: string;
		title: string;
		content: string;
		format?: NotePayload["format"];
		tags?: string[];
		folderId?: number | null;
	}): string {
		return this.bookmarkRepo.saveNote(params);
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

	linkItemToFolder(itemId: string, targetFolderId: number): void {
		this.bookmarkRepo.linkItemToFolder(itemId, targetFolderId);
	}

	assignItemsToFolder(
		targetFolderId: number,
		items: Array<{
			id?: string | number;
			url?: string;
			name?: string;
			title?: string;
			description?: string;
			sourceFolderId?: number | null;
			folderId?: number | null;
		}>,
	): string[] {
		return this.bookmarkRepo.assignItemsToFolder(targetFolderId, items);
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

	clearUnclassified(): number {
		return this.bookmarkRepo.clearUnclassifiedItems();
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

	// ================= Settings Operations =================
	getSetting(key: string): string | null {
		const row = getDb()
			.prepare("SELECT value FROM settings WHERE key = ?")
			.get(key) as { value: string } | undefined;
		return row ? row.value : null;
	}

	setSetting(key: string, value: string): void {
		const now = new Date().toISOString();
		getDb()
			.prepare(
				"INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
			)
			.run(key, value, now);
	}

	// ================= Chat Session Operations =================
	getAllChatSessions<T = any>(): ChatSessionRecord<T>[] {
		return this.chatSessionRepo.getAllSessions<T>();
	}

	getChatSessionById<T = any>(id: string): ChatSessionRecord<T> | null {
		return this.chatSessionRepo.getSessionById<T>(id);
	}

	saveChatSession<T = any>(session: ChatSessionRecord<T>): void {
		this.chatSessionRepo.saveSession<T>(session);
	}

	deleteChatSession(id: string): void {
		this.chatSessionRepo.deleteSession(id);
	}

	clearAllChatSessions(): void {
		this.chatSessionRepo.clearAllSessions();
	}

	exportChatSessionsToJson(): {
		exportedAt: string;
		version: string;
		totalSessions: number;
		sessions: ChatSessionRecord[];
	} {
		return this.chatSessionRepo.exportAllToJson();
	}

	// ================= Tag Operations =================
	createTags(tags: Array<{ name: string; color?: string | null }>): {
		createdTags: string[];
		skipped: string[];
	} {
		return this.tagRepo.createTags(tags);
	}

	getAllTags(): TagWithCount[] {
		return this.tagRepo.getAllTags();
	}

	addTagsToBookmarks(params: {
		bookmarkIds?: string[] | null;
		itemNamesOrUrls?: string[] | null;
		tags?: string[] | null;
		plans?: AddTagsPlanItem[] | null;
	}): AddTagsResult {
		return this.tagRepo.addTagsToBookmarks(params);
	}

	removeTags(params: {
		bookmarkIds?: string[] | null;
		tags: string[];
		deleteGlobal?: boolean | null;
	}): RemoveTagsResult {
		return this.tagRepo.removeTags(params);
	}

	renameOrMergeTags(
		sourceTags: string[],
		targetTag: string,
	): RenameOrMergeTagsResult {
		return this.tagRepo.renameOrMergeTags(sourceTags, targetTag);
	}

	listMaterials(
		statusFilter: Parameters<CreatorRepository["listMaterials"]>[0] = "active",
	) {
		return this.creatorRepo.listMaterials(statusFilter);
	}

	getMaterial(id: number) {
		return this.creatorRepo.getMaterial(id);
	}

	createMaterial(params: Parameters<CreatorRepository["createMaterial"]>[0]) {
		return this.creatorRepo.createMaterial(params);
	}

	updateMaterial(
		id: number,
		patch: Parameters<CreatorRepository["updateMaterial"]>[1],
	) {
		return this.creatorRepo.updateMaterial(id, patch);
	}

	listMaterialFolders() {
		return this.creatorRepo.listMaterialFolders();
	}

	createMaterialFolder(
		params: Parameters<CreatorRepository["createMaterialFolder"]>[0],
	) {
		return this.creatorRepo.createMaterialFolder(params);
	}

	getMaterialFolder(id: number) {
		return this.creatorRepo.getMaterialFolder(id);
	}

	updateMaterialFolder(
		id: number,
		patch: Parameters<CreatorRepository["updateMaterialFolder"]>[1],
	) {
		return this.creatorRepo.updateMaterialFolder(id, patch);
	}

	deleteMaterialFolder(id: number) {
		return this.creatorRepo.deleteMaterialFolder(id);
	}

	deleteMaterial(id: number) {
		return this.creatorRepo.deleteMaterial(id);
	}

	batchDeleteMaterials(ids: number[]) {
		return this.creatorRepo.batchDeleteMaterials(ids);
	}

	getAsset(id: number) {
		return this.creatorRepo.getAsset(id);
	}

	listMediaAssetsPage(
		params: Parameters<CreatorRepository["listMediaAssetsPage"]>[0],
	) {
		return this.creatorRepo.listMediaAssetsPage(params);
	}

	addAsset(params: Parameters<CreatorRepository["addAsset"]>[0]) {
		return this.creatorRepo.addAsset(params);
	}

	updateAssetFile(
		id: number,
		params: Parameters<CreatorRepository["updateAssetFile"]>[1],
	) {
		return this.creatorRepo.updateAssetFile(id, params);
	}

	// ================= Editor (创作) Operations =================
	listDocuments(includeArchived = false) {
		return this.documentRepo.listDocuments(includeArchived);
	}

	listArchivedDocuments() {
		return this.documentRepo.listArchivedDocuments();
	}

	getDocument(id: number) {
		return this.documentRepo.getDocument(id);
	}

	createDocument(params: Parameters<DocumentRepository["createDocument"]>[0]) {
		return this.documentRepo.createDocument(params);
	}

	updateDocument(
		id: number,
		patch: Parameters<DocumentRepository["updateDocument"]>[1],
	) {
		return this.documentRepo.updateDocument(id, patch);
	}

	deleteDocument(id: number) {
		return this.documentRepo.deleteDocument(id);
	}

	moveDocumentToFolder(id: number, folderId: number | null) {
		return this.documentRepo.moveDocumentToFolder(id, folderId);
	}

	setDocumentPinned(id: number, pinned: boolean) {
		return this.documentRepo.setDocumentPinned(id, pinned);
	}

	reorderDocuments(orderedIds: number[]) {
		return this.documentRepo.reorderDocuments(orderedIds);
	}

	listDocumentFolders() {
		return this.documentRepo.listDocumentFolders();
	}

	createDocumentFolder(name: string) {
		return this.documentRepo.createDocumentFolder(name);
	}

	renameDocumentFolder(id: number, name: string) {
		return this.documentRepo.renameDocumentFolder(id, name);
	}

	deleteDocumentFolder(id: number) {
		return this.documentRepo.deleteDocumentFolder(id);
	}

	reorderDocumentFolders(orderedIds: number[]) {
		return this.documentRepo.reorderDocumentFolders(orderedIds);
	}

	createDocumentVersion(
		params: Parameters<DocumentRepository["createVersion"]>[0],
	) {
		return this.documentRepo.createVersion(params);
	}

	listDocumentVersions(documentId: number) {
		return this.documentRepo.listVersions(documentId);
	}

	getDocumentPublishDraft(documentId: number) {
		return this.documentRepo.getPublishDraft(documentId);
	}

	saveDocumentPublishDraft(documentId: number, draftJson: string) {
		return this.documentRepo.savePublishDraft(documentId, draftJson);
	}

	// ================= Publish (平台发布) Operations =================
	listPlatformAccounts() {
		return this.publishRepo.listAccounts();
	}

	getPlatformAccount(id: number) {
		return this.publishRepo.getAccount(id);
	}

	upsertPlatformAccount(
		params: Parameters<PublishRepository["upsertAccount"]>[0],
	) {
		return this.publishRepo.upsertAccount(params);
	}

	markPlatformAccountStatus(
		id: number,
		status: Parameters<PublishRepository["markAccountStatus"]>[1],
		meta?: Record<string, unknown>,
	) {
		return this.publishRepo.markAccountStatus(id, status, meta);
	}

	deletePlatformAccount(id: number) {
		return this.publishRepo.deleteAccount(id);
	}

	createPublishRecord(
		params: Parameters<PublishRepository["createRecord"]>[0],
	) {
		return this.publishRepo.createRecord(params);
	}

	updatePublishRecord(
		id: number,
		patch: Parameters<PublishRepository["updateRecord"]>[1],
	) {
		return this.publishRepo.updateRecord(id, patch);
	}

	getPublishRecord(id: number) {
		return this.publishRepo.getRecord(id);
	}

	listPublishRecordsByDocument(documentId: number) {
		return this.publishRepo.listRecordsByDocument(documentId);
	}
}

export type {
	AddTagsPlanItem,
	AddTagsResult,
	AffectedBookmarkInfo,
	ChatSessionRecord,
	RemoveTagsResult,
	RenameOrMergeTagsResult,
	TagWithCount,
};

// Re-export query types for backward compatibility
export type {
	BookmarkQueryParams,
	EmbeddingStats,
	NeedingEmbeddingBookmark,
	SearchBookmarkItem,
};

// Singleton database instance
export const workbenchDb = new WorkbenchDatabase();
