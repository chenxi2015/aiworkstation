import { Button } from "@heroui/react";
import { Brain, FileText, Search, Sparkles, X } from "lucide-react";
import type { RefObject } from "react";
import { memo } from "react";
import type { SearchMode } from "../../types";

export interface SearchHeaderProps {
	query: string;
	mode: SearchMode;
	inputRef: RefObject<HTMLInputElement | null>;
	onChangeQuery: (val: string) => void;
	onChangeMode: (mode: SearchMode) => void;
	onClose: () => void;
}

const MODES: { id: SearchMode; label: string; icon: React.ElementType; desc: string }[] = [
	{
		id: "hybrid",
		label: "混合检索",
		icon: Sparkles,
		desc: "结合关键字与向量语义综合重排",
	},
	{
		id: "semantic",
		label: "向量语义",
		icon: Brain,
		desc: "仅基于 Embedding 余弦相似度检索",
	},
	{
		id: "keyword",
		label: "关键词",
		icon: FileText,
		desc: "仅基于标题/标签/网址精准匹配",
	},
];

/**
 * Top search input header and search mode toggles
 */
export const SearchHeader = memo(function SearchHeader({
	query,
	mode,
	inputRef,
	onChangeQuery,
	onChangeMode,
	onClose,
}: SearchHeaderProps) {
	return (
		<div className="p-4 border-b border-border bg-surface shrink-0 flex flex-col gap-3">
			{/* Input row */}
			<div className="flex items-center gap-3">
				<Search className="w-5 h-5 text-accent shrink-0" />
				<input
					ref={inputRef}
					type="text"
					value={query}
					onChange={(e) => onChangeQuery(e.target.value)}
					placeholder="搜索书签：输入关键词、语义意图或自然语言（例如：搞钱变现工具）..."
					className="flex-1 bg-transparent border-none text-base text-foreground placeholder:text-muted focus:outline-none tracking-tight"
				/>
				{query && (
					<button
						type="button"
						onClick={() => onChangeQuery("")}
						className="p-1 text-muted hover:text-foreground cursor-pointer rounded-md"
						aria-label="清空输入"
					>
						<X className="w-4 h-4" />
					</button>
				)}
				<Button
					variant="ghost"
					size="sm"
					className="text-xs px-2 h-7 rounded-lg text-muted hover:text-foreground cursor-pointer"
					onPress={onClose}
				>
					ESC
				</Button>
			</div>

			{/* Search Mode Switcher */}
			<div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
				<div className="flex items-center gap-1.5 bg-surface-secondary/70 p-1 rounded-xl border border-border/60">
					{MODES.map((m) => {
						const Icon = m.icon;
						const isActive = mode === m.id;
						return (
							<button
								key={m.id}
								type="button"
								onClick={() => onChangeMode(m.id)}
								className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
									isActive
										? "bg-surface text-accent shadow-xs border border-border/80"
										: "text-muted hover:text-foreground"
								}`}
							>
								<Icon className="w-3.5 h-3.5" />
								<span>{m.label}</span>
							</button>
						);
					})}
				</div>

				<span className="text-[11px] text-muted hidden sm:inline">
					{MODES.find((m) => m.id === mode)?.desc}
				</span>
			</div>
		</div>
	);
});
