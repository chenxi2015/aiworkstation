import {
	DEFAULT_STYLE_PRESETS,
	type EditorStylePreset,
} from "../../components/editor/types.ts";
import type { WorkbenchSettings } from "../../components/workbench/types.ts";
import { workbenchDb } from "../db/sqlite.ts";

/**
 * 获取生效的行文风格 preset 列表。
 * 优先级：SQLite 中存储的自定义预设 > 内置 DEFAULT_STYLE_PRESETS
 */
export function getEffectiveEditorPresets(): EditorStylePreset[] {
	try {
		const raw = workbenchDb.getSetting("workbench_settings");
		if (raw) {
			const settings = JSON.parse(raw) as Partial<WorkbenchSettings>;
			if (
				Array.isArray(settings.editorStylePresets) &&
				settings.editorStylePresets.length > 0
			) {
				const customMap = new Map(
					settings.editorStylePresets.map((p) => [p.id, p]),
				);
				const merged: EditorStylePreset[] = DEFAULT_STYLE_PRESETS.map(
					(defaultPreset) => {
						const custom = customMap.get(defaultPreset.id);
						if (custom) {
							customMap.delete(defaultPreset.id);
							return { ...defaultPreset, ...custom };
						}
						return defaultPreset;
					},
				);
				for (const extra of customMap.values()) {
					merged.push(extra);
				}
				return merged;
			}
		}
	} catch (err) {
		console.warn("[editorPresets] Failed to load custom presets:", err);
	}
	return DEFAULT_STYLE_PRESETS;
}

/**
 * 根据 presetId 解析对应的改写行文规则 prompt
 */
export function resolveEditorPresetPrompt(presetId?: string): string {
	if (!presetId) return "";
	const presets = getEffectiveEditorPresets();
	const matched = presets.find((p) => p.id === presetId);
	if (!matched?.promptRules) return "";
	return `\n\n【行文风格要求 - ${matched.label}】\n${matched.promptRules}`;
}
