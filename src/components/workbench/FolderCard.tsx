import { CalendarIcon, FolderIcon, GridIcon } from "./Icons";
import type { Folder } from "./types";

interface FolderCardProps {
	folder: Folder;
	isSelected: boolean;
	onClick: () => void;
}

export function FolderCard({ folder, isSelected, onClick }: FolderCardProps) {
	const isGrid = folder.name.includes("九宫格") || folder.items.length >= 9;

	return (
		<button
			type="button"
			onClick={onClick}
			className={`group relative text-left w-full rounded-2xl p-5 cursor-pointer transition-all duration-200 ease-out border flex flex-col justify-between gap-3 min-h-[148px] bg-[var(--surface,oklch(1_0_0))] ${
				isSelected
					? "border-[var(--accent,oklch(0.62_0.195_253.83))] ring-4 ring-[var(--accent-soft,rgba(99,102,241,0.15))] shadow-md"
					: "border-[var(--border,oklch(0.9_0.004_286.32))] hover:border-[var(--border-secondary,oklch(0.8_0.004_286.32))] hover:-translate-y-1 hover:shadow-md"
			}`}
		>
			<div className="flex items-center justify-between w-full">
				{isGrid ? (
					<div className="w-11 h-11 rounded-xl bg-[var(--surface-secondary,oklch(0.96_0.001_286.37))] p-1 flex items-center justify-center">
						<GridIcon className="w-8 h-8" />
					</div>
				) : (
					<div className="w-11 h-11 rounded-xl bg-[var(--accent-soft,rgba(99,102,241,0.12))] text-[var(--accent,oklch(0.62_0.195_253.83))] flex items-center justify-center transition-colors group-hover:bg-[var(--accent-soft-hover,rgba(99,102,241,0.2))]">
						<FolderIcon className="w-6 h-6" />
					</div>
				)}
			</div>

			<div>
				<h3 className="text-sm font-semibold text-[var(--foreground,oklch(0.21_0.006_285.89))] leading-tight line-clamp-1 break-all tracking-tight">
					{folder.name}
				</h3>
			</div>

			<div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground,oklch(0.55_0.014_285.94))] font-medium mt-auto">
				<CalendarIcon className="w-3.5 h-3.5 opacity-70" />
				<span>{folder.items.length} 项内容</span>
			</div>
		</button>
	);
}
