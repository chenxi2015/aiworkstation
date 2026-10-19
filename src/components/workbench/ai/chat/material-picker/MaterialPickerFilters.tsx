import { Input } from "@heroui/react";
import { FolderOpen, Search } from "lucide-react";
import {
	TYPE_TABS,
	type TypeTab,
} from "../../../../creator/materials/types";
import type { MaterialFolder } from "../../../../creator/types";

export interface MaterialPickerFiltersProps {
	query: string;
	onQueryChange: (val: string) => void;
	typeTab: TypeTab;
	onTypeTabChange: (tab: TypeTab) => void;
	folderFilter: number | "all";
	onFolderFilterChange: (filter: number | "all") => void;
	totalMaterialsCount: number;
	folders: MaterialFolder[];
	filteredCount: number;
	selectedCount: number;
	isAllFilteredSelected: boolean;
	onToggleSelectAll: () => void;
	onClearSelection: () => void;
	typeCounts: Record<TypeTab, number>;
}

export function MaterialPickerFilters({
	query,
	onQueryChange,
	typeTab,
	onTypeTabChange,
	folderFilter,
	onFolderFilterChange,
	totalMaterialsCount,
	folders,
	filteredCount,
	selectedCount,
	isAllFilteredSelected,
	onToggleSelectAll,
	onClearSelection,
	typeCounts,
}: MaterialPickerFiltersProps) {
	return (
		<>
			{/* Search input */}
			<div className="flex items-center gap-2 shrink-0">
				<Input
					value={query}
					onChange={(e) => onQueryChange(e.target.value)}
					placeholder="搜索素材标题 / 批注 / 正文..."
					className="flex-1"
				/>
				<Search className="w-4 h-4 text-muted shrink-0 -ml-8 pointer-events-none" />
			</div>

			{/* Type tabs filter */}
			<div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 pb-0.5">
				{TYPE_TABS.map((tab) => {
					const count = typeCounts[tab.id] ?? 0;
					const Icon = tab.icon;
					const active = typeTab === tab.id;
					return (
						<button
							key={tab.id}
							type="button"
							onClick={() => onTypeTabChange(tab.id)}
							className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1 ${
								active
									? "bg-accent text-accent-foreground"
									: "bg-surface-secondary text-muted hover:text-foreground"
							}`}
						>
							<Icon className="w-3 h-3" />
							{tab.label}（{count}）
						</button>
					);
				})}
			</div>

			{/* Folder capsules filter */}
			<div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 pb-0.5">
				<button
					type="button"
					onClick={() => onFolderFilterChange("all")}
					className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap cursor-pointer transition-colors ${
						folderFilter === "all"
							? "bg-accent text-accent-foreground"
							: "bg-surface-secondary text-muted hover:text-foreground"
					}`}
				>
					全部文件夹（{totalMaterialsCount}）
				</button>
				{folders.map((f) => (
					<button
						key={f.id}
						type="button"
						onClick={() => onFolderFilterChange(f.id)}
						className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1 ${
							folderFilter === f.id
								? "bg-accent text-accent-foreground"
								: "bg-surface-secondary text-muted hover:text-foreground"
						}`}
					>
						<FolderOpen className="w-3 h-3" />
						{f.name}
						{typeof f.materialCount === "number" && `（${f.materialCount}）`}
					</button>
				))}
			</div>

			{/* Count & batch select actions */}
			<div className="flex items-center justify-between text-[11px] text-muted px-1 shrink-0 pt-0.5">
				<span>
					共 {filteredCount} 个素材
					{selectedCount > 0 && (
						<span className="text-accent font-medium ml-1.5">
							（已勾选 {selectedCount} 项）
						</span>
					)}
				</span>
				<div className="flex items-center gap-2.5">
					{filteredCount > 0 && (
						<button
							type="button"
							onClick={onToggleSelectAll}
							className="text-muted hover:text-foreground cursor-pointer transition-colors"
						>
							{isAllFilteredSelected ? "取消全选" : "全选当前"}
						</button>
					)}
					{selectedCount > 0 && (
						<button
							type="button"
							onClick={onClearSelection}
							className="text-muted hover:text-foreground cursor-pointer transition-colors"
						>
							清空
						</button>
					)}
				</div>
			</div>
		</>
	);
}

