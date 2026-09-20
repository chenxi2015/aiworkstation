import { resolve } from "node:path";
import { workbenchDb } from "../../db/sqlite.ts";
import { expandHome } from "../skills/roots.ts";

/**
 * Obsidian Vault 根目录解析约定：
 * - 设置项 `obsidianVaultDir`（workbench_settings JSON 内）为唯一配置来源；
 * - 未配置时回退 ~/Documents/Obsidian（与编辑器导入弹窗默认值一致）。
 */
export const DEFAULT_OBSIDIAN_VAULT_DIR = "~/Documents/Obsidian";

/** 读取用户配置的 Vault 路径（原始字符串，未展开）；未配置返回 null */
export function getConfiguredVaultDir(): string | null {
	try {
		const raw = workbenchDb.getSetting("workbench_settings");
		const parsed = raw ? JSON.parse(raw) : null;
		const configured = String(parsed?.obsidianVaultDir ?? "").trim();
		return configured || null;
	} catch {
		return null;
	}
}

/** 解析 Vault 根目录：返回展开后的绝对路径与原始配置值 */
export function resolveObsidianVaultDir(): {
	path: string;
	configured: string;
} {
	const configured = getConfiguredVaultDir() ?? DEFAULT_OBSIDIAN_VAULT_DIR;
	return { path: resolve(expandHome(configured)), configured };
}
