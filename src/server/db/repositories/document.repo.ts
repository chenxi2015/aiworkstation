import type {
	DocumentVersion,
	DocumentVersionOrigin,
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
	created_at: string | null;
	updated_at: string | null;
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
				`SELECT * FROM documents ${includeArchived ? "" : "WHERE status != 'archived'"} ORDER BY updated_at DESC, id DESC`,
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
	}): number {
		const now = new Date().toISOString();
		const res = this.db
			.prepare(
				`INSERT INTO documents (title, content, content_text, style_preset, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'editing', ?, ?)`,
			)
			.run(
				params.title,
				params.content ?? "",
				params.contentText ?? "",
				params.stylePreset ?? "",
				now,
				now,
			);
		return Number(res.lastInsertRowid);
	}

	updateDocument(
		id: number,
		patch: {
			title?: string;
			content?: string;
			contentText?: string;
			stylePreset?: string;
			status?: EditorDocument["status"];
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
