import {
	BookOpen,
	Calendar,
	FileText,
	Folder,
	Globe,
	Link2,
	Pencil,
	Sparkles,
	Wrench,
} from "lucide-react";
import type { ItemType } from "./types";
import { ITEM_TYPES } from "./types";

// Standard Folder Icon using Lucide
export function FolderIcon({ className = "w-6 h-6" }: { className?: string }) {
	return <Folder className={className} />;
}

// 9-Grid Icon
export function GridIcon({ className = "w-11 h-11" }: { className?: string }) {
	return (
		<div className={`grid grid-cols-3 gap-1 ${className}`}>
			{["grid-1", "grid-2", "grid-3", "grid-4", "grid-5", "grid-6"].map(
				(key) => (
					<span
						key={key}
						className="rounded-[4px] bg-[var(--accent-soft,rgba(99,102,241,0.15))] transition-colors group-hover:bg-[var(--accent-soft-hover,rgba(99,102,241,0.25))]"
					/>
				),
			)}
		</div>
	);
}

// Item Type Icon based on item category using Lucide React
export function ItemIcon({
	type,
	className = "w-4 h-4",
	colorOverride,
}: {
	type: ItemType;
	className?: string;
	colorOverride?: string;
}) {
	const color = colorOverride || ITEM_TYPES[type]?.color || "currentColor";
	const style = { color };

	switch (type) {
		case "tool":
			return <Wrench className={className} style={style} />;
		case "link":
			return <Link2 className={className} style={style} />;
		case "doc":
			return <FileText className={className} style={style} />;
		case "skill":
			return <Sparkles className={className} style={style} />;
		case "note":
			return <BookOpen className={className} style={style} />;
		default:
			return <Globe className={className} style={style} />;
	}
}

// Logo Mark Icon
export function WorkbenchLogoIcon({
	className = "w-4 h-4",
}: {
	className?: string;
}) {
	return (
		<svg
			role="img"
			aria-label="AI 工作台 Logo"
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="var(--accent-foreground, #ffffff)"
			strokeWidth="2.2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<rect x="3" y="3" width="7" height="7" rx="1.5" />
			<rect x="14" y="3" width="7" height="7" rx="1.5" />
			<rect x="3" y="14" width="7" height="7" rx="1.5" />
			<path d="M14 17.5h7M17.5 14v7" />
		</svg>
	);
}

// Calendar Date Icon using Lucide
export function CalendarIcon({
	className = "w-3 h-3",
}: {
	className?: string;
}) {
	return <Calendar className={className} />;
}

// Edit Icon using Lucide
export function EditIcon({ className = "w-4 h-4" }: { className?: string }) {
	return <Pencil className={className} />;
}

