import type { LucideIcon } from "lucide-react";

/**
 * 自媒体板块子功能占位页（docs/selfmedia-merge-plan.md）：
 * 导航结构一次定型，归档/工具箱/热点雷达功能后续落地。
 */
export function PlaceholderTab({
	icon: Icon,
	title,
	description,
}: {
	icon: LucideIcon;
	title: string;
	description: string;
}) {
	return (
		<div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
			<div className="w-12 h-12 rounded-2xl bg-muted/10 flex items-center justify-center">
				<Icon className="w-6 h-6 text-muted" />
			</div>
			<h2 className="text-sm font-semibold text-foreground">{title}</h2>
			<p className="text-xs text-muted max-w-md leading-relaxed">
				{description}
			</p>
			<span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/10 text-muted">
				后续版本提供
			</span>
		</div>
	);
}
