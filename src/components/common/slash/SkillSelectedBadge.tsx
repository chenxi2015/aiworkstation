import { Box, X } from "lucide-react";
import React from "react";

export interface SkillSelectedBadgeProps {
	name: string;
	iconName?: string;
	onRemove?: () => void;
	className?: string;
}

/** Format kebab-case or snake_case to Title Case (e.g. "ai-creator-radar" -> "Ai Creator Radar") */
function formatItemName(name: string): string {
	if (!name) return "";
	if (name.includes(" ") && /[A-Z]/.test(name)) return name;
	return name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Clean inline skill token matching user reference (图一):
 * Box icon + sky blue name, seamlessly inline with typing cursor.
 */
export const SkillSelectedBadge = React.memo(function SkillSelectedBadge({
	name,
	onRemove,
	className = "",
}: SkillSelectedBadgeProps) {
	const displayName = formatItemName(name);

	return (
		<span
			className={`inline-flex items-center h-6 gap-1 text-blue-600 dark:text-blue-400 font-medium text-xs shrink-0 select-none group mr-1 cursor-default ${className}`}
		>
			<Box className="w-3.5 h-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
			<span className="tracking-tight leading-6">{displayName}</span>
			{onRemove && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onRemove();
					}}
					title="移除"
					className="opacity-0 group-hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 text-blue-500/70 dark:text-blue-400/70 p-0.5 rounded transition-opacity cursor-pointer ml-0.5 flex items-center justify-center"
				>
					<X className="w-3 h-3" />
				</button>
			)}
		</span>
	);
});
