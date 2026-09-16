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
import type { ResolvedWidget, WidgetTone } from "../../modules/widgetRegistry";

/** widget 色彩身份：图标 chip + 悬停描边的柔和配色（亮/暗双模式） */
const TONE_STYLES: Record<
	WidgetTone,
	{ chip: string; hoverRing: string; link: string }
> = {
	amber: {
		chip: "bg-amber-100 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300",
		hoverRing: "hover:border-amber-300 dark:hover:border-amber-400/40",
		link: "hover:text-amber-600 dark:hover:text-amber-300",
	},
	sky: {
		chip: "bg-sky-100 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300",
		hoverRing: "hover:border-sky-300 dark:hover:border-sky-400/40",
		link: "hover:text-sky-600 dark:hover:text-sky-300",
	},
	violet: {
		chip: "bg-violet-100 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300",
		hoverRing: "hover:border-violet-300 dark:hover:border-violet-400/40",
		link: "hover:text-violet-600 dark:hover:text-violet-300",
	},
	emerald: {
		chip: "bg-emerald-100 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300",
		hoverRing: "hover:border-emerald-300 dark:hover:border-emerald-400/40",
		link: "hover:text-emerald-600 dark:hover:text-emerald-300",
	},
	indigo: {
		chip: "bg-indigo-100 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300",
		hoverRing: "hover:border-indigo-300 dark:hover:border-indigo-400/40",
		link: "hover:text-indigo-600 dark:hover:text-indigo-300",
	},
	cyan: {
		chip: "bg-cyan-100 text-cyan-600 dark:bg-cyan-400/15 dark:text-cyan-300",
		hoverRing: "hover:border-cyan-300 dark:hover:border-cyan-400/40",
		link: "hover:text-cyan-600 dark:hover:text-cyan-300",
	},
	teal: {
		chip: "bg-teal-100 text-teal-600 dark:bg-teal-400/15 dark:text-teal-300",
		hoverRing: "hover:border-teal-300 dark:hover:border-teal-400/40",
		link: "hover:text-teal-600 dark:hover:text-teal-300",
	},
};

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
	const tone = TONE_STYLES[widget.tone];
	const { ref, isDragging } = useSortable({
		id: widget.id,
		index,
		disabled: !editing,
	});

	return (
		<section
			ref={ref as React.Ref<HTMLElement>}
			className={`rounded-2xl border bg-surface flex flex-col overflow-hidden transition-colors duration-200 ${
				widget.wide ? "md:col-span-2" : ""
			} ${
				editing
					? "border-dashed border-accent/60 cursor-grab active:cursor-grabbing"
					: `border-border/70 ${tone.hoverRing} `
			} ${isDragging ? "opacity-60 ring-1 ring-accent/60 z-10" : ""}`}
		>
			<header className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5 shrink-0">
				<span
					className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${tone.chip}`}
				>
					<Icon className="w-4 h-4" />
				</span>
				<div className="min-w-0 flex-1">
					<h3 className="text-[13px] font-semibold text-foreground leading-tight">
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
						className={`flex items-center gap-1 px-2 py-1 rounded-full bg-surface-secondary/70 text-[10px] font-medium text-muted transition-colors shrink-0 ${tone.link}`}
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
