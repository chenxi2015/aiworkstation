import { toast } from "@heroui/react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import {
	createContext,
	lazy,
	type ReactNode,
	Suspense,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useAiPanelResize } from "../../hooks/ai/useAiPanelResize";
import type { SaveFolderPayload } from "../../hooks/workbench/useWorkbenchFolderActions";
import { useCloudAuth } from "../../lib/cloud/useCloudAuth";
import type { NavLayoutEntry } from "../../modules/registry";
import { getModuleByRoute } from "../../modules/registry";
import { ExtensionBridgeService } from "../../services/extensionBridge";
import { WorkbenchStorageService } from "../../services/workbenchStorage";
import { workbenchContextActions } from "../../stores/workbenchContextStore";
import type { ChatContextItem } from "../../types/chatContext";
import type { PageBridge } from "../../types/pageBridge";
import { LoginModal } from "../cloud/LoginModal";
import {
	ChatWithBookmarksPanel,
	type ChatWithBookmarksPanelRef,
} from "../workbench/ai/chat/ChatWithBookmarksPanel";
import {
	WorkbenchDndProvider,
	type WorkbenchDragData,
} from "../workbench/dnd/WorkbenchDnd";
import { WorkbenchHeader } from "../workbench/layout/WorkbenchHeader";
import { AiPanelSkeleton } from "../workbench/skeletons/AiPanelSkeleton";
import type {
	Category,
	Folder,
	WorkbenchItem,
	WorkbenchSettings,
} from "../workbench/types";
import { FloatingDockProvider } from "./FloatingDock";

const FolderModal = lazy(() =>
	import("../workbench/FolderModal").then((m) => ({ default: m.FolderModal })),
);
const SettingsModal = lazy(() =>
	import("../workbench/SettingsModal").then((m) => ({
		default: m.SettingsModal,
	})),
);
const ExtensionIntroModal = lazy(() =>
	import("../workbench/ExtensionIntroModal").then((m) => ({
		default: m.ExtensionIntroModal,
	})),
);
const AIClassifyModal = lazy(() =>
	import("../workbench/ai/classify/AIClassifyModal").then((m) => ({
		default: m.AIClassifyModal,
	})),
);

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

