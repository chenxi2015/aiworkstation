import { useRouter, useRouterState } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { getModuleByRoute } from "../../modules/registry";
import { workbenchContextActions } from "../../stores/workbenchContextStore";
import type { ChatContextItem } from "../../types/chatContext";
import type { PageBridge } from "../../types/pageBridge";
import {
	ChatWithBookmarksPanel,
	type ChatWithBookmarksPanelRef,
} from "../workbench/ai/chat/ChatWithBookmarksPanel";
import {
	WorkbenchDndProvider,
	type WorkbenchDragData,
} from "../workbench/dnd/WorkbenchDnd";
import { AiPanelSkeleton } from "../workbench/skeletons/AiPanelSkeleton";
import type {
	Category,
	Folder,
	WorkbenchItem,
	WorkbenchSettings,
} from "../workbench/types";

/** 面板浏览上下文：由当前页面声明（如书签页选中的文件夹），其他页面回落到全局模式 */
export interface AiPanelScope {
	selectedFolder: Folder | null;
	activeCategory?: Category;
}

/** 跨页面跳转请求：在非书签页点击搜索结果时暂存，跳转 /bookmarks 后由 WorkbenchApp 消费 */
export interface PendingFolderNavigation {
	folderId: number | null;
	category?: Category;
	targetItemId?: string | number;
}

type NavigateHandler = (
	folderId: number | null,
	category?: Category,
	targetItemId?: string | number,
) => void;

/** 页面注册给全局 DnD 上下文的拖拽处理器（无页面注册时没有任何拖拽源，回调自然不触发） */
export interface WorkbenchDndHandlers {
	gridFolderIds: number[];
	onMoveItemToFolder: (
		item: WorkbenchItem,
		sourceFolderId: number | null,
		targetFolderId: number,
	) => void;
	onMoveFolder: (folderId: number, targetParentId: number | null) => void;
	onMoveFolderToCategory?: (folderId: number, targetCategory: string) => void;
	onReorderFolders: (orderedIds: number[]) => void;
	onAttachToChat?: (data: WorkbenchDragData) => void;
}

/** 页面（WorkbenchApp）持有的最新数据，优先于根 loader 数据喂给 AI 面板 */
export interface AiPanelPageData {
	folders: Folder[];
	categories: string[];
	settings: WorkbenchSettings;
}

export interface AiPanelApi {
	sendPrompt: ChatWithBookmarksPanelRef["sendPrompt"];
	focusInput: () => void;
	openSearchTab: () => void;
	openChatTab: ChatWithBookmarksPanelRef["openChatTab"];
	addContextItem: (item: ChatContextItem) => void;
	setScope: (scope: AiPanelScope) => void;
	setPageData: (data: AiPanelPageData | null) => void;
	registerDataChangedHandler: (fn: (() => void) | null) => void;
	registerNavigateHandler: (fn: NavigateHandler | null) => void;
	registerDndHandlers: (handlers: WorkbenchDndHandlers | null) => void;
	consumePendingNavigation: () => PendingFolderNavigation | null;
	pageBridge: PageBridge | null;
	registerPageBridge: (bridge: PageBridge | null) => void;
}

const AiPanelContext = createContext<AiPanelApi | null>(null);

const DEFAULT_AI_PANEL_API: AiPanelApi = {
	sendPrompt: () => {},
	focusInput: () => {},
	openSearchTab: () => {},
	openChatTab: () => {},
	addContextItem: () => {},
	setScope: () => {},
	setPageData: () => {},
	registerDataChangedHandler: () => {},
	registerNavigateHandler: () => {},
	registerDndHandlers: () => {},
	consumePendingNavigation: () => null,
	pageBridge: null,
	registerPageBridge: () => {},
};

/** Global AI panel bridge: fallback to safe no-op when rendered outside AppShell to prevent crash */
export function useAiPanel(): AiPanelApi {
	const ctx = useContext(AiPanelContext);
	if (!ctx) {
		return DEFAULT_AI_PANEL_API;
	}
	return ctx;
}

/** 与 useWorkbenchNavigation 中 dynamicCategories 相同的推导逻辑，作为面板数据的兜底 */
function collectCategories(folders: Folder[]): string[] {
	const cats = new Set<string>();
	cats.add("工作台");
	for (const f of folders) {
		const cat = f.category?.trim();
		if (cat && cat !== "未分类") {
			cats.add(cat);
		}
	}
	cats.add("未分类");
	return Array.from(cats);
}

/**
 * 全局应用外壳：左侧为当前路由页面，右侧为常驻 AI 搜索与知识问答面板（跨导航单例，
 * 切换模块时对话状态保留），同时把书签拖拽上下文提升到全局，保证「拖书签进对话框」
 * 在任何页面都可用。
 */
