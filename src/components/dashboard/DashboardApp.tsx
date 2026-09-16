import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { Eye, LayoutGrid, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
	getWidgetById,
	resolveWorkbenchLayout,
	WORKBENCH_WIDGETS,
	type WorkbenchLayoutEntry,
} from "../../modules/widgetRegistry";
import { saveSettings } from "../../services/storage/settingsStorage";
import { arrayMove } from "../workbench/dnd/dndUtils";
import { useWorkbenchQuickActions } from "../workbench/layout/useWorkbenchQuickActions";
import { WorkbenchHeader } from "../workbench/layout/WorkbenchHeader";
import type {
	Folder,
	WorkbenchItem,
	WorkbenchSettings,
} from "../workbench/types";
import type { WorkbenchSummary } from "./types";
import { WidgetCard } from "./WidgetCard";
import { CreatorPipelineWidget } from "./widgets/CreatorPipelineWidget";
import { EditorRecentWidget } from "./widgets/EditorRecentWidget";
import { FolderShortcutsWidget } from "./widgets/FolderShortcutsWidget";
import { InboxWidget } from "./widgets/InboxWidget";
import { InsightsWidget } from "./widgets/InsightsWidget";
import { RecentBookmarksWidget } from "./widgets/RecentBookmarksWidget";
import { SkillsOverviewWidget } from "./widgets/SkillsOverviewWidget";
import type { DashboardWidgetProps } from "./widgets/widgetProps";

export interface DashboardAppProps {
	settings: WorkbenchSettings;
	unclassified: WorkbenchItem[];
	folders: Folder[];
	summary: WorkbenchSummary;
}

const WIDGET_COMPONENTS: Record<
	string,
	(props: DashboardWidgetProps) => React.JSX.Element
> = {
	inbox: InboxWidget,
	"recent-bookmarks": RecentBookmarksWidget,
	"creator-pipeline": CreatorPipelineWidget,
	"editor-recent": EditorRecentWidget,
	"folder-shortcuts": FolderShortcutsWidget,
	"skills-overview": SkillsOverviewWidget,
	insights: InsightsWidget,
};

function defaultLayout(): WorkbenchLayoutEntry[] {
	return WORKBENCH_WIDGETS.map((w) => ({ id: w.id, visible: true }));
}

/**
 * 工作台模块主页：跨模块汇总的可自定义仪表盘。
 * 布局（顺序/显隐/宽窄）持久化在 settings.workbenchLayout，渲染 = widget 注册表 merge 用户布局。
 */
export function DashboardApp({
	settings,
	unclassified,
	folders,
	summary,
}: DashboardAppProps) {
	const { actionProps, modals } = useWorkbenchQuickActions({ folders });
	const [editing, setEditing] = useState(false);
	const [layout, setLayout] = useState<WorkbenchLayoutEntry[]>(
		() => settings.workbenchLayout ?? defaultLayout(),
	);

	const widgets = useMemo(() => resolveWorkbenchLayout(layout), [layout]);
	const hiddenWidgets = useMemo(
		() =>
			layout
				.filter((entry) => !entry.visible)
				.map((entry) => getWidgetById(entry.id))
				.filter((w) => w !== undefined),
		[layout],
	);

	const persistLayout = useCallback(
		(next: WorkbenchLayoutEntry[]) => {
			setLayout(next);
			saveSettings({ ...settings, workbenchLayout: next });
		},
		[settings],
	);

	// 拖拽换位：sortable 乐观排序在拖拽中已移动 DOM，dragend 按 visible 顺序提交，
	// 隐藏的 widget 保持在原相对位置追加到队尾（约定与 WorkbenchDnd 的文件夹排序一致）
	const handleWidgetDragEnd = useCallback(
		(event: DragEndEvent) => {
			if (event.canceled) return;
			const { source } = event.operation;
			if (!source || !isSortable(source)) return;
			const { initialIndex, index } = source.sortable;
			if (initialIndex === index || initialIndex < 0 || index < 0) return;
			const visible = layout.filter((entry) => entry.visible);
			if (index >= visible.length) return;
			const reordered = arrayMove(visible, initialIndex, index);
			const hidden = layout.filter((entry) => !entry.visible);
			persistLayout([...reordered, ...hidden]);
		},
		[layout, persistLayout],
	);

	const patchWidget = (id: string, patch: Partial<WorkbenchLayoutEntry>) => {
		persistLayout(
			layout.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
		);
	};

	const widgetProps: DashboardWidgetProps = { summary, unclassified };

	return (
		<div className="h-screen bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden">
			<WorkbenchHeader
				unclassifiedCount={unclassified.length}
				navLayout={settings.navLayout}
				{...actionProps}
			/>
			<main className="flex-1 overflow-y-auto">
				<div className="max-w-7xl mx-auto px-6 py-6">
					<div className="flex items-center gap-3 mb-5">
						<LayoutGrid className="w-4.5 h-4.5 text-accent" />
						<div className="flex-1 min-w-0">
							<h1 className="text-base font-bold text-foreground">工作台</h1>
							<p className="text-[11px] text-muted">
								{editing
									? "拖拽卡片自由换位，可切换宽窄或隐藏"
									: "跨模块汇总 · 自由组合你的关注面板"}
							</p>
						</div>
						<button
							type="button"
							onClick={() => setEditing((v) => !v)}
							className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
								editing
									? "bg-accent text-accent-foreground"
									: "bg-surface-secondary text-muted hover:text-foreground"
							}`}
						>
							{editing ? "完成" : "自定义布局"}
						</button>
					</div>

					<DragDropProvider onDragEnd={handleWidgetDragEnd}>
						<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 auto-rows-[minmax(180px,auto)]">
							{widgets.map((widget, index) => {
								const WidgetBody = WIDGET_COMPONENTS[widget.id];
								return (
									<WidgetCard
										key={widget.id}
										widget={widget}
										index={index}
										editing={editing}
										editControls={{
											onToggleWide: () =>
												patchWidget(widget.id, { wide: !widget.wide }),
											onHide: () => patchWidget(widget.id, { visible: false }),
										}}
									>
										{WidgetBody ? <WidgetBody {...widgetProps} /> : null}
									</WidgetCard>
								);
							})}
						</div>
					</DragDropProvider>

					{editing && hiddenWidgets.length > 0 && (
						<div className="mt-4 rounded-xl border border-dashed border-border px-4 py-3 flex flex-wrap items-center gap-2">
							<span className="text-[11px] text-muted">已隐藏：</span>
							{hiddenWidgets.map((widget) => (
								<button
									key={widget.id}
									type="button"
									onClick={() => patchWidget(widget.id, { visible: true })}
									className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-surface-secondary text-[11px] text-muted hover:text-accent cursor-pointer"
								>
									<Eye className="w-3 h-3" />
									{widget.label}
								</button>
							))}
							<button
								type="button"
								onClick={() => persistLayout(defaultLayout())}
								className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted hover:text-danger cursor-pointer"
							>
								<X className="w-3 h-3" />
								重置为默认布局
							</button>
						</div>
					)}
				</div>
			</main>
			{modals}
		</div>
	);
}
