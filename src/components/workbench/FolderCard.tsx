import { Card, Chip } from "@heroui/react";
import { memo } from "react";
import { CalendarIcon, FolderIcon, GridIcon } from "./Icons";
import type { Folder } from "./types";

interface FolderCardProps {
	folder: Folder;
	isSelected: boolean;
	onClick: () => void;
}

export const FolderCard = memo(function FolderCard({
	folder,
	isSelected,
	onClick,
}: FolderCardProps) {
	const isGrid = folder.name.includes("九宫格") || folder.items.length >= 9;

	return (
		<Card
			role="button"
			tabIndex={0}
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") onClick();
			}}
			className={`cursor-pointer transition-all duration-150 ${isSelected ? "border-accent ring-2 ring-accent" : "hover:border-accent/40"}`}
		>
			<Card.Header>
				{isGrid ? (
					<div className="w-10 h-10 rounded-xl bg-surface-secondary p-1 flex items-center justify-center">
						<GridIcon className="w-6 h-6" />
					</div>
				) : (
					<div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
						<FolderIcon className="w-5 h-5" />
					</div>
				)}
			</Card.Header>

			<Card.Content>
				<Card.Title className="line-clamp-1 break-all">
					{folder.name}
				</Card.Title>
			</Card.Content>

			<Card.Footer>
				<Chip size="sm" variant="secondary">
					<CalendarIcon className="w-3.5 h-3.5 opacity-70 mr-1 inline" />
					{folder.items.length} 项内容
				</Chip>
			</Card.Footer>
		</Card>
	);
});

