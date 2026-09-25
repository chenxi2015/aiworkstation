import type {
	DocumentVersion,
	DocumentVersionOrigin,
	EditorDocFolder,
	EditorDocument,
} from "../../../components/editor/types.ts";
import type { SqliteDatabase } from "../types.ts";

interface DocumentRow {
	id: number;
	title: string;
	content: string;
	content_text: string | null;
	style_preset: string | null;
	status: string;
	folder_id: number | null;
	sort_order: number | null;
	pinned: number | null;
	created_at: string | null;
	updated_at: string | null;
}

interface DocumentFolderRow {
	id: number;
	name: string;
	sort_order: number | null;
	created_at: string | null;
	updated_at: string | null;
	doc_count?: number;
}

interface DocumentVersionRow {
	id: number;
	document_id: number;
	content: string;
	version: number;
	origin: string;
	note: string | null;
	created_at: string | null;
}

function rowToDocument(r: DocumentRow): EditorDocument {
	return {
		id: r.id,
		title: r.title,
		content: r.content,
		contentText: r.content_text ?? "",
		stylePreset: r.style_preset ?? "",
		status: r.status as EditorDocument["status"],
		folderId: r.folder_id ?? null,
		sortOrder: r.sort_order ?? 0,
		pinned: r.pinned === 1,
		createdAt: r.created_at ?? undefined,
		updatedAt: r.updated_at ?? undefined,
	};
}

function rowToDocFolder(r: DocumentFolderRow): EditorDocFolder {
	return {
		id: r.id,
		name: r.name,
		sortOrder: r.sort_order ?? 0,
		docCount: r.doc_count,
		createdAt: r.created_at ?? undefined,
		updatedAt: r.updated_at ?? undefined,
	};
}

function rowToVersion(r: DocumentVersionRow): DocumentVersion {
	return {
		id: r.id,
		documentId: r.document_id,
		content: r.content,
		version: r.version,
		origin: r.origin as DocumentVersionOrigin,
		note: r.note,
		createdAt: r.created_at ?? undefined,
	};
}

/**
 * Repository handling Editor module persistence: documents / document_versions
 * （docs/editor-plan.md 第五节；版本快照独立建表，避免自动快照污染主表查询）
 */
export class DocumentRepository {
	constructor(private db: SqliteDatabase) {}

	// ================= Documents =================

	listDocuments(includeArchived = false): EditorDocument[] {
		const rows = this.db
			.prepare(
				`SELECT * FROM documents ${includeArchived ? "" : "WHERE status != 'archived'"} ORDER BY pinned DESC, sort_order ASC, updated_at DESC, id DESC`,
			)
			.all() as DocumentRow[];
		return rows.map(rowToDocument);
	}

	/** 归档库：仅 status='archived'（docs/selfmedia-merge-plan.md 归档互斥状态机） */
	listArchivedDocuments(): EditorDocument[] {
		const rows = this.db
			.prepare(
				"SELECT * FROM documents WHERE status = 'archived' ORDER BY updated_at DESC, id DESC",
			)
			.all() as DocumentRow[];
		return rows.map(rowToDocument);
	}

	getDocument(id: number): EditorDocument | null {
		const row = this.db
			.prepare("SELECT * FROM documents WHERE id = ?")
			.get(id) as DocumentRow | undefined;
		return row ? rowToDocument(row) : null;
	}

	createDocument(params: {
		title: string;
		content?: string;
		contentText?: string;
		stylePreset?: string;
		folderId?: number | null;
	}): number {
		const now = new Date().toISOString();
		const folderId = params.folderId ?? null;
		// 新文档排在同组最前：sort_order 取同文件夹最小值 - 1
		const sortOrder = this.minDocSortOrder(folderId) - 1;
		const res = this.db
			.prepare(
				`INSERT INTO documents (title, content, content_text, style_preset, status, folder_id, sort_order, pinned, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'editing', ?, ?, 0, ?, ?)`,
			)
			.run(
				params.title,
				params.content ?? "",
				params.contentText ?? "",
				params.stylePreset ?? "",
				folderId,
				sortOrder,
				now,
				now,
			);
		return Number(res.lastInsertRowid);
	}

	/** 同文件夹内最小 sort_order（无记录时返回 1，便于新条目取 0 排到最前） */
	private minDocSortOrder(folderId: number | null): number {
		const row = (
			folderId == null
				? this.db
						.prepare(
							"SELECT MIN(sort_order) AS m FROM documents WHERE folder_id IS NULL",
						)
						.get()
				: this.db
						.prepare(
							"SELECT MIN(sort_order) AS m FROM documents WHERE folder_id = ?",
						)
						.get(folderId)
		) as { m: number | null } | undefined;
		return row?.m ?? 1;
	}

	updateDocument(
		id: number,
		patch: {
			title?: string;
			content?: string;
			contentText?: string;
			stylePreset?: string;
			status?: EditorDocument["status"];
			folderId?: number | null;
			sortOrder?: number;
			pinned?: boolean;
		},
	): void {
		const fields: string[] = [];
		const values: unknown[] = [];
		if (patch.title !== undefined) {
			fields.push("title = ?");
			values.push(patch.title);
		}
		if (patch.content !== undefined) {
			fields.push("content = ?");
			values.push(patch.content);
		}
		if (patch.contentText !== undefined) {
			fields.push("content_text = ?");
			values.push(patch.contentText);
		}
		if (patch.stylePreset !== undefined) {
			fields.push("style_preset = ?");
			values.push(patch.stylePreset);
		}
		if (patch.status !== undefined) {
			fields.push("status = ?");
			values.push(patch.status);
		}
		if (patch.folderId !== undefined) {
			fields.push("folder_id = ?");
			values.push(patch.folderId);
		}
		if (patch.sortOrder !== undefined) {
			fields.push("sort_order = ?");
			values.push(patch.sortOrder);
		}
		if (patch.pinned !== undefined) {
			fields.push("pinned = ?");
			values.push(patch.pinned ? 1 : 0);
		}
		if (fields.length === 0) return;
		fields.push("updated_at = ?");
		values.push(new Date().toISOString());
		values.push(id);
		this.db
			.prepare(`UPDATE documents SET ${fields.join(", ")} WHERE id = ?`)
			.run(...values);
	}

