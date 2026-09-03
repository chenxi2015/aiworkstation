import { Button } from "@heroui/react";
import { Search, X } from "lucide-react";
import type { RefObject } from "react";
import { memo } from "react";
import type { SearchMode, SearchScope } from "../../types";

export interface SearchHeaderProps {
	query: string;
	mode?: SearchMode;
	scope?: SearchScope;
	inputRef: RefObject<HTMLInputElement | null>;
	onChangeQuery: (val: string) => void;
	onChangeMode?: (mode: SearchMode) => void;
	onChangeScope?: (scope: SearchScope) => void;
	onClose?: () => void;
}

/**
 * Top search input header (defaults to hybrid search)
 */
export const SearchHeader = memo(function SearchHeader({
	query,
	scope,
	inputRef,
	onChangeQuery,
	onChangeScope,
	onClose,
}: SearchHeaderProps) {
	return (
		<div className="p-3 border-b border-border bg-surface shrink-0 flex flex-col gap-2">
			{/* Scope Row if active */}
			{scope && scope.type !== "global" && (
				<div className="flex items-center justify-between gap-1 px-0.5">
					<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-soft/80 text-accent text-[11px] font-medium border border-accent/30 shrink-0">
						<span className="truncate max-w-[200px]">
							{scope.type === "category"
								? `分类: ${scope.categoryName}`
								: `文件夹: ${scope.folderName || scope.folderId}`}
						</span>
						<button
							type="button"
							onClick={() => onChangeScope?.({ type: "global" })}
							className="p-0.5 hover:bg-accent/20 rounded cursor-pointer text-accent/70 hover:text-accent"
							title="清除范围，恢复全局搜索"
						>
							<X className="w-2.5 h-2.5" />
						</button>
					</span>
					<button
						type="button"
						onClick={() => onChangeScope?.({ type: "global" })}
						className="text-[10px] text-muted hover:text-accent cursor-pointer transition-colors"
					>
						全局搜索
					</button>
				</div>
			)}

			{/* Input row */}
			<div className="flex items-center gap-2 bg-surface-secondary/50 px-2.5 py-1.5 rounded-xl border border-border/70 focus-within:border-accent/60 focus-within:bg-surface transition-all">
				<Search className="w-4 h-4 text-accent shrink-0" />
				<input
					ref={inputRef}
					type="text"
					value={query}
					onChange={(e) => onChangeQuery(e.target.value)}
					placeholder="搜索书签或意图..."
					className="flex-1 bg-transparent border-none text-xs sm:text-sm text-foreground placeholder:text-muted focus:outline-none tracking-tight min-w-0"
				/>
				{query && (
					<button
						type="button"
						onClick={() => onChangeQuery("")}
						className="p-0.5 text-muted hover:text-foreground cursor-pointer rounded-md shrink-0"
						aria-label="清空输入"
					>
						<X className="w-3.5 h-3.5" />
					</button>
				)}
				{onClose && (
					<Button
						variant="ghost"
						size="sm"
						className="text-[10px] px-1.5 h-6 rounded-md text-muted hover:text-foreground cursor-pointer shrink-0"
						onPress={onClose}
					>
						ESC
					</Button>
				)}
			</div>
		</div>
	);
});

