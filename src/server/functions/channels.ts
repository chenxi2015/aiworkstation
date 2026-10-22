import { createServerFn } from "@tanstack/react-start";
import {
	activateChannelConfig,
	activateOfficialChannels,
	type CapabilityId,
	CAPABILITY_IDS,
	type ChannelConfigInput,
	type ChannelConfigRow,
	deleteChannelConfig,
	getCloudSession,
	listChannelConfigs,
	setOfficialChannelActive,
	upsertChannelConfig,
} from "../ai/context/channels.ts";
import { workbenchDb } from "../db/sqlite.ts";

const VALID_CAPABILITIES = new Set<string>(CAPABILITY_IDS);
const ENTITLEMENTS_SETTINGS_KEY = "cloudEntitlements";

function assertCapability(value: string): CapabilityId {
	if (!VALID_CAPABILITIES.has(value)) {
		throw new Error(`Unknown capability: ${value}`);
	}
	return value as CapabilityId;
}

export interface EntitlementSnapshot {
	tier: string;
	memberExpiresAt: string | null;
	/** 当前档位可用的官方通道能力 */
	capabilities: CapabilityId[];
	syncedAt: string;
}

/** Server Function: 列出某能力（或全部）的通道配置 */
export const listChannelConfigsFn = createServerFn({ method: "POST" })
	.validator((data: { capability?: string }) => data)
	.handler(async ({ data }): Promise<ChannelConfigRow[]> => {
		const capability = data.capability
			? assertCapability(data.capability)
			: undefined;
		return listChannelConfigs(capability);
	});

/** Server Function: 新增/更新一条通道配置（可选同时激活） */
export const saveChannelConfigFn = createServerFn({ method: "POST" })
	.validator((data: ChannelConfigInput) => data)
	.handler(async ({ data }): Promise<{ success: boolean; id: number }> => {
		const id = upsertChannelConfig({
			...data,
			capability: assertCapability(data.capability),
		});
		return { success: true, id };
	});

/** Server Function: 激活某条通道配置（同能力其他行自动退出激活） */
export const activateChannelConfigFn = createServerFn({ method: "POST" })
	.validator((data: { id: number }) => data)
	.handler(async ({ data }): Promise<{ success: boolean }> => {
		activateChannelConfig(data.id);
		return { success: true };
	});

/** Server Function: 删除一条通道配置 */
export const deleteChannelConfigFn = createServerFn({ method: "POST" })
	.validator((data: { id: number }) => data)
	.handler(async ({ data }): Promise<{ success: boolean }> => {
		deleteChannelConfig(data.id);
		return { success: true };
	});

/** Server Function: 开关某能力的官方通道（激活/停用官方行） */
export const setOfficialChannelActiveFn = createServerFn({ method: "POST" })
	.validator((data: { capability: string; active: boolean }) => data)
	.handler(async ({ data }): Promise<{ success: boolean }> => {
		setOfficialChannelActive(assertCapability(data.capability), data.active);
		return { success: true };
	});

/**
 * Server Function: 购会员/登录后的零操作配置——
 * 为全部能力创建官方通道行并激活。自备 Key 配置保留，可随时切回。
 */
export const activateOfficialChannelsFn = createServerFn({
	method: "GET",
}).handler(async (): Promise<{ success: boolean }> => {
	activateOfficialChannels();
	return { success: true };
});

function readCachedEntitlements(): EntitlementSnapshot | null {
	try {
		const raw = workbenchDb.getSetting(ENTITLEMENTS_SETTINGS_KEY);
		return raw ? (JSON.parse(raw) as EntitlementSnapshot) : null;
	} catch {
		return null;
	}
}

/** Server Function: 读取本地缓存的权益快照（仅 UI 展示用，不作拦截依据） */
export const getEntitlementSnapshotFn = createServerFn({
	method: "GET",
}).handler(async (): Promise<EntitlementSnapshot | null> => {
	return readCachedEntitlements();
});

/** Server Function: 从云端拉取最新权益快照并缓存 */
export const refreshEntitlementsFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<EntitlementSnapshot | null> => {
		const { cloudToken, cloudApiBase } = getCloudSession();
		if (!cloudToken) return null;
		try {
			const res = await fetch(`${cloudApiBase}/api/entitlements`, {
				headers: { Authorization: `Bearer ${cloudToken}` },
			});
			if (!res.ok) return readCachedEntitlements();
			const json = (await res.json()) as {
				data?: {
					tier?: string;
					memberExpiresAt?: string | null;
					capabilities?: string[];
				};
			};
			const snapshot: EntitlementSnapshot = {
				tier: json.data?.tier ?? "FREE",
				memberExpiresAt: json.data?.memberExpiresAt ?? null,
				capabilities: (json.data?.capabilities ?? []).filter((c) =>
					VALID_CAPABILITIES.has(c),
				) as CapabilityId[],
				syncedAt: new Date().toISOString(),
			};
			workbenchDb.setSetting(
				ENTITLEMENTS_SETTINGS_KEY,
				JSON.stringify(snapshot),
			);
			return snapshot;
		} catch (err) {
			console.warn("[refreshEntitlements] fetch failed:", err);
			return readCachedEntitlements();
		}
	},
);
