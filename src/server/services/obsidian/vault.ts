import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
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

/**
 * 新建本地 Vault：在父目录下创建以 name 命名的文件夹，并写入 .obsidian 标记目录
 * （与 Obsidian「新建仓库」一致，.obsidian 存在即被识别为 Vault）。
 */
export function createLocalVault(
	parentDir: string,
	name: string,
): { success: boolean; path?: string; error?: string } {
	const cleanName = name.trim();
	if (!cleanName) return { success: false, error: "仓库名称不能为空" };
	if (/[/\\]/.test(cleanName)) {
		return { success: false, error: "仓库名称不能包含路径分隔符" };
	}
	try {
		const parent = resolve(expandHome(parentDir.trim() || "~"));
		if (!existsSync(parent)) return { success: false, error: "父目录不存在" };
		const target = join(parent, cleanName);
		if (existsSync(target)) {
			return { success: false, error: "同名文件夹已存在" };
		}
		mkdirSync(join(target, ".obsidian"), { recursive: true });
		return { success: true, path: target };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : "创建仓库失败",
		};
	}
}
