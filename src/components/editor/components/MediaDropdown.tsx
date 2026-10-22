import {
	ChevronDown,
	Globe,
	HardDrive,
	Library,
	type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { UrlInputPopover } from "./UrlInputPopover";

export interface MediaDropdownProps {
	kind: "image" | "video";
	label: string;
	icon: LucideIcon;
	tooltip?: string;
	disabled?: boolean;
	urlPlaceholder?: string;
	onSelectLocal: () => void;
	onInsertUrl: (url: string) => void;
	onOpenMaterialPicker?: () => void;
}

/**
 * Unified dropdown for media insertion (local upload, web URL, or material library)
 */
export function MediaDropdown({
	kind,
	label,
	icon: Icon,
	tooltip,
	disabled,
	urlPlaceholder = "粘贴 URL…",
	onSelectLocal,
	onInsertUrl,
	onOpenMaterialPicker,
}: MediaDropdownProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [isUrlOpen, setIsUrlOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Close dropdown when clicking outside
	useEffect(() => {
		if (!isOpen) return;
		const handlePointerDown = (e: PointerEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node)
			) {
				setIsOpen(false);
			}
		};
		window.addEventListener("pointerdown", handlePointerDown);
		return () => window.removeEventListener("pointerdown", handlePointerDown);
	}, [isOpen]);

	const mediaNoun = kind === "image" ? "图片" : "视频";

	return (
		<div className="relative inline-block" ref={dropdownRef}>
			<button
				type="button"
				disabled={disabled}
				onClick={() => setIsOpen((prev) => !prev)}
				title={tooltip || `插入${mediaNoun}`}
				className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
					isOpen || isUrlOpen
						? "bg-accent/15 text-accent font-medium"
						: "text-muted hover:text-foreground hover:bg-muted/10"
				}`}
			>
				<Icon className="w-3.5 h-3.5" />
				<span>{label}</span>
				<ChevronDown
					className={`w-2.5 h-2.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
				/>
			</button>

			{isOpen && (
				<div className="absolute top-full left-0 mt-1 z-50 min-w-40 rounded-lg border border-border bg-surface shadow-lg py-1">
					<button
						type="button"
						onClick={() => {
							setIsOpen(false);
							onSelectLocal();
						}}
						className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground/85 hover:bg-muted/10 transition-colors cursor-pointer"
					>
						<HardDrive className="w-3.5 h-3.5 text-muted" />
						<span>本地{mediaNoun}</span>
					</button>

					<button
						type="button"
						onClick={() => {
							setIsOpen(false);
							setIsUrlOpen(true);
						}}
						className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground/85 hover:bg-muted/10 transition-colors cursor-pointer"
					>
						<Globe className="w-3.5 h-3.5 text-muted" />
						<span>网络{mediaNoun}</span>
					</button>

					{onOpenMaterialPicker && (
						<button
							type="button"
							onClick={() => {
								setIsOpen(false);
								onOpenMaterialPicker();
							}}
							className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground/85 hover:bg-muted/10 transition-colors cursor-pointer"
						>
							<Library className="w-3.5 h-3.5 text-muted" />
							<span>素材库{mediaNoun}</span>
						</button>
					)}
				</div>
			)}

			<UrlInputPopover
				isOpen={isUrlOpen}
				placeholder={urlPlaceholder}
				onSubmit={onInsertUrl}
				onClose={() => setIsUrlOpen(false)}
			/>
		</div>
	);
}

