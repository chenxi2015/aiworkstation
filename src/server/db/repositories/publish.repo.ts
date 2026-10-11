import type {
	PlatformAccountInfo,
	PlatformAccountStatus,
	PublishChannel,
	PublishPlatformCode,
	PublishRecord,
	PublishRecordStatus,
} from "../../../components/editor/types.ts";
import type { SqliteDatabase } from "../types.ts";

interface AccountRow {
	id: number;
	platform: string;
	channel: string;
	label: string;
	credentials: string;
	status: string;
	meta: string | null;
	last_validated_at: string | null;
	created_at: string;
	updated_at: string;
}

interface RecordRow {
	id: number;
	document_id: number;
	account_id: number | null;
	platform: string;
	channel: string;
	variant_json: string;
	status: string;
	platform_post_id: string | null;
	platform_url: string | null;
	error: string | null;
	published_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface PlatformAccountEntity {
	id: number;
	platform: PublishPlatformCode;
	channel: PublishChannel;
	label: string;
	/** AES-GCM 加密串，仅 server 层可见 */
	credentials: string;
	status: PlatformAccountStatus;
	meta: Record<string, unknown>;
	lastValidatedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

function rowToAccount(r: AccountRow): PlatformAccountEntity {
	let meta: Record<string, unknown> = {};
	try {
		meta = r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : {};
	} catch {
		meta = {};
	}
	return {
		id: r.id,
		platform: r.platform as PublishPlatformCode,
		channel: r.channel as PublishChannel,
		label: r.label,
		credentials: r.credentials,
		status: r.status as PlatformAccountStatus,
		meta,
		lastValidatedAt: r.last_validated_at,
		createdAt: r.created_at,
		updatedAt: r.updated_at,
	};
}

function rowToRecord(r: RecordRow): PublishRecord {
	return {
		id: r.id,
		documentId: r.document_id,
		accountId: r.account_id,
		platform: r.platform as PublishPlatformCode,
		channel: r.channel as PublishChannel,
		variantJson: r.variant_json,
		status: r.status as PublishRecordStatus,
		platformPostId: r.platform_post_id,
		platformUrl: r.platform_url,
		error: r.error,
		publishedAt: r.published_at,
		createdAt: r.created_at,
		updatedAt: r.updated_at,
	};
}

/**
 * 发布平台账号 + 发布记录仓库（docs/creator-publish-plan.md 第三节）
 */
export class PublishRepository {
	constructor(private db: SqliteDatabase) {}

	// ================= 平台账号 =================

	listAccounts(): PlatformAccountEntity[] {
		const rows = this.db
			.prepare("SELECT * FROM platform_accounts ORDER BY platform ASC, id ASC")
			.all() as AccountRow[];
		return rows.map(rowToAccount);
	}

	getAccount(id: number): PlatformAccountEntity | null {
		const row = this.db
			.prepare("SELECT * FROM platform_accounts WHERE id = ?")
			.get(id) as AccountRow | undefined;
		return row ? rowToAccount(row) : null;
	}

	upsertAccount(params: {
		platform: PublishPlatformCode;
		channel: PublishChannel;
		label: string;
		credentials: string;
		status?: PlatformAccountStatus;
		meta?: Record<string, unknown>;
	}): number {
		const now = new Date().toISOString();
		const existing = this.db
			.prepare(
				"SELECT id FROM platform_accounts WHERE platform = ? AND label = ?",
			)
			.get(params.platform, params.label) as { id: number } | undefined;
		if (existing) {
			this.db
				.prepare(
					`UPDATE platform_accounts
					 SET channel = ?, credentials = ?, status = ?, meta = ?, last_validated_at = ?, updated_at = ?
					 WHERE id = ?`,
				)
				.run(
					params.channel,
					params.credentials,
					params.status ?? "active",
					JSON.stringify(params.meta ?? {}),
					now,
					now,
					existing.id,
				);
			return existing.id;
		}
		const result = this.db
			.prepare(
				`INSERT INTO platform_accounts
				 (platform, channel, label, credentials, status, meta, last_validated_at, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				params.platform,
				params.channel,
				params.label,
				params.credentials,
				params.status ?? "active",
				JSON.stringify(params.meta ?? {}),
				now,
				now,
				now,
			);
		return Number(result.lastInsertRowid);
	}

	markAccountStatus(
		id: number,
		status: PlatformAccountStatus,
		meta?: Record<string, unknown>,
	): void {
		const now = new Date().toISOString();
		if (meta) {
			this.db
				.prepare(
					"UPDATE platform_accounts SET status = ?, meta = ?, last_validated_at = ?, updated_at = ? WHERE id = ?",
				)
				.run(status, JSON.stringify(meta), now, now, id);
		} else {
			this.db
				.prepare(
					"UPDATE platform_accounts SET status = ?, last_validated_at = ?, updated_at = ? WHERE id = ?",
				)
				.run(status, now, now, id);
		}
	}

	deleteAccount(id: number): void {
		this.db.prepare("DELETE FROM platform_accounts WHERE id = ?").run(id);
	}

	// ================= 发布记录 =================

	createRecord(params: {
		documentId: number;
		accountId: number | null;
		platform: PublishPlatformCode;
		channel: PublishChannel;
		variantJson: string;
		status?: PublishRecordStatus;
	}): number {
		const now = new Date().toISOString();
		const result = this.db
			.prepare(
				`INSERT INTO publish_records
				 (document_id, account_id, platform, channel, variant_json, status, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				params.documentId,
				params.accountId,
				params.platform,
				params.channel,
				params.variantJson,
				params.status ?? "pending",
				now,
				now,
			);
		return Number(result.lastInsertRowid);
	}

	updateRecord(
		id: number,
		patch: {
			status?: PublishRecordStatus;
			platformPostId?: string | null;
			platformUrl?: string | null;
			error?: string | null;
			publishedAt?: string | null;
		},
	): void {
		const now = new Date().toISOString();
		const current = this.db
			.prepare("SELECT * FROM publish_records WHERE id = ?")
			.get(id) as RecordRow | undefined;
		if (!current) return;
		this.db
			.prepare(
				`UPDATE publish_records
				 SET status = ?, platform_post_id = ?, platform_url = ?, error = ?, published_at = ?, updated_at = ?
				 WHERE id = ?`,
			)
			.run(
				patch.status ?? current.status,
				patch.platformPostId !== undefined
					? patch.platformPostId
					: current.platform_post_id,
				patch.platformUrl !== undefined
					? patch.platformUrl
					: current.platform_url,
				patch.error !== undefined ? patch.error : current.error,
				patch.publishedAt !== undefined
					? patch.publishedAt
					: current.published_at,
				now,
				id,
			);
	}

	getRecord(id: number): PublishRecord | null {
		const row = this.db
			.prepare("SELECT * FROM publish_records WHERE id = ?")
			.get(id) as RecordRow | undefined;
		return row ? rowToRecord(row) : null;
	}

	listRecordsByDocument(documentId: number): PublishRecord[] {
		const rows = this.db
			.prepare(
				"SELECT * FROM publish_records WHERE document_id = ? ORDER BY id DESC",
			)
			.all(documentId) as RecordRow[];
		return rows.map(rowToRecord);
	}
}

/** 供 server function 输出给前端的掩码视图（剥离密文） */
export function toAccountInfo(
	entity: PlatformAccountEntity,
	credentialsHint: string,
): PlatformAccountInfo {
	const meta: Record<string, string> = {};
	for (const [key, value] of Object.entries(entity.meta)) {
		meta[key] = typeof value === "string" ? value : JSON.stringify(value);
	}
	return {
		id: entity.id,
		platform: entity.platform,
		channel: entity.channel,
		label: entity.label,
		status: entity.status,
		credentialsHint,
		meta,
		lastValidatedAt: entity.lastValidatedAt,
		createdAt: entity.createdAt,
		updatedAt: entity.updatedAt,
	};
}