/** 页面（WorkbenchApp）持有的最新数据，优先于根 loader 数据喂给 AI 面板与全局顶栏 */
export interface AiPanelPageData {
	folders: Folder[];
	categories: string[];
	settings: WorkbenchSettings;
	unclassified?: WorkbenchItem[];
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
	isCollapsed: boolean;
	setCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
	toggleCollapsed: () => void;
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
	isCollapsed: false,
	setCollapsed: () => {},
	toggleCollapsed: () => {},
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
	unclassified: loaderUnclassified = [],
}: {
	children: ReactNode;
	folders: Folder[];
	settings: WorkbenchSettings;
	unclassified?: WorkbenchItem[];
}) {
	const router = useRouter();
	const { isLoggedIn, isInitializing } = useCloudAuth();
	const panelRef = useRef<ChatWithBookmarksPanelRef>(null);
	const { panelWidth, isResizing, handleResizeStart } = useAiPanelResize();

	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const searchTab = useRouterState({
		select: (s) => (s.location.search as { tab?: string }).tab,
	});
	const activeModule = getModuleByRoute(pathname)?.code ?? "workbench";

	// 富文本编辑面：/editor 历史路由，或自媒体「创作台」/creator/studio（editor 已并入 creator）
	const isEditorSurface =
		pathname.startsWith("/editor") ||
		pathname.startsWith("/creator/studio") ||
		(pathname.startsWith("/creator") && searchTab === "studio");
	const [isCollapsed, setIsCollapsed] = useState<boolean>(
		() => isEditorSurface,
	);

	// Automatically collapse global AI panel when entering editor to release 100% canvas width
	useEffect(() => {
		if (isEditorSurface) {
			setIsCollapsed(true);
		}
	}, [isEditorSurface]);

	const toggleCollapsed = useCallback(() => {
		setIsCollapsed((prev) => !prev);
	}, []);

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

	// Global quick modals state
	const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
	const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
	const [isIntroModalOpen, setIsIntroModalOpen] = useState(false);
	const [isAIClassifyModalOpen, setIsAIClassifyModalOpen] = useState(false);

	// Clear active page bridge if navigation moved to a different module
	useEffect(() => {
		if (pageBridge && pageBridge.module !== activeModule) {
			setPageBridge(null);
		}
	}, [activeModule, pageBridge]);

	const folders = pageData?.folders ?? loaderFolders;
	const settings = pageData?.settings ?? loaderSettings;
	const unclassified = pageData?.unclassified ?? loaderUnclassified;
	const categories = useMemo(
		() => pageData?.categories ?? collectCategories(loaderFolders),
		[pageData, loaderFolders],
	);

	// 页面已注册导航回调且当前在书签模块时直接页面内定位；否则暂存请求并跳转书签模块
	const handleNavigateToFolder = useCallback<NavigateHandler>(
		(folderId, category, targetItemId) => {
			const isBookmarks = pathname === "/bookmarks";
			if (isBookmarks && navigateRef.current) {
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
		[pathname, router],
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

	const handleOpenExtension = useCallback(async () => {
		const installed = await ExtensionBridgeService.checkInstalled();
		if (installed) {
			const res = await ExtensionBridgeService.openBookmarksPanel();
			if (res.success) {
				toast.success("已呼起 AI Collector 插件侧边栏");
				return;
			}
		}
		setIsIntroModalOpen(true);
	}, []);

	const handleSaveFolder = useCallback(
		async (data: SaveFolderPayload) => {
			await WorkbenchStorageService.saveFolderToDb(data);
			toast.success("已保存文件夹至 SQLite 数据库");
			setIsFolderModalOpen(false);
			handleDataChanged();
		},
		[handleDataChanged],
	);

	const handleOpenSearch = useCallback(() => {
		setIsCollapsed(false);
		panelRef.current?.openSearchTab();
	}, []);

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
			isCollapsed,
			setCollapsed: setIsCollapsed,
			toggleCollapsed,
		}),
		[pageBridge, isCollapsed, toggleCollapsed],
	);

	// 1. Initializing state: show clean loader to avoid flash
	if (isInitializing) {
		return (
			<div className="h-screen w-screen flex flex-col items-center justify-center bg-background">
				<Loader2 className="w-8 h-8 animate-spin text-accent mb-3" />
				<p className="text-xs text-muted">正在连接工作台环境...</p>
			</div>
		);
	}

	// 2. Unauthenticated state: display global WeChat QR login gate
	if (!isLoggedIn) {
		return (
			<div className="h-screen w-screen flex flex-col items-center justify-center bg-background relative overflow-hidden select-none">
				{/* Decorative background glow */}
				<div className="absolute inset-0 bg-radial from-accent/5 to-transparent pointer-events-none" />

				{/* Global WeChat Login Gate Modal (Mandatory, non-closable) */}
				<LoginModal isOpen={true} mandatory={true} />
			</div>
		);
	}

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
				<div className="app-shell h-screen flex overflow-hidden relative">
					{/* 流式 SSR 占位：仅在未折叠时渲染骨架屏 */}
					{!isCollapsed && (
						<AiPanelSkeleton style={{ width: `${panelWidth}px` }} />
					)}
					{/* Left Region: 全局公共顶栏 + 子路由内容区 */}
					<div className="order-1 relative flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden">
						{/* Global persistent header: shared across all route transitions */}
						<WorkbenchHeader
							unclassifiedCount={unclassified.length}
							navLayout={settings.navLayout as NavLayoutEntry[] | undefined}
							onOpenSearch={handleOpenSearch}
							onOpenExtension={handleOpenExtension}
							onOpenSettings={() => setIsSettingsModalOpen(true)}
							onOpenCreateFolder={() => setIsFolderModalOpen(true)}
							onOpenAIClassifyTask={() => setIsAIClassifyModalOpen(true)}
						/>
						{/* Active route page content */}
						<FloatingDockProvider
							aiTrigger={{
								collapsed: isCollapsed,
								onOpen: () => setIsCollapsed(false),
							}}
						>
							<div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
								{children}
							</div>
						</FloatingDockProvider>
					</div>
					{/* Right: 常驻 AI 搜索与知识问答中枢（全局单例，占满视口高度）；
					    外层容器做宽度过渡：折叠时宽度收为 0，面板内容贴右缘随之滑出/滑入 */}
					<div
						style={{
							width: isCollapsed ? 0 : `${panelWidth}px`,
						}}
						className={`order-2 shrink-0 h-full overflow-hidden flex justify-end ${
							isResizing ? "" : "transition-[width] duration-300 ease-out"
						}`}
					>
						<ChatWithBookmarksPanel
							ref={panelRef}
							panelWidth={panelWidth}
							onResizeStart={handleResizeStart}
							selectedFolder={scope.selectedFolder}
							activeCategory={scope.activeCategory}
							activeModule={activeModule}
							pageBridge={pageBridge}
							folders={folders}
							categories={categories}
							settings={settings}
							onNavigateToFolder={handleNavigateToFolder}
							onDataChanged={handleDataChanged}
							onCollapse={() => setIsCollapsed(true)}
						/>
					</div>
				</div>

				{/* Global modals for topbar quick actions */}
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
					{isAIClassifyModalOpen && (
						<AIClassifyModal
							isOpen={isAIClassifyModalOpen}
							itemsToClassify={unclassified}
							folders={folders}
							settings={settings}
							onClose={() => setIsAIClassifyModalOpen(false)}
							onClassificationComplete={handleDataChanged}
							onOpenSettings={() => {
								setIsAIClassifyModalOpen(false);
								setIsSettingsModalOpen(true);
							}}
						/>
					)}
				</Suspense>
			</WorkbenchDndProvider>
		</AiPanelContext.Provider>
	);
}
