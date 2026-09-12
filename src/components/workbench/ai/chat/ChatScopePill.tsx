import {
	Clapperboard,
	FileText,
	Folder as FolderIcon,
	Globe,
	Layers,
} from "lucide-react";
import type { ComponentType } from "react";
import { memo } from "react";

export interface ActiveChatScope {
	type: "folder" | "document" | "material" | string;
	name: string;
	isActive: boolean;
	icon?: ComponentType<{ className?: string }>;
}

export interface ChatScopePillProps {
	activeScope?: ActiveChatScope | null;
	onToggleScope?: () => void;
	className?: string;
}

interface ScopeVisualStrategy {
	Icon: ComponentType<{ className?: string }>;
	style: string;
	typeName: string;
}

const SCOPE_STRATEGIES: Record<string, ScopeVisualStrategy> = {
	folder: {
		Icon: FolderIcon,
		style: "bg-accent/10 text-accent border-accent/30 hover:bg-accent/20",
		typeName: "文件夹",
	},
	document: {
		Icon: FileText,
		style: "bg-accent/10 text-accent border-accent/30 hover:bg-accent/20",
		typeName: "文档",
	},
	material: {
		Icon: Clapperboard,
		style:
			"bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20",
		typeName: "素材",
	},
};

const DEFAULT_STRATEGY: ScopeVisualStrategy = {
	Icon: Layers,
	style: "bg-accent/10 text-accent border-accent/30 hover:bg-accent/20",
	typeName: "上下文",
};

/**
 * Reusable scope switcher pill (Global search ⇄ Scoped target item).
 * Implements strategy pattern for icon and color resolution.
 */
export const ChatScopePill = memo(function ChatScopePill({
	activeScope,
	onToggleScope,
	className = "",
}: ChatScopePillProps) {
	const isScopedActive = Boolean(activeScope?.isActive);
	const canToggle = Boolean(activeScope != null && onToggleScope);

	const strategy = activeScope
		? (SCOPE_STRATEGIES[activeScope.type] ?? DEFAULT_STRATEGY)
		: DEFAULT_STRATEGY;
	const EffectiveIcon = activeScope?.icon ?? strategy.Icon;

	const tooltipTitle = activeScope
		? isScopedActive
			? `当前限定「${activeScope.name}」，点击切换为全局检索`
			: `当前为全局检索，点击限定「${activeScope.name}」`
		: "全局知识库检索";

	return (
		<button
			type="button"
			onClick={canToggle ? onToggleScope : undefined}
			disabled={!canToggle}
			className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full transition-all border select-none ${
				canToggle ? "cursor-pointer" : "cursor-default opacity-80"
			} ${
				isScopedActive
					? strategy.style
					: "bg-surface-secondary/70 text-muted hover:text-foreground border-border/50 hover:bg-surface-secondary"
			} ${className}`}
			title={tooltipTitle}
		>
			{isScopedActive && activeScope ? (
				<>
					<EffectiveIcon className="w-3 h-3 shrink-0" />
					<span className="max-w-[140px] truncate">
						限定: {activeScope.name}
					</span>
				</>
			) : (
				<>
					<Globe className="w-3 h-3 shrink-0" />
					<span>全局检索</span>
				</>
			)}
		</button>
	);
});
