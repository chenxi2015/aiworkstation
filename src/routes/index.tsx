import { Button, EmptyState, InputGroup, toast } from "@heroui/react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import ThemeToggle from "../components/ThemeToggle";
import { AIClassifyModal } from "../components/workbench/AIClassifyModal";
import { BookmarkSyncModal } from "../components/workbench/BookmarkSyncModal";
import { FolderCard } from "../components/workbench/FolderCard";
import { FolderDetailPanel } from "../components/workbench/FolderDetailPanel";
import { FolderModal } from "../components/workbench/FolderModal";
import { FolderIcon, WorkbenchLogoIcon } from "../components/workbench/Icons";
import { SettingsModal } from "../components/workbench/SettingsModal";
import {
	CATEGORIES as DEFAULT_CATEGORIES,
	type Category,
	type Folder,
	type WorkbenchItem,
	type WorkbenchSettings,
} from "../components/workbench/types";
import { DEFAULT_SETTINGS, WorkbenchStorageService } from "../services/workbenchStorage";

export const Route = createFileRoute("/")({
	component: WorkbenchHome,
});

function WorkbenchHome() {
	const [folders, setFolders] = useState<Folder[]>([]);
	const [unclassified, setUnclassified] = useState<WorkbenchItem[]>([]);
	const [settings, setSettings] = useState<WorkbenchSettings>(DEFAULT_SETTINGS);
	const [activeCategory, setActiveCategory] = useState<Category>("工作台");
	const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
	const [searchQuery, setSearchQuery] = useState("");

	// Modals state
	const [folderModalState, setFolderModalState] = useState<{
		isOpen: boolean;
		folder: Folder | null;
	}>({ isOpen: false, folder: null });

	const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
	const [isAIClassifyModalOpen, setIsAIClassifyModalOpen] = useState(false);
	const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

	// Load data from SQLite database on mount
	const loadDataFromDb = async () => {
		const { folders: loadedFolders, unclassified: loadedUnclassified } =
			await WorkbenchStorageService.fetchAllFromDb();
		const loadedSettings = WorkbenchStorageService.getSettings();

		setFolders(loadedFolders);
		setUnclassified(loadedUnclassified);
		setSettings(loadedSettings);

		// If no folders exist but there are unclassified items, switch to unclassified view
		if (loadedFolders.length === 0 && loadedUnclassified.length > 0) {
			setActiveCategory("未分类");
		} else if (loadedFolders.length > 0 && selectedFolderId === null) {
			setSelectedFolderId(loadedFolders[0].id);
		}
	};

	useEffect(() => {
		loadDataFromDb();
	}, []);

	// Background polling to sync new bookmarks pushed by Chrome extension into SQLite
	useEffect(() => {
		const pollCollector = async () => {
			const { folders: latestFolders, unclassified: latestUnclassified } =
				await WorkbenchStorageService.fetchAllFromDb();

			setUnclassified((prev) => {
				if (latestUnclassified.length > prev.length) {
					toast.success(
						`⚡ SQLite 已同步接收 ${latestUnclassified.length - prev.length} 个新书签！`,
					);
				}
				return latestUnclassified;
			});
			setFolders(latestFolders);
		};

		const interval = setInterval(pollCollector, 2500);
		return () => clearInterval(interval);
	}, []);

	// Dynamic Category Tabs: Merge predefined categories with categories from created folders
	const dynamicCategories = useMemo(() => {
		const cats = new Set<string>();
		// Prepend standard categories
		for (const c of DEFAULT_CATEGORIES) {
			cats.add(c);
		}
		// Add any category from user/AI-created folders
		for (const f of folders) {
			if (f.category) cats.add(f.category);
		}
		return Array.from(cats);
	}, [folders]);

	// Filter folders by active category and search query
	const filteredFolders = useMemo(() => {
		let list = folders.filter((f) => f.category === activeCategory);
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			list = list.filter(
				(f) =>
					f.name.toLowerCase().includes(q) ||
					f.desc?.toLowerCase().includes(q) ||
					f.items.some(
						(item) =>
							item.name.toLowerCase().includes(q) ||
							item.url?.toLowerCase().includes(q) ||
							item.tags?.some((t) => t.toLowerCase().includes(q)),
					),
			);
		}
		return list;
	}, [folders, activeCategory, searchQuery]);

	// Filter unclassified items by search query
	const filteredUnclassified = useMemo(() => {
		if (!searchQuery.trim()) return unclassified;
		const q = searchQuery.toLowerCase();
		return unclassified.filter(
			(item) =>
				item.name.toLowerCase().includes(q) ||
				item.url?.toLowerCase().includes(q) ||
				item.description?.toLowerCase().includes(q) ||
				item.folderName?.toLowerCase().includes(q),
		);
	}, [unclassified, searchQuery]);

	// Selected folder instance
	const selectedFolder = useMemo(() => {
		if (!selectedFolderId) {
			return filteredFolders[0] || null;
		}
		return folders.find((f) => f.id === selectedFolderId) || filteredFolders[0] || null;
	}, [folders, selectedFolderId, filteredFolders]);

	// Switch category
	const handleCategoryChange = (cat: Category) => {
		setActiveCategory(cat);
		if (cat === "未分类") {
			setSelectedFolderId(null);
		} else {
			const firstInCat = folders.find((f) => f.category === cat);
			setSelectedFolderId(firstInCat ? firstInCat.id : null);
		}
	};

	// Save new or edited folder to SQLite
	const handleSaveFolder = async (data: {
		id?: number;
		name: string;
		category: string;
		desc: string;
	}) => {
		const updated = await WorkbenchStorageService.saveFolderToDb(data);
		setFolders(updated);
		setActiveCategory(data.category as Category);
		const createdOrEdited = data.id
			? updated.find((f) => f.id === data.id)
			: updated[updated.length - 1];
		if (createdOrEdited) {
			setSelectedFolderId(createdOrEdited.id);
		}
		setFolderModalState({ isOpen: false, folder: null });
		toast.success("已保存文件夹至 SQLite 数据库");
	};

	// Delete folder from SQLite
	const handleDeleteFolder = async (id: number) => {
		const updated = await WorkbenchStorageService.deleteFolderFromDb(id);
		setFolders(updated);
		if (selectedFolderId === id) {
			setSelectedFolderId(updated[0]?.id || null);
		}
		setFolderModalState({ isOpen: false, folder: null });
		toast.danger("文件夹已从 SQLite 中删除");
	};

	// Delete item from folder
	const handleDeleteItemFromFolder = async (item: WorkbenchItem, folderId: number) => {
		const { folders: updatedFolders, unclassified: updatedUnclassified } =
			await WorkbenchStorageService.deleteItemInDb(item.id || "", folderId);
		setFolders(updatedFolders);
		setUnclassified(updatedUnclassified);
		toast.success(`已从文件夹中移除「${item.name}」`);
	};

	// Move item between folders in SQLite
	const handleMoveItem = async (
		item: WorkbenchItem,
		sourceFolderId: number,
		targetFolderId: number,
	) => {
		const { folders: updatedFolders, unclassified: updatedUnclassified } =
			await WorkbenchStorageService.moveItemInDb(
				item.id || "",
				sourceFolderId,
				targetFolderId,
			);
		setFolders(updatedFolders);
		setUnclassified(updatedUnclassified);
		toast.success(`已将「${item.name}」移动到目标文件夹`);
	};

	// Delete item from unclassified pool in SQLite
	const handleDeleteUnclassifiedItem = async (item: WorkbenchItem) => {
		const { unclassified: updatedUnclassified } =
			await WorkbenchStorageService.deleteItemInDb(item.id || "", null);
		setUnclassified(updatedUnclassified);
		toast.success(`已从未分类池中移除「${item.name}」`);
	};

	// Handle successful AI classification callback
	const handleClassificationComplete = (
		updatedFolders: Folder[],
		updatedUnclassified: WorkbenchItem[],
	) => {
		setFolders(updatedFolders);
		setUnclassified(updatedUnclassified);
		if (updatedFolders.length > 0) {
			setActiveCategory(updatedFolders[0].category || "工作台");
			setSelectedFolderId(updatedFolders[0].id);
		}
	};

	// Handle bookmarks imported
	const handleBookmarksImported = (
		newUnclassified: WorkbenchItem[],
		triggerAICallback?: boolean,
	) => {
		setUnclassified(newUnclassified);
		setActiveCategory("未分类");
		if (triggerAICallback) {
			setIsAIClassifyModalOpen(true);
		}
	};

	return (
		<div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-accent-soft selection:text-accent-soft-foreground">
			{/* Topbar Navigation */}
			<header className="sticky top-0 z-40 bg-surface/80 border-b border-border px-6 h-15 flex items-center gap-4 justify-between backdrop-blur-md">
				{/* Left: Brand */}
				<div className="flex items-center gap-2.5 shrink-0 pr-2">
					<div className="w-8 h-8 rounded-xl bg-accent text-accent-foreground flex items-center justify-center shadow-sm">
						<WorkbenchLogoIcon className="w-4 h-4" />
					</div>
					<div className="flex flex-col">
						<span className="font-semibold text-sm tracking-tight text-foreground leading-none">
							AI 工作台
						</span>
						<span className="text-[10px] text-muted tracking-tight font-mono mt-0.5">
							SQLite 驱动
						</span>
					</div>
				</div>

				{/* Center: Category Tabs */}
				<nav className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 py-1 px-2">
					{dynamicCategories.map((cat) => {
						const isActive = cat === activeCategory;
						const count =
							cat === "未分类"
								? unclassified.length
								: folders.filter((f) => f.category === cat).length;

						// Hide empty categories unless it's active or is standard
						if (count === 0 && !["工作台", "未分类"].includes(cat) && !isActive) {
							return null;
						}

						return (
							<button
								key={cat}
								type="button"
								onClick={() => handleCategoryChange(cat)}
								className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
									isActive
										? "bg-accent-soft text-accent font-semibold shadow-xs"
										: "text-muted hover:text-foreground hover:bg-surface-secondary"
								}`}
							>
								<span>{cat}</span>
								{count > 0 && (
									<span
										className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
											cat === "未分类"
												? "bg-danger/15 text-danger font-bold"
												: isActive
													? "bg-accent/20 text-accent"
													: "bg-surface-secondary text-muted"
										}`}
									>
										{count}
									</span>
								)}
							</button>
						);
					})}
				</nav>

				{/* Right: Actions */}
				<div className="flex items-center gap-2 shrink-0">
					{/* AI Classify Button */}
					<Button
						variant={unclassified.length > 0 ? "primary" : "secondary"}
						size="sm"
						className="rounded-full shadow-xs"
						onPress={() => setIsAIClassifyModalOpen(true)}
					>
						⚡ AI 智能归类
						{unclassified.length > 0 && (
							<span className="ml-1 px-1.5 py-0.2 text-[10px] bg-background/20 rounded-full font-mono">
								{unclassified.length}
							</span>
						)}
					</Button>

					{/* Import/Sync Bookmarks Button */}
					<Button
						variant="secondary"
						size="sm"
						className="rounded-full"
						onPress={() => setIsSyncModalOpen(true)}
					>
						📥 导入书签
					</Button>

					{/* New Folder Button */}
					<Button
						variant="ghost"
						size="sm"
						className="rounded-full"
						onPress={() => setFolderModalState({ isOpen: true, folder: null })}
					>
						+ 新建文件夹
					</Button>

					{/* Settings */}
					<Button
						variant="ghost"
						size="sm"
						className="rounded-full h-8 w-8 p-0"
						onPress={() => setIsSettingsModalOpen(true)}
						aria-label="设置"
					>
						⚙️
					</Button>

					<ThemeToggle />
				</div>
			</header>

			{/* Main Workspace Layout */}
			<div className="flex-1 flex w-full">
				{/* Left Main Content */}
				<main className="flex-1 p-8 lg:p-9 min-w-0 flex flex-col">
					{/* Header Title & Actions Bar */}
					<div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-6">
						<div>
							<div className="flex items-center gap-2">
								<h1 className="text-2xl font-bold tracking-tight text-foreground">
									{activeCategory}
								</h1>
								<span className="text-xs font-medium text-muted">
									{activeCategory === "未分类"
										? `${unclassified.length} 条待整理书签`
										: `${filteredFolders.length} 个文件夹`}
								</span>
							</div>
							<p className="text-xs text-muted mt-1 leading-relaxed max-w-xl">
								{activeCategory === "未分类"
									? "所有从 Chrome 扩展一键同步并存入 SQLite 数据库的书签缓冲池。点击「⚡ AI 智能归类」，DeepSeek 将深度分析并自动生成主题文件夹。"
									: "点击任意文件夹卡片，右侧侧边栏将呈现该文件夹在 SQLite 中归集的全部书签、九宫格预览与快捷外链。"}
							</p>
						</div>

						{/* Search Bar */}
						<div className="w-full sm:w-64">
							<InputGroup className="w-full h-8 text-xs">
								<InputGroup.Input
									type="text"
									placeholder="搜索文件夹、书签或标签..."
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									className="text-xs h-8"
								/>
								{searchQuery && (
									<InputGroup.Suffix className="pr-1.5">
										<button
											type="button"
											onClick={() => setSearchQuery("")}
											className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] text-muted hover:text-foreground cursor-pointer"
										>
											✕
										</button>
									</InputGroup.Suffix>
								)}
							</InputGroup>
						</div>
					</div>

					{/* View 1: Unclassified Pool Special View */}
					{activeCategory === "未分类" ? (
						<div className="flex-1 flex flex-col">
							{filteredUnclassified.length === 0 ? (
								<EmptyState className="py-20 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-3xl bg-surface p-8">
									<div className="w-14 h-14 rounded-2xl bg-surface-secondary flex items-center justify-center text-muted mb-3.5 opacity-50">
										📥
									</div>
									<h3 className="text-sm font-semibold text-foreground mb-1">
										未分类池暂无待整理内容
									</h3>
									<p className="text-xs text-muted mb-4 max-w-sm">
										在 Chrome 浏览器侧边栏扩展中，点击「⚡ 一键同步至工作台」即可将 2000+ 书签快速写入本地 SQLite。
									</p>
								</EmptyState>
							) : (
								<div className="flex flex-col gap-4">
									{/* Top AI Action Banner */}
									<div className="p-4 rounded-2xl bg-gradient-to-r from-accent/10 via-surface-secondary to-surface-secondary border border-accent/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
										<div className="flex items-center gap-3">
											<div className="w-10 h-10 rounded-xl bg-accent text-accent-foreground flex items-center justify-center text-lg font-bold shadow-sm">
												⚡
											</div>
											<div>
												<div className="font-semibold text-xs text-foreground">
													SQLite 已就绪 {unclassified.length} 条从插件同步的书签 TDK
												</div>
												<div className="text-[11px] text-muted">
													点击按钮，由 DeepSeek 深度分析网页标题、描述及原路径，自动创建主题文件夹并入库。
												</div>
											</div>
										</div>

										<Button
											variant="primary"
											size="sm"
											className="rounded-full shadow-sm shrink-0"
											onPress={() => setIsAIClassifyModalOpen(true)}
										>
											⚡ 启动 DeepSeek 一键智能分类
										</Button>
									</div>

									{/* Unclassified Items Grid */}
									<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
										{filteredUnclassified.map((item, idx) => (
											<div
												key={item.id || idx}
												className="p-4 rounded-2xl bg-surface border border-border hover:border-accent/40 transition-all flex flex-col justify-between gap-2 shadow-xs group"
											>
												<div>
													<div className="flex items-start justify-between gap-2 mb-1.5">
														<a
															href={item.url}
															target="_blank"
															rel="noreferrer"
															className="font-medium text-xs text-foreground hover:text-accent line-clamp-1 flex-1 font-sans"
															title={item.name}
														>
															{item.name}
														</a>
														<button
															type="button"
															onClick={() => handleDeleteUnclassifiedItem(item)}
															className="text-muted hover:text-danger p-0.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
															title="删除"
														>
															✕
														</button>
													</div>

													<p className="text-[11px] text-muted line-clamp-2 leading-relaxed mb-2">
														{item.description || item.summary || item.url}
													</p>
												</div>

												<div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40 text-[10px] text-muted">
													<span className="truncate max-w-[160px]" title={item.url}>
														{item.folderName ? `📁 ${item.folderName}` : item.url}
													</span>
													{item.createdAt && <span>{item.createdAt}</span>}
												</div>
											</div>
										))}
									</div>
								</div>
							)}
						</div>
					) : (
						/* View 2: Regular Category Folder Grid */
						<div className="flex-1 flex flex-col">
							{filteredFolders.length === 0 ? (
								<EmptyState className="py-20 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-3xl bg-surface p-8">
									<div className="w-14 h-14 rounded-2xl bg-surface-secondary flex items-center justify-center text-muted mb-3.5 opacity-50">
										<FolderIcon className="w-7 h-7" />
									</div>
									<p className="text-xs text-muted mb-2 font-medium text-foreground">
										该分类下暂无已归类的文件夹
									</p>
									<p className="text-xs text-muted mb-4 max-w-sm">
										在 Chrome 扩展中点击「一键同步至工作台」，随后在「未分类」中点击「⚡ AI 智能归类」即可自动生成并保存至 SQLite。
									</p>
									<Button
										variant="primary"
										size="sm"
										className="rounded-full"
										onPress={() => setFolderModalState({ isOpen: true, folder: null })}
									>
										+ 手动新建文件夹
									</Button>
								</EmptyState>
							) : (
								<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
									{filteredFolders.map((folder) => (
										<FolderCard
											key={folder.id}
											folder={folder}
											isSelected={folder.id === selectedFolder?.id}
											onClick={() => setSelectedFolderId(folder.id)}
										/>
									))}
								</div>
							)}
						</div>
					)}
				</main>

				{/* Right Detail Panel (Active when not in unclassified) */}
				{activeCategory !== "未分类" && (
					<FolderDetailPanel
						folder={selectedFolder}
						allFolders={folders}
						onEdit={(folder) => setFolderModalState({ isOpen: true, folder })}
						onDeleteItem={(item, folderId) =>
							handleDeleteItemFromFolder(item, folderId)
						}
						onMoveItem={handleMoveItem}
					/>
				)}
			</div>

			{/* Folder Modal */}
			<FolderModal
				isOpen={folderModalState.isOpen}
				folder={folderModalState.folder}
				defaultCategory={activeCategory === "未分类" ? "工作台" : activeCategory}
				onClose={() => setFolderModalState({ isOpen: false, folder: null })}
				onSave={handleSaveFolder}
				onDelete={handleDeleteFolder}
			/>

			{/* AI Classify Modal */}
			<AIClassifyModal
				isOpen={isAIClassifyModalOpen}
				itemsToClassify={unclassified}
				folders={folders}
				settings={settings}
				onClose={() => setIsAIClassifyModalOpen(false)}
				onClassificationComplete={handleClassificationComplete}
			/>

			{/* Bookmark Sync Modal */}
			<BookmarkSyncModal
				isOpen={isSyncModalOpen}
				onClose={() => setIsSyncModalOpen(false)}
				onBookmarksImported={handleBookmarksImported}
			/>

			{/* Settings Modal */}
			<SettingsModal
				isOpen={isSettingsModalOpen}
				onClose={() => setIsSettingsModalOpen(false)}
				onSettingsUpdated={(newSettings) => setSettings(newSettings)}
			/>
		</div>
	);
}