export function AppShell({
	children,
	folders: loaderFolders,
	settings: loaderSettings,
}: {
	children: ReactNode;
	folders: Folder[];
	settings: WorkbenchSettings;
}) {
	const router = useRouter();
	const panelRef = useRef<ChatWithBookmarksPanelRef>(null);

	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const activeModule = getModuleByRoute(pathname)?.code ?? "workbench";

	useEffect(() => {
		workbenchContextActions.setActiveModule(activeModule);
	}, [activeModule]);

	const [scope, setScope] = useState<AiPanelScope>({ selectedFolder: null });
	const [pageData, setPageData] = useState<AiPanelPageData | null>(null);
	const [dndHandlers, setDndHandlers] = useState<WorkbenchDndHandlers | null>(
		null,
	);
	const dataChangedRef = useRef<(() => void) | null>(null);
	const navigateRef = useRef<NavigateHandler | null>(null);
	const pendingNavRef = useRef<PendingFolderNavigation | null>(null);

	const [pageBridge, setPageBridge] = useState<PageBridge | null>(null);

	// Clear active page bridge if navigation moved to a different module
	useEffect(() => {
		if (pageBridge && pageBridge.module !== activeModule) {
			setPageBridge(null);
		}
	}, [activeModule, pageBridge]);

	const folders = pageData?.folders ?? loaderFolders;
	const settings = pageData?.settings ?? loaderSettings;
	const categories = useMemo(
		() => pageData?.categories ?? collectCategories(loaderFolders),
		[pageData, loaderFolders],
	);

	// 页面已注册导航回调时直接页面内定位；否则暂存请求并跳转书签模块
	const handleNavigateToFolder = useCallback<NavigateHandler>(
		(folderId, category, targetItemId) => {
			if (navigateRef.current) {
				navigateRef.current(folderId, category, targetItemId);
				return;
			}
			pendingNavRef.current = {
				folderId,
				category,
				targetItemId,
			};
			void router.navigate({ to: "/bookmarks" });
		},
		[router],
	);

	// 页面已注册刷新回调（WorkbenchApp 的 reloadFromDb）时走页面刷新，面板数据随后由页面同步；
	// 否则失效根 loader，让面板拿到最新文件夹/设置
	const handleDataChanged = useCallback(() => {
		if (dataChangedRef.current) {
			dataChangedRef.current();
		} else {
			void router.invalidate();
		}
	}, [router]);

	const api = useMemo<AiPanelApi>(
		() => ({
			sendPrompt: (prompt, options) =>
				panelRef.current?.sendPrompt(prompt, options),
			focusInput: () => panelRef.current?.focusInput(),
			openSearchTab: () => panelRef.current?.openSearchTab(),
			openChatTab: (prompt, options) =>
				panelRef.current?.openChatTab(prompt, options),
			addContextItem: (item) => panelRef.current?.addContextItem(item),
			setScope,
			setPageData,
			registerDataChangedHandler: (fn) => {
				dataChangedRef.current = fn;
			},
			registerNavigateHandler: (fn) => {
				navigateRef.current = fn;
			},
			registerDndHandlers: setDndHandlers,
			consumePendingNavigation: () => {
				const pending = pendingNavRef.current;
				pendingNavRef.current = null;
				return pending;
			},
			pageBridge,
			registerPageBridge: setPageBridge,
		}),
		[pageBridge],
	);

	return (
		<AiPanelContext.Provider value={api}>
			<WorkbenchDndProvider
				gridFolderIds={dndHandlers?.gridFolderIds ?? []}
				onMoveItemToFolder={(item, sourceFolderId, targetFolderId) =>
					dndHandlers?.onMoveItemToFolder(item, sourceFolderId, targetFolderId)
				}
				onMoveFolder={(folderId, targetParentId) =>
					dndHandlers?.onMoveFolder(folderId, targetParentId)
				}
				onMoveFolderToCategory={(folderId, targetCategory) =>
					dndHandlers?.onMoveFolderToCategory?.(folderId, targetCategory)
				}
				onReorderFolders={(orderedIds) =>
					dndHandlers?.onReorderFolders(orderedIds)
				}
				onAttachToChat={(data) => dndHandlers?.onAttachToChat?.(data)}
			>
				<div className="app-shell h-screen flex overflow-hidden">
					{/* 流式 SSR 占位：面板骨架在 DOM 中先于真实面板下发（order 靠右显示），
					真实面板到达后由 CSS :has 自动隐藏，避免刷新时右侧边栏区域空白跳动 */}
					<AiPanelSkeleton />
					{/* Left Region: 当前路由页面（含各自的顶栏与内容） */}
					<div className="order-1 flex-1 flex flex-col min-w-0 min-h-0">
						{children}
					</div>
					{/* Right: 常驻 AI 搜索与知识问答中枢（全局单例，占满视口高度） */}
					<ChatWithBookmarksPanel
						ref={panelRef}
						className="order-2"
						selectedFolder={scope.selectedFolder}
						activeCategory={scope.activeCategory}
						activeModule={activeModule}
						pageBridge={pageBridge}
						folders={folders}
						categories={categories}
						settings={settings}
						onNavigateToFolder={handleNavigateToFolder}
						onDataChanged={handleDataChanged}
					/>
				</div>
			</WorkbenchDndProvider>
		</AiPanelContext.Provider>
	);
}
