import { useSortable } from "@dnd-kit/react/sortable";
import { Card } from "@heroui/react";
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

/** widget 色彩身份：图标 chip + 跳转链接高亮（亮/暗双模式） */
const TONE_STYLES: Record<WidgetTone, { chip: string; link: string }> = {
	amber: {
		chip: "bg-amber-100 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300",
		link: "hover:text-amber-600 dark:hover:text-amber-300",
	},
	sky: {
		chip: "bg-sky-100 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300",
		link: "hover:text-sky-600 dark:hover:text-sky-300",
	},
	violet: {
		chip: "bg-violet-100 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300",
		link: "hover:text-violet-600 dark:hover:text-violet-300",
	},
	emerald: {
		chip: "bg-emerald-100 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300",
		link: "hover:text-emerald-600 dark:hover:text-emerald-300",
	},
	indigo: {
		chip: "bg-indigo-100 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300",
		link: "hover:text-indigo-600 dark:hover:text-indigo-300",
	},
	cyan: {
		chip: "bg-cyan-100 text-cyan-600 dark:bg-cyan-400/15 dark:text-cyan-300",
		link: "hover:text-cyan-600 dark:hover:text-cyan-300",
	},
	teal: {
		chip: "bg-teal-100 text-teal-600 dark:bg-teal-400/15 dark:text-teal-300",
		link: "hover:text-teal-600 dark:hover:text-teal-300",
	},
	rose: {
		chip: "bg-rose-100 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300",
		link: "hover:text-rose-600 dark:hover:text-rose-300",
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
 * 使用 HeroUI 默认 Card 样式体系。
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
		<Card
			ref={ref as React.Ref<HTMLDivElement>}
			className={`min-w-0 ${widget.wide ? "md:col-span-2" : ""} ${
				editing
					? "border-dashed border-accent/60 cursor-grab active:cursor-grabbing"
					: ""
			} ${isDragging ? "opacity-60 z-10" : ""}`}
		>
			<Card.Header className="flex-row items-center gap-3">
				<span
					className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tone.chip}`}
				>
					<Icon className="w-4 h-4" />
				</span>
				<div className="min-w-0 flex-1">
					<Card.Title className="truncate">{widget.label}</Card.Title>
					<Card.Description className="truncate">
						{widget.description}
					</Card.Description>
				</div>
				{editing && editControls ? (
					<div className="flex items-center gap-1 shrink-0">
						<span title="拖拽卡片换位" className="p-1 text-muted cursor-grab">
							<GripVertical className="w-4 h-4" />
						</span>
						<button
							type="button"
							title={widget.wide ? "切换为窄卡" : "切换为宽卡"}
							onClick={editControls.onToggleWide}
							className="p-1 rounded hover:bg-surface-secondary text-muted hover:text-foreground cursor-pointer"
						>
							{widget.wide ? (
								<RectangleVertical className="w-4 h-4" />
							) : (
								<RectangleHorizontal className="w-4 h-4" />
							)}
						</button>
						<button
							type="button"
							title="隐藏卡片"
							onClick={editControls.onHide}
							className="p-1 rounded hover:bg-surface-secondary text-muted hover:text-danger cursor-pointer"
						>
							<EyeOff className="w-4 h-4" />
						</button>
					</div>
				) : module ? (
					<Link
						to={module.route}
						className={`flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-secondary text-xs font-medium text-muted transition-colors shrink-0 ${tone.link}`}
					>
						{module.label}
						<ArrowUpRight className="w-3.5 h-3.5" />
					</Link>
				) : null}
			</Card.Header>
			<Card.Content>{children}</Card.Content>
		</Card>
	);
}
