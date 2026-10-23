import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// 必须在导入 connection/channels 之前指向隔离的临时数据目录
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiw-channels-test-"));
process.env.AIWORKSTATION_DATA_DIR = tmpDir;

const { workbenchDb } = await import("../../db/sqlite.ts");
const channels = await import("./channels.ts");
const { resolveLlmConfig, resolveEmbeddingConfig } = await import(
	"./config.ts"
);

afterAll(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ai_channel_configs", () => {
	it("migrates legacy settings into channel rows with official chat active", () => {
		workbenchDb.setSetting(
			"workbench_settings",
			JSON.stringify({
				apiKey: "sk-legacy",
				baseUrl: "https://api.deepseek.com",
				model: "deepseek-chat",
				llmProvider: "official",
				cloudToken: "cloud-token-123",
				cloudApiBase: "https://cloud.example.com",
				llmProvidersConfig: {
					kimi: {
						apiKey: "sk-kimi",
						baseUrl: "https://api.moonshot.cn/v1",
						model: "kimi-latest",
					},
				},
				embeddingProvider: "siliconflow",
				embeddingApiKey: "sk-sf",
				embeddingBaseUrl: "https://api.siliconflow.cn/v1",
				embeddingModel: "BAAI/bge-m3",
			}),
		);
		workbenchDb.setSetting(
			"searchConfig",
			JSON.stringify({ apiKeys: { tavily: "tvly-1" } }),
		);

		const chatRows = channels.listChannelConfigs("chat");
		const official = chatRows.find((r) => r.channel === "official");
		expect(official?.isActive).toBe(true);
		expect(official?.model).toBe("deepseek-chat");
		expect(chatRows.find((r) => r.provider === "kimi")?.apiKey).toBe("sk-kimi");

		// 官方通道解析：凭证实时取自设置里的 cloudToken，不经 env
		const chat = resolveLlmConfig();
		expect(chat.apiKey).toBe("cloud-token-123");
		expect(chat.baseUrl).toBe("https://cloud.example.com/api/ai/v1");
		expect(chat.model).toBe("deepseek-chat");

		// embedding：存量 custom provider 保持激活
		const embedding = resolveEmbeddingConfig();
		expect(embedding.apiKey).toBe("sk-sf");
		expect(embedding.baseUrl).toBe("https://api.siliconflow.cn/v1");
		expect(embedding.model).toBe("BAAI/bge-m3");

		// web_search：引擎 key 迁移为 custom 行（provider=engineId）
		const searchRows = channels.listChannelConfigs("web_search");
		expect(
			searchRows.some(
				(r) =>
					r.channel === "custom" &&
					r.provider === "tavily" &&
					r.apiKey === "tvly-1",
			),
		).toBe(true);
	});

	it("resolves custom channel config after activation switch", () => {
		const kimi = channels
			.listChannelConfigs("chat")
			.find((r) => r.provider === "kimi");
		expect(kimi).toBeDefined();
		channels.activateChannelConfig(kimi?.id as number);

		const resolved = resolveLlmConfig();
		expect(resolved.apiKey).toBe("sk-kimi");
		expect(resolved.baseUrl).toBe("https://api.moonshot.cn/v1");
		expect(resolved.model).toBe("kimi-latest");
	});

	it("activateOfficialChannels provisions and activates official rows for all capabilities", () => {
		channels.activateOfficialChannels();
		for (const cap of channels.CAPABILITY_IDS) {
			expect(channels.getActiveChannel(cap)?.channel).toBe("official");
		}
	});

	it("syncChannelsFromSettings writes through provider config and activation", () => {
		channels.syncChannelsFromSettings({
			llmProvider: "deepseek",
			apiKey: "sk-ds-new",
			baseUrl: "https://api.deepseek.com",
			model: "deepseek-reasoner",
			cloudToken: "tok",
		});
		const active = channels.getActiveChannel("chat");
		expect(active?.channel).toBe("custom");
		expect(active?.provider).toBe("deepseek");
		expect(active?.apiKey).toBe("sk-ds-new");
		expect(active?.model).toBe("deepseek-reasoner");
	});

	it("prevents custom model name from polluting official channel", () => {
		channels.activateOfficialChannels();
		// Passing custom model "k3" should NOT override official model "deepseek-chat"
		const resolved = resolveLlmConfig({ model: "k3" });
		expect(resolved.baseUrl).toContain("/api/ai/v1");
		expect(resolved.model).toBe("deepseek-chat");
	});

	it("routes custom endpoint & key directly to custom provider even if official was active", () => {
		channels.activateOfficialChannels();
		// If caller explicitly provides custom credentials and baseUrl, resolve directly as custom
		const resolved = resolveLlmConfig({
			apiKey: "sk-kimi-direct",
			baseUrl: "https://api.kimi.com/coding/v1",
			model: "k3",
		});
		expect(resolved.baseUrl).toBe("https://api.kimi.com/coding/v1");
		expect(resolved.apiKey).toBe("sk-kimi-direct");
		expect(resolved.model).toBe("k3");
	});
});
