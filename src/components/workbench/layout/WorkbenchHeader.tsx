import { Button } from "@heroui/react";
import {
	CircleAlert,
	FolderCheck,
	FolderDown,
	FolderPlus,
	Loader2,
	Search,
	Settings,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAIClassifyTask } from "../../../services/aiClassifyTaskStore";
import ThemeToggle from "../../ThemeToggle";
import { WorkbenchLogoIcon } from "../Icons";
import type { Category, Folder } from "../types";
import { CategoryTabs } from "./CategoryTabs";

const HINT_AUTO_HIDE_MS = 4500;
const HOVER_DELAY_MS = 250;

const TASK_TIP_TEXT: Record<string, string> = {
	running:
		"AI 分类任务正在后台执行，关闭弹窗不会中断，点击这里随时查看实时进度",
	completed: "AI 分类已完成，点击这里查看结果并确认归类入库",
	error: "AI 分类失败，点击这里查看错误详情并重试",
};

export interface WorkbenchHeaderProps {
	categories: string[];
	activeCategory: Category;
	unclassifiedCount: number;
	folders: Folder[];
	onSelectCategory: (category: Category) => void;
	onOpenSearch: () => void;
	onOpenSync: () => void;
	onOpenCreateFolder: () => void;
	onOpenSettings: () => void;
	onOpenAIClassifyTask: () => void;
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
	onOpenSearch,
	onOpenSync,
	onOpenCreateFolder,
	onOpenSettings,
	onOpenAIClassifyTask,
}: WorkbenchHeaderProps) {
	const aiClassifyTask = useAIClassifyTask();

	// Custom tooltip bubble: hover-triggered, and auto-flashed when the
	// classify modal sends the task to background (store bgHintNonce)
	const [hintVisible, setHintVisible] = useState(false);
	const [hoverVisible, setHoverVisible] = useState(false);
	const hoverTimerRef = useRef<number | null>(null);

	useEffect(() => {
		if (aiClassifyTask.bgHintNonce === 0) return;
		setHintVisible(true);
		const timer = setTimeout(() => setHintVisible(false), HINT_AUTO_HIDE_MS);
		return () => clearTimeout(timer);
	}, [aiClassifyTask.bgHintNonce]);

	const clearHoverTimer = () => {
		if (hoverTimerRef.current !== null) {
			clearTimeout(hoverTimerRef.current);
			hoverTimerRef.current = null;
		}
	};

	const handleIndicatorEnter = () => {
		clearHoverTimer();
		hoverTimerRef.current = window.setTimeout(
			() => setHoverVisible(true),
			HOVER_DELAY_MS,
		);
	};

	const handleIndicatorLeave = () => {
		clearHoverTimer();
		setHoverVisible(false);
	};

	const handleOpenTask = () => {
		setHintVisible(false);
		setHoverVisible(false);
		onOpenAIClassifyTask();
	};

	const tipText = TASK_TIP_TEXT[aiClassifyTask.status];
	const tipVisible = Boolean(tipText) && (hintVisible || hoverVisible);

	return (
		<header className="shrink-0 z-40 bg-surface/80 border-b border-border px-6 h-15 flex items-center gap-4 justify-between backdrop-blur-md">
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
				{/* Background AI Classification Task Indicator */}
				{aiClassifyTask.status !== "idle" && (
					// biome-ignore lint/a11y/noStaticElementInteractions: hover wrapper only drives tooltip visibility
					<div
						className="relative"
						onMouseEnter={handleIndicatorEnter}
						onMouseLeave={handleIndicatorLeave}
					>
						<Button
							variant={
								aiClassifyTask.status === "error" ? "danger-soft" : "secondary"
							}
							size="sm"
							className={`rounded-full flex items-center gap-1.5 px-3 shadow-2xs cursor-pointer ${
								aiClassifyTask.status === "running"
									? "border border-accent/40 text-accent"
									: ""
							} ${hintVisible ? "ring-2 ring-accent/50" : ""}`}
							onPress={handleOpenTask}
							aria-label="查看 AI 分类任务进度"
						>
							{aiClassifyTask.status === "running" && (
								<>
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
									<span className="font-mono text-xs">
										AI 分类 {aiClassifyTask.progressPercent}%
									</span>
								</>
							)}
							{aiClassifyTask.status === "completed" && (
								<>
									<FolderCheck className="w-3.5 h-3.5 text-emerald-500" />
									<span className="text-xs">分类完成，待确认</span>
								</>
							)}
							{aiClassifyTask.status === "error" && (
								<>
									<CircleAlert className="w-3.5 h-3.5" />
									<span className="text-xs">分类失败</span>
								</>
							)}
						</Button>

						{/* Custom guide tooltip bubble */}
						{tipVisible && (
							<div className="absolute right-0 top-full mt-2 z-50 w-60 rounded-xl border border-border bg-surface px-3 py-2 text-xs leading-relaxed text-foreground shadow-lg animate-in fade-in slide-in-from-top-1 duration-200">
								<div className="absolute -top-1 right-5 h-2 w-2 rotate-45 border-l border-t border-border bg-surface" />
								{tipText}
							</div>
						)}
					</div>
				)}

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
