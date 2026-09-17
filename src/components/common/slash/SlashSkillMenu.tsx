import { Box } from "lucide-react";
import React, { useEffect, useRef } from "react";
import type { SlashItem } from "./useSlashSkills";

export interface SlashSkillMenuProps {
	isOpen: boolean;
	query: string;
	items: SlashItem[];
	selectedIndex: number;
	onSelectIndexChange: (index: number) => void;
	onSelect: (item: SlashItem) => void;
	onClose: () => void;
	className?: string;
}

/**
 * Slash commands & skills dropdown menu matching Antigravity IDE aesthetic:
 * Dark rounded surface, specialized command icons, code `<>` icons for skills,
 * bold names, and single-line truncated descriptions.
 */
export const SlashSkillMenu = React.memo(function SlashSkillMenu({
	isOpen,
	items,
	selectedIndex,
	onSelectIndexChange,
	onSelect,
	onClose,
	className = "",
}: SlashSkillMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	// Close on pointer down outside
	useEffect(() => {
		if (!isOpen) return;
		const handlePointerDown = (e: PointerEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		window.addEventListener("pointerdown", handlePointerDown);
		return () => window.removeEventListener("pointerdown", handlePointerDown);
	}, [isOpen, onClose]);

	// Auto scroll active item into view
	useEffect(() => {
		if (!isOpen || !listRef.current) return;
		const activeEl = listRef.current.querySelector(
			`[data-slash-index="${selectedIndex}"]`,
		) as HTMLElement | null;
		if (activeEl) {
			activeEl.scrollIntoView({ block: "nearest" });
		}
	}, [isOpen, selectedIndex]);

	if (!isOpen || items.length === 0) return null;

	return (
		<div
			ref={menuRef}
			className={`absolute bottom-full mb-2 inset-x-3 p-1.5 rounded-2xl bg-surface/95 dark:bg-zinc-900/95 backdrop-blur-md border border-border/80 dark:border-zinc-800 shadow-xl dark:shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-150 select-none ${className}`}
		>
			<div
				ref={listRef}
				className="max-h-64 overflow-y-auto overscroll-contain py-0.5 space-y-0.5 text-xs focus:outline-none"
			>
				{items.map((item, idx) => {
					const isSelected = idx === selectedIndex;

					return (
						<button
							type="button"
							key={item.id}
							data-slash-index={idx}
							onMouseDown={(e) => {
								// Prevent blur of input
								e.preventDefault();
							}}
							onClick={() => onSelect(item)}
							onMouseEnter={() => onSelectIndexChange(idx)}
							className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
								isSelected
									? "bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 font-medium"
									: "text-foreground hover:bg-muted/10 dark:hover:bg-zinc-800/60"
							}`}
						>
							<Box
								className={`w-4 h-4 shrink-0 ${
									isSelected
										? "text-blue-600 dark:text-blue-400"
										: "text-blue-500/70 dark:text-blue-400/70"
								}`}
							/>
							<span
								className={`font-semibold shrink-0 ${
									isSelected
										? "text-blue-600 dark:text-blue-200"
										: "text-foreground"
								}`}
							>
								{item.name}
							</span>
							<span className="text-muted text-xs truncate flex-1 ml-1">
								{item.description}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
});
