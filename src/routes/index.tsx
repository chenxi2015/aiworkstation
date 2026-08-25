import { Button, EmptyState, toast } from "@heroui/react";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import ThemeToggle from "../components/ThemeToggle";
import { FolderCard } from "../components/workbench/FolderCard";
import { FolderDetailPanel } from "../components/workbench/FolderDetailPanel";
import { FolderModal } from "../components/workbench/FolderModal";
import { FolderIcon, WorkbenchLogoIcon } from "../components/workbench/Icons";
import {
	CATEGORIES,
	type Category,
	type Folder,
	INITIAL_FOLDERS,
} from "../components/workbench/types";

export const Route = createFileRoute("/")({
	component: WorkbenchHome,
});

function WorkbenchHome() {
	const [folders, setFolders] = useState<Folder[]>(INITIAL_FOLDERS);
	const [activeCategory, setActiveCategory] = useState<Category>("工作台");
	const [selectedFolderId, setSelectedFolderId] = useState<number | null>(1);
	const [modalState, setModalState] = useState<{
		isOpen: boolean;
		folder: Folder | null;
	}>({
		isOpen: false,
		folder: null,
	});

	// Filter folders by active category
	const filteredFolders = useMemo(() => {
		return folders.filter((f) => f.category === activeCategory);
	}, [folders, activeCategory]);

	// Selected folder instance
	const selectedFolder = useMemo(() => {
		if (!selectedFolderId) return null;
		return folders.find((f) => f.id === selectedFolderId) || null;
	}, [folders, selectedFolderId]);

	// Switch category
	const handleCategoryChange = (cat: Category) => {
		setActiveCategory(cat);
		// Find the first folder in the category if available
		const firstInCat = folders.find((f) => f.category === cat);
		setSelectedFolderId(firstInCat ? firstInCat.id : null);
	};

	// Open modal for creating folder
	const handleOpenCreateModal = () => {
		setModalState({ isOpen: true, folder: null });
	};

	// Open modal for editing folder
	const handleOpenEditModal = (folder: Folder) => {
		setModalState({ isOpen: true, folder });
	};

	// Close modal
	const handleCloseModal = () => {
		setModalState({ isOpen: false, folder: null });
	};

	// Save new or edited folder
	const handleSave = (data: {
		id?: number;
		name: string;
		category: string;
		desc: string;
	}) => {
		const today = new Date().toISOString().split("T")[0];

		if (data.id) {
			// Edit existing folder
			setFolders((prev) =>
				prev.map((f) =>
					f.id === data.id
						? {
								...f,
								name: data.name,
								category: data.category,
								desc: data.desc,
							}
						: f,
				),
			);
			toast.success("已保存修改");
		} else {
			// Create new folder
			const newId = Date.now();
			const newFolder: Folder = {
				id: newId,
				name: data.name,
				category: data.category,
				desc: data.desc,
				createdAt: today,
				items: [],
			};
			setFolders((prev) => [...prev, newFolder]);
			setActiveCategory(data.category as Category);
			setSelectedFolderId(newId);
			toast.success("文件夹已创建");
		}
		handleCloseModal();
	};

	// Delete folder
	const handleDelete = (id: number) => {
		setFolders((prev) => prev.filter((f) => f.id !== id));
		if (selectedFolderId === id) {
			setSelectedFolderId(null);
		}
		handleCloseModal();
		toast.danger("文件夹已删除");
	};

	return (
		<div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-accent-soft selection:text-accent-soft-foreground">
			{/* Topbar Navigation */}
			<header className="sticky top-0 z-40 bg-surface/80 border-b border-border px-6 h-15 flex items-center gap-4 justify-between backdrop-blur-md">
				{/* Left: Brand */}
				<div className="flex items-center gap-2.5 shrink-0 pr-4">
					<div className="w-8 h-8 rounded-xl bg-accent text-accent-foreground flex items-center justify-center shadow-sm">
						<WorkbenchLogoIcon className="w-4 h-4" />
					</div>
					<span className="font-semibold text-sm tracking-tight text-foreground">
						AI 工作台
					</span>
				</div>

				{/* Center: Category Tabs */}
				<nav className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 py-1 px-2">
					{CATEGORIES.map((cat) => {
						const isActive = cat === activeCategory;
						return (
							<button
								key={cat}
								type="button"
								onClick={() => handleCategoryChange(cat)}
								className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 cursor-pointer ${
									isActive
										? "bg-accent-soft text-accent font-semibold shadow-xs"
										: "text-muted hover:text-foreground hover:bg-surface-secondary"
								}`}
							>
								{cat}
							</button>
						);
					})}
				</nav>

				{/* Right: Actions */}
				<div className="flex items-center gap-2.5 shrink-0">
					<ThemeToggle />
					<Button
						variant="primary"
						size="sm"
						className="rounded-full"
						onPress={handleOpenCreateModal}
					>
						<svg
							role="img"
							aria-label="添加图标"
							className="w-3.5 h-3.5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.2"
							strokeLinecap="round"
						>
							<path d="M12 5v14M5 12h14" />
						</svg>
						新建文件夹
					</Button>
				</div>
			</header>

			{/* Main Workspace Layout */}
			<div className="flex-1 flex w-full">
				{/* Left Grid Area */}
				<main className="flex-1 p-8 lg:p-9 min-w-0">
					{/* Header Title & Count */}
					<div className="flex items-baseline justify-between mb-1.5">
						<h1 className="text-2xl font-bold tracking-tight text-foreground">
							{activeCategory}
						</h1>
						<span className="text-xs font-medium text-muted">
							{filteredFolders.length > 0
								? `${filteredFolders.length} 个文件夹`
								: ""}
						</span>
					</div>

					<p className="text-xs text-muted mb-7 max-w-xl leading-relaxed">
						这些文件夹会将你收藏的工具和内容按某项工作进行归集，点击任意文件夹查看详情。
					</p>

					{/* Folder Cards Grid */}
					{filteredFolders.length === 0 ? (
						<EmptyState className="py-20 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-3xl bg-surface p-8">
							<div className="w-14 h-14 rounded-2xl bg-surface-secondary flex items-center justify-center text-muted mb-3.5 opacity-50">
								<FolderIcon className="w-7 h-7" />
							</div>
							<p className="text-xs text-muted mb-4">
								该分类下还没有文件夹，点击下方按钮开始归集
							</p>
							<Button
								variant="primary"
								size="sm"
								className="rounded-full"
								onPress={handleOpenCreateModal}
							>
								新建文件夹
							</Button>
						</EmptyState>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
							{filteredFolders.map((folder) => (
								<FolderCard
									key={folder.id}
									folder={folder}
									isSelected={folder.id === selectedFolderId}
									onClick={() => setSelectedFolderId(folder.id)}
								/>
							))}
						</div>
					)}
				</main>

				{/* Right Detail Panel */}
				<FolderDetailPanel
					folder={selectedFolder}
					onEdit={handleOpenEditModal}
				/>
			</div>

			{/* Modal Dialog */}
			<FolderModal
				isOpen={modalState.isOpen}
				folder={modalState.folder}
				defaultCategory={activeCategory}
				onClose={handleCloseModal}
				onSave={handleSave}
				onDelete={handleDelete}
			/>
		</div>
	);
}
