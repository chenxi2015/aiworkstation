import { FilePlus2, Search, Upload, X } from "lucide-react";
import { memo } from "react";

export interface DocumentSidebarHeaderProps {
	search: string;
	onSearchChange: (value: string) => void;
	onCreate: () => void;
	onOpenImport: () => void;
}

export const DocumentSidebarHeader = memo(function DocumentSidebarHeader({
	search,
	onSearchChange,
	onCreate,
	onOpenImport,
}: DocumentSidebarHeaderProps) {
	const searching = search.trim().length > 0;

	return (
		<>
			{/* Top actions: Create / Import */}
			<div className="p-3 border-b border-border flex items-center gap-2">
				<button
					type="button"
					onClick={onCreate}
					className="flex-1 flex items-center justify-center gap-1.5 px-3 h-8 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
				>
					<FilePlus2 className="w-3.5 h-3.5" />
					新建文档
				</button>
				<button
					type="button"
					onClick={onOpenImport}
					className="flex items-center justify-center gap-1 px-2.5 h-8 rounded-lg bg-surface-secondary border border-border text-foreground hover:bg-muted/15 text-xs font-medium transition-colors cursor-pointer"
					title="导入内容 (网页/Word/PDF/Excel/Obsidian)"
				>
					<Upload className="w-3.5 h-3.5" />
					导入
				</button>
			</div>

			{/* Search input */}
			<div className="px-3 pt-2.5 pb-1.5">
				<div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border/60 focus-within:border-accent/50 transition-colors">
					<Search className="w-3.5 h-3.5 text-muted/70 shrink-0" />
					<input
						value={search}
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder="搜索文档…"
						className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted/60"
					/>
					{searching && (
						<button
							type="button"
							aria-label="清空搜索"
							onClick={() => onSearchChange("")}
							className="p-0.5 rounded text-muted hover:text-foreground transition-colors cursor-pointer shrink-0"
						>
							<X className="w-3 h-3" />
						</button>
					)}
				</div>
			</div>
		</>
	);
});

