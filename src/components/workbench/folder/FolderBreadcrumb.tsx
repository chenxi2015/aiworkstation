import { useDroppable } from "@dnd-kit/core";
import { ChevronRight, LayoutGrid } from "lucide-react";
import { memo } from "react";
import { crumbDropId, ROOT_CRUMB_DROP_ID } from "../dnd/dndUtils";
import type { Folder } from "../types";

export interface FolderBreadcrumbProps {
	categoryName: string;
	path: Folder[];
	onNavigate: (folderId: number | null) => void;
}

interface CrumbProps {
	dropId: string;
	label: string;
	isCurrent: boolean;
	isRoot?: boolean;
	onNavigate: () => void;
}

function Crumb({ dropId, label, isCurrent, isRoot, onNavigate }: CrumbProps) {
	const { setNodeRef, isOver } = useDroppable({ id: dropId });

	return (
		<button
			ref={setNodeRef}
			type="button"
			onClick={onNavigate}
			disabled={isCurrent}
			className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs transition-colors max-w-[180px] ${
				isCurrent
					? "font-semibold text-foreground cursor-default"
					: "text-muted hover:text-foreground hover:bg-surface-secondary cursor-pointer"
			} ${isOver ? "bg-accent-soft text-accent ring-1 ring-accent/50" : ""}`}
			title={label}
		>
			{isRoot && <LayoutGrid className="w-3 h-3 shrink-0" />}
			<span className="truncate">{label}</span>
		</button>
	);
}

/**
 * Breadcrumb navigation for nested folders.
 * Each segment is clickable and doubles as a drop target
 * (drop a folder/link onto a segment to move it there).
 */
export const FolderBreadcrumb = memo(function FolderBreadcrumb({
	categoryName,
	path,
	onNavigate,
}: FolderBreadcrumbProps) {
	return (
		<nav
			aria-label="文件夹路径"
			className="flex items-center gap-0.5 mb-3 flex-wrap"
		>
			<Crumb
				dropId={ROOT_CRUMB_DROP_ID}
				label={categoryName}
				isCurrent={path.length === 0}
				isRoot
				onNavigate={() => onNavigate(null)}
			/>
			{path.map((folder, index) => (
				<span key={folder.id} className="flex items-center gap-0.5">
					<ChevronRight className="w-3 h-3 text-muted/50 shrink-0" />
					<Crumb
						dropId={crumbDropId(folder.id)}
						label={folder.name}
						isCurrent={index === path.length - 1}
						onNavigate={() => onNavigate(folder.id)}
					/>
				</span>
			))}
		</nav>
	);
});
