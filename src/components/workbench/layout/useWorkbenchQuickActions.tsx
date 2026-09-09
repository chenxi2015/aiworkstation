import { toast } from "@heroui/react";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import type { SaveFolderPayload } from "../../../hooks/workbench/useWorkbenchFolderActions";
import { ExtensionBridgeService } from "../../../services/extensionBridge";
import { WorkbenchStorageService } from "../../../services/workbenchStorage";
import type { Folder } from "../types";

const FolderModal = lazy(() =>
	import("../FolderModal").then((m) => ({ default: m.FolderModal })),
);
const SettingsModal = lazy(() =>
	import("../SettingsModal").then((m) => ({ default: m.SettingsModal })),
);
const ExtensionIntroModal = lazy(() =>
	import("../ExtensionIntroModal").then((m) => ({
		default: m.ExtensionIntroModal,
	})),
);

/**
 * 非书签模块页共享的头部快捷动作：打开插件 / 新建文件夹 / 设置。
 * 书签模块（WorkbenchApp）拥有自己的完整实现，不使用本 hook。
 * 「导入书签」仅书签模块保留，因此这里不暴露 onOpenSync；
 * 插件未安装时弹出插件介绍 / 下载弹窗作为引导兜底。
 */
export function useWorkbenchQuickActions({ folders }: { folders: Folder[] }) {
	const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
	const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
	const [isIntroModalOpen, setIsIntroModalOpen] = useState(false);

	// 与 useWorkbenchNavigation.dynamicCategories 保持一致的分类集合
	const categories = useMemo(() => {
		const cats = new Set<string>(["工作台"]);
		for (const f of folders) {
			const cat = f.category?.trim();
			if (cat && cat !== "未分类") cats.add(cat);
		}
		cats.add("未分类");
		return Array.from(cats);
	}, [folders]);

	const openExtension = useCallback(async () => {
		const installed = await ExtensionBridgeService.checkInstalled();
		if (installed) {
			const res = await ExtensionBridgeService.openBookmarksPanel();
			if (res.success) {
				toast.success("已呼起 AI Collector 插件侧边栏");
				return;
			}
		}
		// 插件未安装或呼起失败时，弹出插件介绍 / 下载弹窗
		setIsIntroModalOpen(true);
	}, []);

	const handleSaveFolder = useCallback(async (data: SaveFolderPayload) => {
		await WorkbenchStorageService.saveFolderToDb(data);
		toast.success("已保存文件夹至 SQLite 数据库");
		setIsFolderModalOpen(false);
	}, []);

	const actionProps = {
		onOpenExtension: openExtension,
		onOpenCreateFolder: () => setIsFolderModalOpen(true),
		onOpenSettings: () => setIsSettingsModalOpen(true),
	};

	const modals = (
		<Suspense fallback={null}>
			{isFolderModalOpen && (
				<FolderModal
					isOpen={isFolderModalOpen}
					folder={null}
					folders={folders}
					categories={categories}
					defaultCategory="工作台"
					onClose={() => setIsFolderModalOpen(false)}
					onSave={handleSaveFolder}
					onDelete={() => {}}
				/>
			)}
			{isSettingsModalOpen && (
				<SettingsModal
					isOpen={isSettingsModalOpen}
					onClose={() => setIsSettingsModalOpen(false)}
				/>
			)}
			{isIntroModalOpen && (
				<ExtensionIntroModal
					isOpen={isIntroModalOpen}
					onClose={() => setIsIntroModalOpen(false)}
				/>
			)}
		</Suspense>
	);

	return { actionProps, modals };
}
