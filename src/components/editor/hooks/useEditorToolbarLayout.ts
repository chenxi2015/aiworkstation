import { useCallback, useMemo, useState } from "react";
import {
	getSettings,
	saveSettingsAsync,
} from "../../../services/storage/settingsStorage";
import {
	type EditorToolbarLayoutEntry,
	resolveMaterialTools,
} from "../toolbar/materialTools";

/**
 * 创作台工具栏素材工具布局：注册表 merge 用户配置（settings.editorToolbarLayout），
 * 与导航 navLayout / 工作台 workbenchLayout 同一约定。
 */
export function useEditorToolbarLayout() {
	const [layout, setLayout] = useState<EditorToolbarLayoutEntry[] | undefined>(
		() => getSettings().editorToolbarLayout,
	);

	const materialTools = useMemo(() => resolveMaterialTools(layout), [layout]);

	const saveLayout = useCallback((next: EditorToolbarLayoutEntry[]) => {
		setLayout(next);
		const settings = getSettings();
		void saveSettingsAsync({ ...settings, editorToolbarLayout: next });
	}, []);

	const resetLayout = useCallback(() => {
		setLayout(undefined);
		const settings = getSettings();
		const next = { ...settings };
		delete next.editorToolbarLayout;
		void saveSettingsAsync(next);
	}, []);

	return { materialTools, layout, saveLayout, resetLayout };
}
