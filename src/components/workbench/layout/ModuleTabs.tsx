import { useDroppable } from "@dnd-kit/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { memo } from "react";
import {
	type ModuleDef,
	type NavLayoutEntry,
	resolveNavModules,
} from "../../../modules/registry";
import { categoryDropId } from "../dnd/dndUtils";

export interface ModuleTabsProps {
	unclassifiedCount: number;
	navLayout?: NavLayoutEntry[];
}

interface ModuleTabItemProps {
	module: ModuleDef;
	isActive: boolean;
	unclassifiedCount: number;
}

/**
 * Fixed module tab — navigates to the module route and acts as a droppable
 * target (dropping a folder onto a module assigns the module code as category)
 */
const ModuleTabItem = memo(function ModuleTabItem({
	module,
	isActive,
	unclassifiedCount,
}: ModuleTabItemProps) {
	const Icon = module.icon;
	// 书签模块是聚合视图，不接受「改分类」拖放
	const droppable = module.code !== "bookmarks";
	const { ref, isDropTarget } = useDroppable({
		id: categoryDropId(module.code),
		disabled: !droppable,
		data: { category: module.code },
	});

	const showBadge = module.code === "bookmarks" && unclassifiedCount > 0;

	return (
		<Link
			to={module.route}
			ref={ref}
			className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 flex items-center gap-1.5 cursor-pointer select-none ${
				isDropTarget
					? "bg-accent text-accent-foreground font-semibold shadow-md ring-2 ring-accent/80 scale-105"
					: isActive
						? "bg-accent-soft text-accent font-semibold shadow-xs"
						: "text-muted hover:text-foreground hover:bg-surface-secondary"
			}`}
		>
			<Icon className="w-3.5 h-3.5" />
			<span>{module.label}</span>
			{showBadge && (
				<span
					className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono transition-colors ${
						isDropTarget
							? "bg-accent-foreground/20 text-accent-foreground font-bold"
							: "bg-danger/15 text-danger font-bold"
					}`}
				>
					{unclassifiedCount}
				</span>
			)}
		</Link>
	);
});

/**
 * Fixed top-level module navigation (工作台 / 书签 / 自媒体 / ...), driven by
 * the module registry and the user's nav layout. Route-based active state.
 */
export const ModuleTabs = memo(function ModuleTabs({
	unclassifiedCount,
	navLayout,
}: ModuleTabsProps) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const modules = resolveNavModules(navLayout);

	return (
		<nav className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 py-1 px-2">
			{modules.map((mod) => (
				<ModuleTabItem
					key={mod.code}
					module={mod}
					isActive={pathname === mod.route}
					unclassifiedCount={unclassifiedCount}
				/>
			))}
		</nav>
	);
});
