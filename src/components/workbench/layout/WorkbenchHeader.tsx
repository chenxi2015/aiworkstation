import { Button } from "@heroui/react";
import {
	BotMessageSquare,
	FolderDown,
	FolderPlus,
	Search,
	Settings,
	Sparkles,
} from "lucide-react";
import ThemeToggle from "../../ThemeToggle";
import { WorkbenchLogoIcon } from "../Icons";
import type { Category, Folder } from "../types";
import { CategoryTabs } from "./CategoryTabs";

export interface WorkbenchHeaderProps {
	categories: string[];
	activeCategory: Category;
	unclassifiedCount: number;
	folders: Folder[];
	onSelectCategory: (category: Category) => void;
	onOpenChat: () => void;
	onOpenSearch: () => void;
	onOpenAIClassify: () => void;
	onOpenSync: () => void;
	onOpenCreateFolder: () => void;
	onOpenSettings: () => void;
}

/**
 * Top sticky navigation header for the AI Workbench
 */
export function WorkbenchHeader({
	categories,
	activeCategory,
	unclassifiedCount,
	folders,
	onSelectCategory,
	onOpenChat,
	onOpenSearch,
	onOpenAIClassify,
	onOpenSync,
	onOpenCreateFolder,
	onOpenSettings,
}: WorkbenchHeaderProps) {
	return (
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
			<CategoryTabs
				categories={categories}
				activeCategory={activeCategory}
				unclassifiedCount={unclassifiedCount}
				folders={folders}
				onSelectCategory={onSelectCategory}
			/>

			{/* Right: Actions */}
			<div className="flex items-center gap-2 shrink-0">
				{/* Chat with Bookmarks RAG Button */}
				<Button
					variant="secondary"
					size="sm"
					className="rounded-full flex items-center gap-1.5 px-3 shadow-2xs text-accent font-medium hover:bg-accent-soft cursor-pointer"
					onPress={onOpenChat}
				>
					<BotMessageSquare className="w-3.5 h-3.5 text-accent" />
					<span>知识问答</span>
				</Button>

				{/* Global Search Button */}
				<Button
					variant="secondary"
					size="sm"
					className="rounded-full flex items-center gap-1.5 px-3 shadow-2xs cursor-pointer"
					onPress={onOpenSearch}
				>
					<Search className="w-3.5 h-3.5" />
					<span>搜索</span>
					<kbd className="text-[10px] font-mono px-1.5 py-0.2 bg-background/50 border border-border/80 rounded text-muted">
						⌘K
					</kbd>
				</Button>

				{/* AI Classify Button */}
				<Button
					variant={unclassifiedCount > 0 ? "primary" : "secondary"}
					size="sm"
					className="rounded-full shadow-xs flex items-center gap-1.5 cursor-pointer"
					onPress={onOpenAIClassify}
				>
					<Sparkles className="w-3.5 h-3.5" />
					<span>AI 智能归类</span>
					{unclassifiedCount > 0 && (
						<span className="ml-0.5 px-1.5 py-0.2 text-[10px] bg-background/20 rounded-full font-mono">
							{unclassifiedCount}
						</span>
					)}
				</Button>

				{/* Import/Sync Bookmarks Button */}
				<Button
					variant="secondary"
					size="sm"
					className="rounded-full flex items-center gap-1.5 cursor-pointer"
					onPress={onOpenSync}
				>
					<FolderDown className="w-3.5 h-3.5" />
					<span>导入书签</span>
				</Button>

				{/* New Folder Button */}
				<Button
					variant="ghost"
					size="sm"
					className="rounded-full flex items-center gap-1.5 cursor-pointer text-foreground/80 hover:text-foreground"
					onPress={onOpenCreateFolder}
				>
					<FolderPlus className="w-3.5 h-3.5" />
					<span>新建文件夹</span>
				</Button>

				{/* Settings */}
				<Button
					variant="ghost"
					size="sm"
					className="rounded-full h-8 w-8 p-0 cursor-pointer text-muted hover:text-foreground"
					onPress={onOpenSettings}
					aria-label="设置"
				>
					<Settings className="w-4 h-4" />
				</Button>

				<ThemeToggle />
			</div>
		</header>
	);
}

