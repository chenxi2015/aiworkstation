import { useSortable } from "@dnd-kit/react/sortable";
import { Link } from "@tanstack/react-router";
import {
	ArrowUpRight,
	EyeOff,
	GripVertical,
	RectangleHorizontal,
	RectangleVertical,
} from "lucide-react";
import type { ReactNode } from "react";
import { getModuleByCode } from "../../modules/registry";
import type { ResolvedWidget } from "../../modules/widgetRegistry";

export interface WidgetCardEditControls {
	onToggleWide: () => void;
	onHide: () => void;
}

export interface WidgetCardProps {
	widget: ResolvedWidget;
	/** 在可见 widget 列表中的下标（sortable 排序用） */
	index: number;
	editing: boolean;
	editControls?: WidgetCardEditControls;
	children: ReactNode;
}

/**
 * 仪表盘卡片外壳：标题栏 + 模块跳转 + 编辑态控件（拖拽排序/宽窄/隐藏）。
 * 编辑态下整张卡片可拖拽换位（sortable），非编辑态禁用拖拽以放行内部链接点击。
 */
export function WidgetCard({
	widget,
	index,
	editing,
	editControls,
	children,
}: WidgetCardProps) {
	const Icon = widget.icon;
	const module = widget.moduleCode
		? getModuleByCode(widget.moduleCode)
		: undefined;
	const { ref, isDragging } = useSortable({
		id: widget.id,
		index,
		disabled: !editing,
	});

	return (
		<section
			ref={ref as React.Ref<HTMLElement>}
			className={`rounded-xl border border-border bg-surface-secondary/40 flex flex-col overflow-hidden ${
				widget.wide ? "md:col-span-2" : ""
			} ${editing ? "border-dashed border-accent/60 cursor-grab active:cursor-grabbing" : ""} ${
				isDragging ? "opacity-60 shadow-lg ring-1 ring-accent/60 z-10" : ""
			}`}
		>
			<header className="flex items-center gap-2 px-4 pt-3 pb-2 shrink-0">
				<Icon className="w-4 h-4 text-accent shrink-0" />
				<div className="min-w-0 flex-1">
					<h3 className="text-xs font-semibold text-foreground leading-tight">
						{widget.label}
					</h3>
					<p className="text-[10px] text-muted truncate">
						{widget.description}
					</p>
				</div>
				{editing && editControls ? (
					<div className="flex items-center gap-0.5 shrink-0">
						<span
							title="拖拽卡片换位"
							className="p-1 text-muted/60 cursor-grab"
						>
							<GripVertical className="w-3.5 h-3.5" />
						</span>
						<button
							type="button"
							title={widget.wide ? "切换为窄卡" : "切换为宽卡"}
							onClick={editControls.onToggleWide}
							className="p-1 rounded hover:bg-surface text-muted hover:text-foreground cursor-pointer"
						>
							{widget.wide ? (
								<RectangleVertical className="w-3.5 h-3.5" />
							) : (
								<RectangleHorizontal className="w-3.5 h-3.5" />
							)}
						</button>
						<button
							type="button"
							title="隐藏卡片"
							onClick={editControls.onHide}
							className="p-1 rounded hover:bg-surface text-muted hover:text-danger cursor-pointer"
						>
							<EyeOff className="w-3.5 h-3.5" />
						</button>
					</div>
				) : module ? (
					<Link
						to={module.route}
						className="flex items-center gap-1 text-[10px] text-muted hover:text-accent transition-colors shrink-0"
					>
						{module.label}
						<ArrowUpRight className="w-3 h-3" />
					</Link>
				) : null}
			</header>
			<div className="flex-1 px-4 pb-3 min-h-0">{children}</div>
		</section>
	);
}
