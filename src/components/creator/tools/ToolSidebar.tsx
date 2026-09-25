import {
	Film,
	Image as ImageIcon,
	Layers,
	Music,
	Search,
	Type,
	Wrench,
	X,
} from "lucide-react";
import type { ToolCategory, ToolDefinition } from "./types";

interface ToolSidebarProps {
	tools: ToolDefinition[];
	selectedToolId: string;
	onSelectTool: (id: string) => void;
	activeCategory: ToolCategory;
	onSelectCategory: (category: ToolCategory) => void;
	searchQuery: string;
	onSearchChange: (query: string) => void;
}

const CATEGORIES: { id: ToolCategory; label: string; icon: typeof Layers }[] = [
	{ id: "all", label: "全部", icon: Layers },
	{ id: "video", label: "视频", icon: Film },
	{ id: "audio", label: "音频", icon: Music },
	{ id: "image", label: "图片", icon: ImageIcon },
	{ id: "text", label: "文字", icon: Type },
];

/**
 * Left sidebar navigation for Creator Toolbox.
 * Displays category filters, instant search, and categorized tool items with engine badges.
 */
export function ToolSidebar({
	tools,
	selectedToolId,
	onSelectTool,
	activeCategory,
	onSelectCategory,
	searchQuery,
	onSearchChange,
}: ToolSidebarProps) {
	return (
		<aside className="w-80 shrink-0 border-r border-border bg-surface/40 flex flex-col h-full overflow-hidden select-none">
			{/* Top search & header */}
			<div className="p-3.5 border-b border-border space-y-2.5 shrink-0 bg-surface/60">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="w-6 h-6 rounded-md bg-accent/10 text-accent flex items-center justify-center">
							<Wrench className="w-3.5 h-3.5" />
						</div>
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							自媒体工具箱
						</h2>
					</div>
					<span className="text-[11px] text-muted font-mono px-1.5 py-0.5 rounded bg-muted/10">
						{tools.length} 个工具
					</span>
				</div>

				{/* Search input */}
				<div className="relative">
					<Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder="搜索工具或关键词..."
						className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-border bg-background/80 text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-all"
					/>
					{searchQuery && (
						<button
							type="button"
							onClick={() => onSearchChange("")}
							className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground p-0.5"
						>
							<X className="w-3 h-3" />
						</button>
					)}
				</div>

				{/* Category pills */}
				<div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
					{CATEGORIES.map((cat) => {
						const Icon = cat.icon;
						const active = activeCategory === cat.id;
						return (
							<button
								key={cat.id}
								type="button"
								onClick={() => onSelectCategory(cat.id)}
								className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all shrink-0 cursor-pointer ${
									active
										? "bg-accent text-accent-foreground shadow-xs"
										: "text-muted hover:text-foreground hover:bg-muted/15"
								}`}
							>
								<Icon className="w-3 h-3" />
								<span>{cat.label}</span>
							</button>
						);
					})}
				</div>
			</div>

			{/* Tool list */}
			<div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
				{tools.length === 0 ? (
					<div className="py-12 text-center text-xs text-muted">
						没有找到匹配的自媒体工具
					</div>
				) : (
					tools.map((tool) => {
						const Icon = tool.icon;
						const isSelected = tool.id === selectedToolId;

						// Badge style depending on engine
						const isWasm = tool.engine === "wasm";
						const isAi = tool.engine === "ai";

						return (
							<button
								key={tool.id}
								type="button"
								onClick={() => onSelectTool(tool.id)}
								className={`w-full group relative flex items-start gap-2.5 p-2.5 rounded-lg text-left transition-all cursor-pointer border ${
									isSelected
										? "bg-accent/10 border-accent/40 shadow-xs"
										: "bg-surface/30 hover:bg-surface/70 border-transparent hover:border-border/60"
								}`}
							>
								<div
									className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
										isSelected
											? "bg-accent text-accent-foreground"
											: "bg-muted/15 text-foreground/80 group-hover:bg-muted/25"
									}`}
								>
									<Icon className="w-4 h-4" />
								</div>

								<div className="flex-1 min-w-0">
									<div className="flex items-center justify-between gap-1.5 mb-0.5">
										<span
											className={`text-xs font-semibold truncate ${
												isSelected ? "text-accent" : "text-foreground"
											}`}
										>
											{tool.name}
										</span>
										{tool.engineLabel && (
											<span
												className={`text-[9px] px-1.5 py-0.2 rounded-full font-medium shrink-0 leading-tight ${
													isWasm
														? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
														: isAi
															? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
															: "bg-muted/15 text-muted border border-border"
												}`}
											>
												{tool.engineLabel}
											</span>
										)}
									</div>
									<p className="text-[11px] text-muted line-clamp-1 leading-normal">
										{tool.description}
									</p>
								</div>
							</button>
						);
					})
				)}
			</div>
		</aside>
	);
}
