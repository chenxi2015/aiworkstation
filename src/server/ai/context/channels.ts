import type { JsonValue } from "../../../components/workbench/types.ts";
import { getDb } from "../../db/connection.ts";

/**
 * AI 能力通道配置（ai_channel_configs 表）的统一读写与解析。
 *
 * 设计约定（docs/ai-config-membership-v2-plan.md）：
 * - 一切配置入表：apiKey / baseUrl / model 只存 SQLite，不做 env 兜底；
 * - 能力为一等抽象：chat / vision / embedding / web_search / image_gen / video_gen；
 * - 官方通道（channel='official'）的凭证不在行内固化，解析时实时读取设置里的
 *   cloudToken / cloudApiBase，保证登录态刷新后立即生效；
 * - 本地不做任何会员字段判断，官方通道可用性由云端网关裁决。
 */

export type CapabilityId =
	| "chat"
	| "vision"
	| "embedding"
	| "web_search"
	| "image_gen"
	| "video_gen";

export const CAPABILITY_IDS: readonly CapabilityId[] = [
	"chat",
	"vision",
	"embedding",
	"web_search",
	"image_gen",
	"video_gen",
] as const;

export type ChannelKind = "official" | "custom";

export interface ChannelConfigRow {
	id: number;
	capability: CapabilityId;
	channel: ChannelKind;
	provider: string;
	label: string;
	apiKey: string;
	baseUrl: string;
	model: string;
	extra: Record<string, JsonValue>;
	isActive: boolean;
}

export interface ChannelConfigInput {
	capability: CapabilityId;
	channel?: ChannelKind;
	provider?: string;
	label?: string;
	apiKey?: string;
	baseUrl?: string;
	model?: string;
	extra?: Record<string, JsonValue>;
	isActive?: boolean;
}

export interface ResolvedChannelConfig {
	capability: CapabilityId;
	channel: ChannelKind;
	provider: string;
	apiKey: string;
	baseUrl: string;
	model: string;
	extra: Record<string, JsonValue>;
	/** 是否已具备发起请求的最小配置（custom 需要 apiKey 或本地类 baseUrl） */
	configured: boolean;
}

interface RawRow {
	id: number;
	capability: string;
	channel: string;
	provider: string;
	label: string;
	api_key: string;
	base_url: string;
	model: string;
	extra: string;
	is_active: number;
}

/** 官方通道在各能力下的默认模型（用户可在设置中改，落库后以行内值为准） */
const OFFICIAL_DEFAULT_MODEL: Record<CapabilityId, string> = {
	chat: "deepseek-chat",
	vision: "deepseek-chat",
	embedding: "BAAI/bge-m3",
	web_search: "",
	image_gen: "doubao-seedream-5-0-flash-260915",
	video_gen: "doubao-seed-video",
};

const OFFICIAL_LABEL = "官方极速通道";

function toRow(raw: RawRow): ChannelConfigRow {
	let extra: Record<string, JsonValue> = {};
	try {
		extra = raw.extra ? (JSON.parse(raw.extra) as Record<string, JsonValue>) : {};
	} catch {
		extra = {};
	}
	return {
		id: raw.id,
		capability: raw.capability as CapabilityId,
		channel: raw.channel === "official" ? "official" : "custom",
		provider: raw.provider,
		label: raw.label,
		apiKey: raw.api_key,
		baseUrl: raw.base_url,
		model: raw.model,
		extra,
		isActive: raw.is_active === 1,
	};
}

/** 读取设置表里的云端会话（官方通道凭证的唯一事实源） */
export function getCloudSession(): {
	cloudToken: string;
	cloudApiBase: string;
} {
	try {
		const row = getDb()
			.prepare("SELECT value FROM settings WHERE key = 'workbench_settings'")
			.get() as { value: string } | undefined;
		const parsed = row?.value
			? (JSON.parse(row.value) as Record<string, unknown>)
			: {};
		const cloudApiBase = (
			String(parsed.cloudApiBase || "").trim() || "http://localhost:4000"
		).replace(/\/+$/, "");
		return {
			cloudToken: String(parsed.cloudToken || "").trim(),
			cloudApiBase,
		};
	} catch {
		return { cloudToken: "", cloudApiBase: "http://localhost:4000" };
	}
}

