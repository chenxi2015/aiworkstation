import { Popover } from "@heroui/react";
import { Check, ChevronDown, Folder as FolderIconLucide, Search, X } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import type { Folder } from "../types";

export interface FolderCascaderPickerProps {
	/** Available folder candidates (excluding current folder and its descendants) */
	folders: Folder[];
	/** All top-level categories / spaces (excluding "未分类" and "工作台") */
	categories: string[];
	/** Currently selected space/category */
	selectedCategory: string;
	/** Currently selected parent folder ID, null indicates top-level space root */
	selectedParentId: number | null;
	/** Callback when selection changes */
	onChange: (target: { category: string; parentId: number | null }) => void;
	/** Additional className for trigger container */
	className?: string;
}

interface TreeNode {
	folder: Folder;
	depth: number;
	children: TreeNode[];
}

/**
 * Multi-level Cascading Folder & Category Picker (similar to Province/City selector).
 * Features category tabs, hierarchical folder drill-down, and clear breadcrumb preview.
 */
export const FolderCascaderPicker = memo(function FolderCascaderPicker({
	folders = [],
	categories = [],
	selectedCategory,
	selectedParentId,
	onChange,
	className = "",
}: FolderCascaderPickerProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	// Filter out invalid pseudo-categories
	const sanitizedCategories = useMemo(() => {
		const set = new Set<string>();
		for (const c of categories) {
			const trimmed = c?.trim();
			if (trimmed && trimmed !== "未分类" && trimmed !== "工作台") {
				set.add(trimmed);
			}
		}
		for (const f of folders) {
			const cat = f.category?.trim();
			if (cat && cat !== "未分类" && cat !== "工作台") {
				set.add(cat);
			}
		}
		if (selectedCategory && selectedCategory !== "未分类" && selectedCategory !== "工作台") {
			set.add(selectedCategory);
		}
		return Array.from(set);
	}, [categories, folders, selectedCategory]);

	// Category counts map
	const categoryCountMap = useMemo(() => {
		const map = new Map<string, number>();
		for (const f of folders) {
			const cat = f.category?.trim();
			if (cat && cat !== "未分类" && cat !== "工作台") {
				map.set(cat, (map.get(cat) || 0) + 1);
			}
		}
		return map;
	}, [folders]);

	// Active Tab state (default to currently selected category or first available)
	const [activeTab, setActiveTab] = useState<string>(() => {
		if (selectedCategory && sanitizedCategories.includes(selectedCategory)) {
			return selectedCategory;
		}
		return sanitizedCategories[0] || "全部";
	});

	// Synchronize active tab when modal opens or selectedCategory changes
	useEffect(() => {
		if (isOpen) {
			if (selectedCategory && sanitizedCategories.includes(selectedCategory)) {
				setActiveTab(selectedCategory);
			} else if (sanitizedCategories.length > 0) {
				setActiveTab(sanitizedCategories[0]);
			}
			setSearchQuery("");
		}
	}, [isOpen, selectedCategory, sanitizedCategories]);

	// Build breadcrumb trail for selected parent folder
	const selectedBreadcrumbs = useMemo(() => {
		if (selectedParentId == null) {
			return {
				category: selectedCategory || sanitizedCategories[0] || "默认空间",
				folderPath: [] as string[],
				isRoot: true,
			};
		}

		const folderMap = new Map<number, Folder>(folders.map((item) => [item.id, item]));
		const path: string[] = [];
		let currentId: number | null | undefined = selectedParentId;
		let detectedCategory = selectedCategory;

		const visited = new Set<number>();
		while (currentId != null && folderMap.has(currentId) && !visited.has(currentId)) {
			visited.add(currentId);
			const targetFolder = folderMap.get(currentId);
			if (targetFolder) {
				path.unshift(targetFolder.name);
				if (targetFolder.category) detectedCategory = targetFolder.category;
				currentId = targetFolder.parentId;
			} else {
				break;
			}
		}

		return {
			category: detectedCategory || sanitizedCategories[0] || "默认空间",
			folderPath: path,
			isRoot: false,
		};
	}, [selectedParentId, selectedCategory, folders, sanitizedCategories]);

	// Build hierarchical folder tree for the current view
	const treeNodes = useMemo(() => {
		const targetFolders = folders.filter((f) => {
			const cat = f.category?.trim();
			if (!cat || cat === "未分类" || cat === "工作台") return false;
			if (activeTab === "全部") return true;
			return cat === activeTab;
		});

		// If user is searching, return flattened list matching query
		const trimmedQuery = searchQuery.trim().toLowerCase();
		if (trimmedQuery) {
			return targetFolders
				.filter(
					(f) =>
						f.name.toLowerCase().includes(trimmedQuery) ||
						Boolean(f.category?.toLowerCase().includes(trimmedQuery)),
				)
				.map((f) => ({ folder: f, depth: 0, children: [] }));
		}

		// Otherwise, construct nested tree by parentId
		const folderMap = new Map(targetFolders.map((f) => [f.id, f]));
		const childrenMap = new Map<number, Folder[]>();
		const rootFolders: Folder[] = [];

		for (const f of targetFolders) {
			if (f.parentId != null && folderMap.has(f.parentId)) {
				const siblings = childrenMap.get(f.parentId) || [];
				siblings.push(f);
				childrenMap.set(f.parentId, siblings);
			} else {
				rootFolders.push(f);
			}
		}

		const buildBranch = (folder: Folder, depth: number): TreeNode => {
			const children = (childrenMap.get(folder.id) || []).map((child) =>
				buildBranch(child, depth + 1),
			);
			return { folder, depth, children };
		};

		return rootFolders.map((root) => buildBranch(root, 0));
	}, [folders, activeTab, searchQuery]);

	// Flatten tree with depth for clean rendering
	const flattenedDisplayList = useMemo(() => {
		const list: Array<{ folder: Folder; depth: number }> = [];
		const traverse = (node: TreeNode) => {
			list.push({ folder: node.folder, depth: node.depth });
			for (const child of node.children) {
				traverse(child);
			}
		};
		for (const root of treeNodes) {
			traverse(root);
		}
		return list;
	}, [treeNodes]);

	const handleSelectRoot = (cat: string) => {
		onChange({ category: cat, parentId: null });
		setIsOpen(false);
	};

	const handleSelectFolder = (f: Folder) => {
		onChange({ category: f.category, parentId: f.id });
		setIsOpen(false);
	};

	const tabList = useMemo(() => {
		return ["全部", ...sanitizedCategories];
	}, [sanitizedCategories]);

	return (
		<div className="w-full">
			<Popover isOpen={isOpen} onOpenChange={setIsOpen}>
				<Popover.Trigger className="w-full">
					{/* Trigger Button mimicking form input */}
					<button
						type="button"
						className={`w-full min-h-[42px] px-3 py-2 flex items-center justify-between gap-2 rounded-xl border border-border bg-surface shadow-2xs transition-all hover:border-border/90 focus:border-accent focus:ring-2 focus:ring-accent/15 cursor-pointer text-left ${className}`}
					>
						<div className="flex items-center gap-2 min-w-0 flex-1">
							{selectedBreadcrumbs.isRoot ? (
								<span className="text-base shrink-0">📂</span>
							) : (
								<FolderIconLucide className="w-4 h-4 text-accent shrink-0" />
							)}

							<div className="flex items-center gap-1.5 min-w-0 text-xs overflow-hidden">
								{/* Category Breadcrumb */}
								<span className="font-medium text-foreground shrink-0">
									{selectedBreadcrumbs.category}
								</span>

								{/* Sub-folder Breadcrumbs if selected */}
								{selectedBreadcrumbs.folderPath.length > 0 ? (
									<>
										<span className="text-muted/60">/</span>
										<span className="text-foreground font-semibold truncate">
											{selectedBreadcrumbs.folderPath.join(" / ")}
										</span>
									</>
								) : (
									<span className="text-[10px] text-muted bg-surface-secondary px-1.5 py-0.5 rounded font-mono ml-auto sm:ml-1 shrink-0">
										顶层空间
									</span>
								)}
							</div>
						</div>

						<ChevronDown
							className={`w-4 h-4 text-muted shrink-0 transition-transform duration-200 ${
								isOpen ? "rotate-180" : ""
							}`}
						/>
					</button>
				</Popover.Trigger>

				{/* Multi-level Cascading Popover (Portal overlay, no clipping) */}
				<Popover.Content
					placement="bottom start"
					offset={6}
					className="w-[var(--trigger-width)] min-w-[340px] max-w-[calc(100vw-32px)] z-90 bg-surface rounded-2xl border border-border shadow-2xl p-2.5 overflow-hidden"
				>
					<Popover.Dialog aria-label="选择父级文件夹或所属空间" className="outline-none flex flex-col gap-2">
						{/* Category Tabs (First Level - Like Province) */}
						{tabList.length > 1 && (
							<div className="flex items-center gap-1 p-1 bg-surface-secondary/70 rounded-xl overflow-x-auto no-scrollbar border border-border/50 shrink-0">
								{tabList.map((cat) => {
									const isActive = activeTab === cat;
									const count =
										cat === "全部"
											? folders.length
											: categoryCountMap.get(cat) || 0;

									return (
										<button
											key={cat}
											type="button"
											onClick={() => {
												setActiveTab(cat);
												setSearchQuery("");
											}}
											className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
												isActive
													? "bg-surface text-accent font-semibold shadow-xs border border-border/60"
													: "text-muted hover:text-foreground hover:bg-surface/50"
											}`}
										>
											<span>{cat}</span>
											<span
												className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono ${
													isActive
														? "bg-accent/15 text-accent font-bold"
														: "bg-surface-secondary text-muted"
												}`}
											>
												{count}
											</span>
										</button>
									);
								})}
							</div>
						)}

						{/* Filter Search Input */}
						<div className="relative flex items-center">
							<Search className="w-3.5 h-3.5 absolute left-2.5 text-muted pointer-events-none" />
							<input
								type="text"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder={
									activeTab === "全部"
										? "搜索全部文件夹..."
										: `搜索「${activeTab}」下的文件夹...`
								}
								className="w-full bg-surface-secondary/60 border border-border/70 rounded-lg pl-8 pr-7 py-1 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-accent focus:bg-surface transition-all"
							/>
							{searchQuery && (
								<button
									type="button"
									onClick={() => setSearchQuery("")}
									className="absolute right-2 text-muted hover:text-foreground p-0.5 rounded cursor-pointer"
								>
									<X className="w-3 h-3" />
								</button>
							)}
						</div>

						{/* Second Level - Folder Drilldown List (Like City/District) */}
						<div className="max-h-60 overflow-y-auto flex flex-col gap-0.5 py-0.5 pr-0.5">
							{/* Option: Assign as top-level space root when not in "全部" */}
							{activeTab !== "全部" && !searchQuery && (
								<>
									<button
										type="button"
										onClick={() => handleSelectRoot(activeTab)}
										className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left w-full ${
											selectedParentId == null && selectedCategory === activeTab
												? "bg-accent/10 text-accent font-medium border border-accent/20"
												: "hover:bg-surface-secondary/70 text-foreground"
										}`}
									>
										<span className="text-sm shrink-0">📂</span>
										<span className="font-medium flex-1 truncate">
											作为「{activeTab}」顶层空间
										</span>
										<span className="text-[10px] text-muted bg-surface-secondary px-1.5 py-0.5 rounded font-mono shrink-0">
											根目录
										</span>
										{selectedParentId == null &&
											selectedCategory === activeTab && (
												<Check className="w-3.5 h-3.5 text-accent shrink-0 ml-1" />
											)}
									</button>
									<div className="h-px bg-border/50 my-1" />
								</>
							)}

							{/* Empty State */}
							{flattenedDisplayList.length === 0 ? (
								<div className="py-6 text-center text-xs text-muted">
									{searchQuery ? "未找到匹配文件夹" : "该空间下暂无子文件夹"}
								</div>
							) : (
								flattenedDisplayList.map(({ folder: f, depth }) => {
									const isSelected = selectedParentId === f.id;
									return (
										<button
											key={f.id}
											type="button"
											onClick={() => handleSelectFolder(f)}
											style={{ paddingLeft: `${10 + depth * 14}px` }}
											className={`flex items-center gap-2 pr-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left w-full group ${
												isSelected
													? "bg-accent/10 text-accent font-medium border border-accent/20"
													: "hover:bg-surface-secondary/70 text-foreground"
											}`}
										>
											{/* Depth connector indicator */}
											{depth > 0 && (
												<span className="text-muted/40 font-mono text-[10px] shrink-0 -mr-1">
													└
												</span>
											)}

											<FolderIconLucide className="w-3.5 h-3.5 text-accent shrink-0" />

											<span className="truncate flex-1 font-medium">
												{f.name}
											</span>

											{activeTab === "全部" && f.category && (
												<span className="text-[10px] text-muted shrink-0">
													({f.category})
												</span>
											)}

											{isSelected && (
												<Check className="w-3.5 h-3.5 text-accent shrink-0 ml-1" />
											)}
										</button>
									);
								})
							)}
						</div>
					</Popover.Dialog>
				</Popover.Content>
			</Popover>
		</div>
	);
});
