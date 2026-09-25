import { Link, useRouterState } from "@tanstack/react-router";
import { Archive, Library, PenSquare, Radar, Wrench } from "lucide-react";

export interface CreatorSubNavProps {
	materialsCount?: number;
}

const SUB_TABS = [
	{ id: "materials", to: "/creator/materials", label: "素材库", icon: Library },
	{ id: "studio", to: "/creator/studio", label: "创作台", icon: PenSquare },
	{ id: "archive", to: "/creator/archive", label: "归档", icon: Archive },
	{ id: "tools", to: "/creator/tools", label: "工具箱", icon: Wrench },
	{ id: "radar", to: "/creator/radar", label: "热点雷达", icon: Radar },
] as const;

/**
 * Sub-navigation tabs for the Creator module.
 * Direct links to nested routes: materials, studio, archive, tools, radar.
 */
export function CreatorSubNav({ materialsCount }: CreatorSubNavProps) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	return (
		<div className="border-b border-border bg-surface/60 shrink-0">
			<div className="mx-auto px-6 flex items-center gap-1">
				{SUB_TABS.map((tab) => {
					const Icon = tab.icon;
					const active =
						pathname === tab.to || pathname.startsWith(`${tab.to}/`);
					return (
						<Link
							key={tab.id}
							to={tab.to}
							className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
								active
									? "border-accent text-accent font-semibold"
									: "border-transparent text-muted hover:text-foreground"
							}`}
						>
							<Icon className="w-3.5 h-3.5" />
							{tab.label}
							{tab.id === "materials" &&
								typeof materialsCount === "number" &&
								materialsCount > 0 && (
									<span className="ml-1 px-1.5 py-0.5 rounded-full bg-muted/10 text-[10px] text-muted">
										{materialsCount}
									</span>
								)}
						</Link>
					);
				})}
			</div>
		</div>
	);
}
