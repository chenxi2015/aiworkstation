import { Button } from "@heroui/react";
import { FileText, Search, Sparkles, X } from "lucide-react";
import type { RefObject } from "react";
import { memo } from "react";
import type { Folder, SearchMode, SearchScope } from "../../types";

export interface SearchHeaderProps {
	query: string;
	mode?: SearchMode;
	scope?: SearchScope;
	folders?: Folder[];
	inputRef: RefObject<HTMLInputElement | null>;
	onChangeQuery: (val: string) => void;
	onChangeMode?: (mode: SearchMode) => void;
	onChangeScope?: (scope: SearchScope) => void;
	onClose?: () => void;
}

/**
 * Top search input header with keyword/semantic mode toggle
 */
export const SearchHeader = memo(function SearchHeader({
	query,
	mode = "keyword",
	inputRef,
	onChangeQuery,
	onChangeMode,
	onClose,
}: SearchHeaderProps) {
	return (
		<div className="p-3 border-b border-border bg-surface shrink-0">

			{/* Input row */}
			<div className="flex items-center gap-2 bg-surface-secondary/50 px-2.5 py-1.5 rounded-xl border border-border/70 focus-within:border-accent/60 focus-within:bg-surface transition-all">
				<Search className="w-4 h-4 text-accent shrink-0" />
				<input
					ref={inputRef}
					type="text"
					value={query}
					onChange={(e) => onChangeQuery(e.target.value)}
					placeholder={
						mode === "keyword"
							? "输入关键词搜索书签..."
							: "输入自然语言意图搜索..."
					}
					className="flex-1 bg-transparent border-none text-xs sm:text-sm text-foreground placeholder:text-muted focus:outline-none tracking-tight min-w-0"
				/>
				{/* Search mode toggle button */}
				{onChangeMode && (
					<button
						type="button"
						onClick={() =>
							onChangeMode(mode === "hybrid" ? "keyword" : "hybrid")
						}
						className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer shrink-0 border ${
							mode === "hybrid"
								? "bg-accent/15 text-accent border-accent/40 shadow-xs font-semibold"
								: "bg-surface-secondary/70 text-muted hover:text-foreground border-border/60"
						}`}
						title={
							mode === "hybrid"
								? "当前为语义增强模式（调用向量模型匹配含义）。点击切换为关键词模式"
								: "当前为关键词模式（本地极速匹配，不调用外部模型）。点击开启语义增强"
						}
					>
						{mode === "hybrid" ? (
							<>
								<Sparkles className="w-3 h-3 text-accent" />
								<span>语义增强</span>
							</>
						) : (
							<>
								<FileText className="w-3 h-3" />
								<span>关键词</span>
							</>
						)}
					</button>
				)}
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