	deleteDocument(id: number): void {
		this.db
			.prepare("DELETE FROM document_versions WHERE document_id = ?")
			.run(id);
		this.db.prepare("DELETE FROM documents WHERE id = ?").run(id);
	}

	/** 移动文档到目标文件夹（null = 移回「全部」未归档），并排到目标组最前 */
	moveDocumentToFolder(id: number, folderId: number | null): void {
		const sortOrder = this.minDocSortOrder(folderId) - 1;
		this.db
			.prepare(
				"UPDATE documents SET folder_id = ?, sort_order = ?, updated_at = ? WHERE id = ?",
			)
			.run(folderId, sortOrder, new Date().toISOString(), id);
	}

	/** 置顶/取消置顶：置顶时排到同文件夹置顶组最前 */
	setDocumentPinned(id: number, pinned: boolean): void {
		const doc = this.getDocument(id);
		if (!doc) return;
		const sortOrder = this.minDocSortOrder(doc.folderId ?? null) - 1;
		this.db
			.prepare("UPDATE documents SET pinned = ?, sort_order = ? WHERE id = ?")
			.run(pinned ? 1 : 0, sortOrder, id);
	}

	/** 按传入顺序重写同组文档的 sort_order（拖拽排序落库） */
	reorderDocuments(orderedIds: number[]): void {
		const stmt = this.db.prepare(
			"UPDATE documents SET sort_order = ? WHERE id = ?",
		);
		const tx = this.db.transaction(() => {
			orderedIds.forEach((docId, index) => {
				stmt.run(index, docId);
			});
		});
		tx();
	}

	// ================= Document Folders =================

	listDocumentFolders(): EditorDocFolder[] {
		const rows = this.db
			.prepare(
				`SELECT f.*, (SELECT COUNT(*) FROM documents d WHERE d.folder_id = f.id AND d.status != 'archived') AS doc_count
         FROM document_folders f ORDER BY f.sort_order ASC, f.id ASC`,
			)
			.all() as DocumentFolderRow[];
		return rows.map(rowToDocFolder);
	}

	createDocumentFolder(name: string): number {
		const now = new Date().toISOString();
		// 新文件夹排在列表最前
		const minRow = this.db
			.prepare("SELECT MIN(sort_order) AS m FROM document_folders")
			.get() as { m: number | null } | undefined;
		const sortOrder = (minRow?.m ?? 1) - 1;
		const res = this.db
			.prepare(
				"INSERT INTO document_folders (name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?)",
			)
			.run(name, sortOrder, now, now);
		return Number(res.lastInsertRowid);
	}

	renameDocumentFolder(id: number, name: string): void {
		this.db
			.prepare(
				"UPDATE document_folders SET name = ?, updated_at = ? WHERE id = ?",
			)
			.run(name, new Date().toISOString(), id);
	}

	/** 删除文件夹：其中文档移回「全部」（folder_id = NULL），不删文档本体 */
	deleteDocumentFolder(id: number): void {
		const tx = this.db.transaction(() => {
			this.db
				.prepare("UPDATE documents SET folder_id = NULL WHERE folder_id = ?")
				.run(id);
			this.db.prepare("DELETE FROM document_folders WHERE id = ?").run(id);
		});
		tx();
	}

	/** 按传入顺序重写文件夹 sort_order（拖拽排序落库） */
	reorderDocumentFolders(orderedIds: number[]): void {
		const stmt = this.db.prepare(
			"UPDATE document_folders SET sort_order = ? WHERE id = ?",
		);
		const tx = this.db.transaction(() => {
			orderedIds.forEach((folderId, index) => {
				stmt.run(index, folderId);
			});
		});
		tx();
	}

	// ================= Document Versions =================

	/** 下一版本号（同一文档内单调递增） */
	nextVersionNumber(documentId: number): number {
		const row = this.db
			.prepare(
				"SELECT MAX(version) AS maxv FROM document_versions WHERE document_id = ?",
			)
			.get(documentId) as { maxv: number | null } | undefined;
		return (row?.maxv ?? 0) + 1;
	}

	createVersion(params: {
		documentId: number;
		content: string;
		origin: DocumentVersionOrigin;
		note?: string | null;
	}): number {
		const now = new Date().toISOString();
		const version = this.nextVersionNumber(params.documentId);
		const res = this.db
			.prepare(
				`INSERT INTO document_versions (document_id, content, version, origin, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
			)
			.run(
				params.documentId,
				params.content,
				version,
				params.origin,
				params.note ?? null,
				now,
			);
		return Number(res.lastInsertRowid);
	}

	listVersions(documentId: number): DocumentVersion[] {
		const rows = this.db
			.prepare(
				"SELECT * FROM document_versions WHERE document_id = ? ORDER BY version DESC",
			)
			.all(documentId) as DocumentVersionRow[];
		return rows.map(rowToVersion);
	}
}