export function listChannelConfigs(
	capability?: CapabilityId,
): ChannelConfigRow[] {
	migrateLegacyAiConfigs();
	const db = getDb();
	const rows = (
		capability
			? db
					.prepare(
						"SELECT * FROM ai_channel_configs WHERE capability = ? ORDER BY channel DESC, id ASC",
					)
					.all(capability)
			: db
					.prepare(
						"SELECT * FROM ai_channel_configs ORDER BY capability, channel DESC, id ASC",
					)
					.all()
	) as RawRow[];
	return rows.map(toRow);
}

export function getActiveChannel(
	capability: CapabilityId,
): ChannelConfigRow | null {
	migrateLegacyAiConfigs();
	const row = getDb()
		.prepare(
			"SELECT * FROM ai_channel_configs WHERE capability = ? AND is_active = 1 LIMIT 1",
		)
		.get(capability) as RawRow | undefined;
	return row ? toRow(row) : null;
}

export function upsertChannelConfig(input: ChannelConfigInput): number {
	const db = getDb();
	const now = new Date().toISOString();
	const channel = input.channel === "official" ? "official" : "custom";
	const provider = (input.provider ?? "").trim();

	const existing = db
		.prepare(
			"SELECT id FROM ai_channel_configs WHERE capability = ? AND channel = ? AND provider = ? LIMIT 1",
		)
		.get(input.capability, channel, provider) as { id: number } | undefined;

	if (existing) {
		db.prepare(
			`UPDATE ai_channel_configs
			 SET label = COALESCE(NULLIF(?, ''), label),
			     api_key = COALESCE(NULLIF(?, ''), api_key),
			     base_url = COALESCE(NULLIF(?, ''), base_url),
			     model = COALESCE(NULLIF(?, ''), model),
			     extra = CASE WHEN ? = '{}' THEN extra ELSE ? END,
			     updated_at = ?
			 WHERE id = ?`,
		).run(
			(input.label ?? "").trim(),
			(input.apiKey ?? "").trim(),
			(input.baseUrl ?? "").trim(),
			(input.model ?? "").trim(),
			JSON.stringify(input.extra ?? {}),
			JSON.stringify(input.extra ?? {}),
			now,
			existing.id,
		);
		if (input.isActive) activateChannelConfig(existing.id);
		return existing.id;
	}

	const result = db
		.prepare(
			`INSERT INTO ai_channel_configs
			 (capability, channel, provider, label, api_key, base_url, model, extra, is_active, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
		)
		.run(
			input.capability,
			channel,
			provider,
			(input.label ?? "").trim(),
			(input.apiKey ?? "").trim(),
			(input.baseUrl ?? "").trim(),
			(input.model ?? "").trim(),
			JSON.stringify(input.extra ?? {}),
			now,
			now,
		);
	const id = Number(result.lastInsertRowid);
	if (input.isActive) activateChannelConfig(id);
	return id;
}

export function activateChannelConfig(id: number): void {
	const db = getDb();
	const row = db
		.prepare("SELECT capability FROM ai_channel_configs WHERE id = ?")
		.get(id) as { capability: string } | undefined;
	if (!row) return;
	const tx = db.transaction(() => {
		db.prepare(
			"UPDATE ai_channel_configs SET is_active = 0 WHERE capability = ?",
		).run(row.capability);
		db.prepare(
			"UPDATE ai_channel_configs SET is_active = 1, updated_at = ? WHERE id = ?",
		).run(new Date().toISOString(), id);
	});
	tx();
}

export function deleteChannelConfig(id: number): void {
	getDb().prepare("DELETE FROM ai_channel_configs WHERE id = ?").run(id);
}

/**
 * 开关某能力的官方通道（激活/停用官方行）。
 * 适用于 web_search 这类 custom 行有多条（每引擎一行）的能力，
 * 无法靠「激活另一行」来退出官方通道。
 */
export function setOfficialChannelActive(
	capability: CapabilityId,
	active: boolean,
): void {
	migrateLegacyAiConfigs();
	const db = getDb();
	const row = db
		.prepare(
			"SELECT id FROM ai_channel_configs WHERE capability = ? AND channel = 'official' LIMIT 1",
		)
		.get(capability) as { id: number } | undefined;
	if (active) {
		activateChannelConfig(row?.id ?? ensureOfficialChannel(capability));
		return;
	}
	if (row) {
		db.prepare("UPDATE ai_channel_configs SET is_active = 0 WHERE id = ?").run(
			row.id,
		);
	}
}

/**
 * 确保某能力存在官方通道配置行（登录/支付后调用，幂等）。
 * 不自动激活：是否启用由用户或 activateOfficialChannels 决定。
 */
export function ensureOfficialChannel(capability: CapabilityId): number {
	return upsertChannelConfig({
		capability,
		channel: "official",
		provider: "official",
		label: OFFICIAL_LABEL,
		model: OFFICIAL_DEFAULT_MODEL[capability],
	});
}

/**
 * 登录/支付完成后的零操作配置：为全部能力创建官方通道行并激活。
 * 自备 Key 的行保留，随时可在设置里切回。
 */
export function activateOfficialChannels(
	capabilities: readonly CapabilityId[] = CAPABILITY_IDS,
): void {
	for (const capability of capabilities) {
		const id = ensureOfficialChannel(capability);
		activateChannelConfig(id);
	}
}

/**
 * 解析某能力的生效配置。overrides > active 行 > 空配置（configured=false）。
 * 官方通道凭证实时取自设置里的 cloudToken/cloudApiBase。
 */
export function resolveCapabilityConfig(
	capability: CapabilityId,
	overrides: { apiKey?: string; baseUrl?: string; model?: string } = {},
): ResolvedChannelConfig {
	const active = getActiveChannel(capability);

	if (!active) {
		return {
			capability,
			channel: "custom",
			provider: "",
			apiKey: overrides.apiKey?.trim() ?? "",
			baseUrl: (overrides.baseUrl ?? "").trim(),
			model: (overrides.model ?? "").trim(),
			extra: {},
			configured: Boolean(overrides.apiKey?.trim()),
		};
	}

	if (active.channel === "official") {
		const { cloudToken, cloudApiBase } = getCloudSession();
		const model =
			overrides.model?.trim() ||
			active.model ||
			OFFICIAL_DEFAULT_MODEL[capability];
		return {
			capability,
			channel: "official",
			provider: "official",
			apiKey: cloudToken,
			baseUrl: `${cloudApiBase}/api/ai/v1`,
			model,
			extra: active.extra,
			configured: Boolean(cloudToken),
		};
	}

	const apiKey = overrides.apiKey?.trim() || active.apiKey;
	const baseUrl = (overrides.baseUrl?.trim() || active.baseUrl).replace(
		/\/+$/,
		"",
	);
	return {
		capability,
		channel: "custom",
		provider: active.provider,
		apiKey,
		baseUrl,
		model: overrides.model?.trim() || active.model,
		extra: active.extra,
		configured: Boolean(apiKey) || /localhost|127\.0\.0\.1|11434/.test(baseUrl),
	};
}

// ================= 存量设置迁移（幂等，首次访问时执行） =================

let migrated = false;

interface LegacySettings {
	apiKey?: string;
	baseUrl?: string;
	model?: string;
	llmProvider?: string;
	llmProvidersConfig?: Record<
		string,
		{ apiKey?: string; baseUrl?: string; model?: string }
	>;
	embeddingApiKey?: string;
	embeddingBaseUrl?: string;
	embeddingModel?: string;
	embeddingProvider?: string;
	embeddingProvidersConfig?: Record<
		string,
		{ apiKey?: string; baseUrl?: string; model?: string }
	>;
	imageApiKey?: string;
	imageBaseUrl?: string;
	imageModel?: string;
	imageProvider?: string;
	imageProvidersConfig?: Record<
		string,
		{ apiKey?: string; baseUrl?: string; model?: string }
	>;
	cloudToken?: string;
}

function readLegacySettings(): LegacySettings | null {
	try {
		const row = getDb()
			.prepare("SELECT value FROM settings WHERE key = 'workbench_settings'")
			.get() as { value: string } | undefined;
		return row?.value ? (JSON.parse(row.value) as LegacySettings) : null;
	} catch {
		return null;
	}
}

function readLegacySearchKeys(): Record<string, string> {
	try {
		const row = getDb()
			.prepare("SELECT value FROM settings WHERE key = 'searchConfig'")
			.get() as { value: string } | undefined;
		if (!row?.value) return {};
		const parsed = JSON.parse(row.value) as {
			apiKeys?: Record<string, string>;
		};
		const keys: Record<string, string> = {};
		for (const [engine, key] of Object.entries(parsed.apiKeys ?? {})) {
			if (typeof key === "string" && key.trim()) keys[engine] = key.trim();
		}
		return keys;
	} catch {
		return {};
	}
}

/**
 * 把 workbench_settings / searchConfig 里的 AI 配置一次性迁移进
 * ai_channel_configs。幂等：表内已有任意行则跳过（用户可能已在新表上操作）。
 */
export function migrateLegacyAiConfigs(): void {
	if (migrated) return;
	migrated = true;
	try {
		const count = getDb()
			.prepare("SELECT COUNT(*) AS cnt FROM ai_channel_configs")
			.get() as { cnt: number };
		if (count.cnt > 0) return;

		const legacy = readLegacySettings() ?? {};
		const searchKeys = readLegacySearchKeys();

		// chat：official 默认行 + 各 custom provider 行
		const chatProvider = legacy.llmProvider || "official";
		const chatOfficialId = ensureOfficialChannel("chat");
		if (chatProvider === "official" && legacy.model?.trim()) {
			upsertChannelConfig({
				capability: "chat",
				channel: "official",
				provider: "official",
				model: legacy.model.trim(),
			});
		}
		for (const [pid, cfg] of Object.entries(legacy.llmProvidersConfig ?? {})) {
			if (!cfg?.apiKey?.trim()) continue;
			upsertChannelConfig({
				capability: "chat",
				channel: "custom",
				provider: pid,
				label: pid,
				apiKey: cfg.apiKey,
				baseUrl: cfg.baseUrl ?? "",
				model: cfg.model ?? "",
			});
		}
		if (chatProvider !== "official" && legacy.apiKey?.trim()) {
			upsertChannelConfig({
				capability: "chat",
				channel: "custom",
				provider: chatProvider,
				label: chatProvider,
				apiKey: legacy.apiKey,
				baseUrl: legacy.baseUrl ?? "",
				model: legacy.model ?? "",
			});
		}
		if (chatProvider === "official") {
			activateChannelConfig(chatOfficialId);
		} else {
			const row = getDb()
				.prepare(
					"SELECT id FROM ai_channel_configs WHERE capability = 'chat' AND channel = 'custom' AND provider = ?",
				)
				.get(chatProvider) as { id: number } | undefined;
			if (row) activateChannelConfig(row.id);
		}

		// embedding：official 默认行 + custom 行
		const embProvider = legacy.embeddingProvider || "official";
		const embOfficialId = ensureOfficialChannel("embedding");
		if (legacy.embeddingModel?.trim()) {
			upsertChannelConfig({
				capability: "embedding",
				channel: "official",
				provider: "official",
				model: legacy.embeddingModel.trim(),
			});
		}
		for (const [pid, cfg] of Object.entries(
			legacy.embeddingProvidersConfig ?? {},
		)) {
			if (!cfg?.apiKey?.trim()) continue;
			upsertChannelConfig({
				capability: "embedding",
				channel: "custom",
				provider: pid,
				label: pid,
				apiKey: cfg.apiKey,
				baseUrl: cfg.baseUrl ?? "",
				model: cfg.model ?? "",
			});
		}
		if (embProvider !== "official" && legacy.embeddingApiKey?.trim()) {
			upsertChannelConfig({
				capability: "embedding",
				channel: "custom",
				provider: embProvider,
				label: embProvider,
				apiKey: legacy.embeddingApiKey,
				baseUrl: legacy.embeddingBaseUrl ?? "",
				model: legacy.embeddingModel ?? "",
			});
		}
		if (embProvider === "official") {
			activateChannelConfig(embOfficialId);
		} else {
			const row = getDb()
				.prepare(
					"SELECT id FROM ai_channel_configs WHERE capability = 'embedding' AND channel = 'custom' AND provider = ?",
				)
				.get(embProvider) as { id: number } | undefined;
			if (row) activateChannelConfig(row.id);
		}

		// image_gen
		const imgProvider = legacy.imageProvider || "";
		for (const [pid, cfg] of Object.entries(legacy.imageProvidersConfig ?? {})) {
			if (!cfg?.apiKey?.trim()) continue;
			upsertChannelConfig({
				capability: "image_gen",
				channel: "custom",
				provider: pid,
				label: pid,
				apiKey: cfg.apiKey,
				baseUrl: cfg.baseUrl ?? "",
				model: cfg.model ?? "",
			});
		}
		if (imgProvider && imgProvider !== "official") {
			const imgId = upsertChannelConfig({
				capability: "image_gen",
				channel: "custom",
				provider: imgProvider,
				label: imgProvider,
				apiKey: legacy.imageApiKey ?? "",
				baseUrl: legacy.imageBaseUrl ?? "",
				model: legacy.imageModel ?? "",
			});
			activateChannelConfig(imgId);
		} else if (imgProvider === "official") {
			activateChannelConfig(ensureOfficialChannel("image_gen"));
		}

		// web_search：搜索引擎 key 各成一行（provider=engineId）
		for (const [engine, key] of Object.entries(searchKeys)) {
			upsertChannelConfig({
				capability: "web_search",
				channel: "custom",
				provider: engine,
				label: engine,
				apiKey: key,
			});
		}
		// 未配置任何引擎 key 时默认走官方通道（会员开箱即用）；
		// 已配置则保持 custom 活跃，尊重存量自建配置。
		const searchOfficialId = ensureOfficialChannel("web_search");
		if (Object.keys(searchKeys).length === 0) {
			activateChannelConfig(searchOfficialId);
		}

		// vision 预留官方行（多模态接线见 P3）
		ensureOfficialChannel("vision");
	} catch (err) {
		console.warn("[channels] Legacy AI config migration failed:", err);
	}
}

/** 测试辅助：重置迁移标记（仅测试用） */
export function __resetChannelMigrationForTest(): void {
	migrated = false;
}

// ================= 设置写穿：workbench_settings → ai_channel_configs =================

interface SettingsLikeProviders {
	apiKey?: string;
	baseUrl?: string;
	model?: string;
}

/**
 * 设置页保存 workbench_settings 时把 AI 通道相关字段写穿到 ai_channel_configs，
 * 保证「设置 UI 照旧工作、resolver 只读新表」。
 * - custom provider 行按 llmProvidersConfig / embeddingProvidersConfig / imageProvidersConfig upsert；
 * - 当前生效 provider 对应的行被激活；
 * - cloudToken 存在时为各能力补齐 official 行（不抢激活态，除非用户当前 provider 就是 official）。
 */
export function syncChannelsFromSettings(settings: {
	apiKey?: string;
	baseUrl?: string;
	model?: string;
	llmProvider?: string;
	llmProvidersConfig?: Record<string, SettingsLikeProviders>;
	embeddingApiKey?: string;
	embeddingBaseUrl?: string;
	embeddingModel?: string;
	embeddingProvider?: string;
	embeddingProvidersConfig?: Record<string, SettingsLikeProviders>;
	imageApiKey?: string;
	imageBaseUrl?: string;
	imageModel?: string;
	imageProvider?: string;
	imageProvidersConfig?: Record<string, SettingsLikeProviders>;
	cloudToken?: string;
}): void {
	migrateLegacyAiConfigs();
	try {
		// chat
		const chatProvider = settings.llmProvider || "official";
		for (const [pid, cfg] of Object.entries(settings.llmProvidersConfig ?? {})) {
			if (!cfg?.apiKey?.trim()) continue;
			upsertChannelConfig({
				capability: "chat",
				channel: "custom",
				provider: pid,
				label: pid,
				apiKey: cfg.apiKey,
				baseUrl: cfg.baseUrl ?? "",
				model: cfg.model ?? "",
			});
		}
		if (chatProvider !== "official" && settings.apiKey?.trim()) {
			upsertChannelConfig({
				capability: "chat",
				channel: "custom",
				provider: chatProvider,
				label: chatProvider,
				apiKey: settings.apiKey,
				baseUrl: settings.baseUrl ?? "",
				model: settings.model ?? "",
			});
		}
		if (chatProvider === "official") {
			if (settings.model?.trim()) {
				upsertChannelConfig({
					capability: "chat",
					channel: "official",
					provider: "official",
					model: settings.model.trim(),
				});
			}
			activateChannelConfig(ensureOfficialChannel("chat"));
		} else {
			const row = getDb()
				.prepare(
					"SELECT id FROM ai_channel_configs WHERE capability = 'chat' AND channel = 'custom' AND provider = ?",
				)
				.get(chatProvider) as { id: number } | undefined;
			if (row) activateChannelConfig(row.id);
		}

		// embedding
		const embProvider = settings.embeddingProvider || "official";
		for (const [pid, cfg] of Object.entries(
			settings.embeddingProvidersConfig ?? {},
		)) {
			if (!cfg?.apiKey?.trim()) continue;
			upsertChannelConfig({
				capability: "embedding",
				channel: "custom",
				provider: pid,
				label: pid,
				apiKey: cfg.apiKey,
				baseUrl: cfg.baseUrl ?? "",
				model: cfg.model ?? "",
			});
		}
		if (embProvider !== "official" && settings.embeddingApiKey?.trim()) {
			upsertChannelConfig({
				capability: "embedding",
				channel: "custom",
				provider: embProvider,
				label: embProvider,
				apiKey: settings.embeddingApiKey,
				baseUrl: settings.embeddingBaseUrl ?? "",
				model: settings.embeddingModel ?? "",
			});
		}
		if (embProvider === "official") {
			if (settings.embeddingModel?.trim()) {
				upsertChannelConfig({
					capability: "embedding",
					channel: "official",
					provider: "official",
					model: settings.embeddingModel.trim(),
				});
			}
			activateChannelConfig(ensureOfficialChannel("embedding"));
		} else {
			const row = getDb()
				.prepare(
					"SELECT id FROM ai_channel_configs WHERE capability = 'embedding' AND channel = 'custom' AND provider = ?",
				)
				.get(embProvider) as { id: number } | undefined;
			if (row) activateChannelConfig(row.id);
		}

		// image_gen
		const imgProvider = settings.imageProvider || "";
		for (const [pid, cfg] of Object.entries(
			settings.imageProvidersConfig ?? {},
		)) {
			if (!cfg?.apiKey?.trim()) continue;
			upsertChannelConfig({
				capability: "image_gen",
				channel: "custom",
				provider: pid,
				label: pid,
				apiKey: cfg.apiKey,
				baseUrl: cfg.baseUrl ?? "",
				model: cfg.model ?? "",
			});
		}
		if (imgProvider === "official") {
			activateChannelConfig(ensureOfficialChannel("image_gen"));
		} else if (imgProvider) {
			const id = upsertChannelConfig({
				capability: "image_gen",
				channel: "custom",
				provider: imgProvider,
				label: imgProvider,
				apiKey: settings.imageApiKey ?? "",
				baseUrl: settings.imageBaseUrl ?? "",
				model: settings.imageModel ?? "",
			});
			activateChannelConfig(id);
		}

		// 登录态存在时补齐各能力 official 行（不抢激活态）
		if (settings.cloudToken?.trim()) {
			for (const capability of CAPABILITY_IDS) {
				ensureOfficialChannel(capability);
			}
		}
	} catch (err) {
		console.warn("[channels] syncChannelsFromSettings failed:", err);
	}
}
