import { ChevronDown, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AiBarAction } from "./types";

export interface AiRewriteDropdownProps {
	actions: AiBarAction[];
	onSelectAction: (action: AiBarAction) => void;
	isDropUp?: boolean;
	label?: string;
	title?: string;
	align?: "left" | "right";
	buttonClassName?: string;
}

/**
 * AI quick rewrite dropdown trigger and popover menu
 */
export function AiRewriteDropdown({
	actions,
	onSelectAction,
	isDropUp = false,
	label = "AI 快速改写",
	title = "AI 智能改写",
	align = "right",
	buttonClassName,
}: AiRewriteDropdownProps) {
	const [isOpen, setIsOpen] = useState(false);
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
		return () => {
			window.removeEventListener("pointerdown", handlePointerDown);
		};
	}, [isOpen]);

	const handleItemClick = (action: AiBarAction) => {
		setIsOpen(false);
		onSelectAction(action);
	};

	const defaultButtonCls = `flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer select-none ${
		isOpen
			? "bg-accent text-accent-foreground shadow-xs ring-1 ring-accent/30"
			: "text-accent bg-accent/10 hover:bg-accent/20 hover:text-accent active:bg-accent/25"
	}`;

	return (
		<div ref={dropdownRef} className="relative">
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				className={buttonClassName || defaultButtonCls}
			>
				<Sparkles className="w-3.5 h-3.5 shrink-0" />
				<span>{label}</span>
				<ChevronDown
					className={`w-3 h-3 opacity-80 transition-transform duration-200 ${
						isOpen ? "rotate-180" : ""
					}`}
				/>
			</button>

			{/* Dropdown Menu Overlay */}
			{isOpen && (
				<div
					className={`absolute ${align === "left" ? "left-0" : "right-0"} ${
						isDropUp ? "bottom-full mb-2" : "top-full mt-2"
					} w-56 py-1 bg-surface border border-border/80 rounded-xl shadow-[0_12px_36px_rgba(0,0,0,0.16)] ring-1 ring-black/5 dark:ring-white/10 z-50 overflow-hidden flex flex-col`}
				>
					<div className="px-3 py-1.5 text-[10px] font-semibold text-muted tracking-wider border-b border-border/50 uppercase flex items-center justify-between bg-muted/5">
						<span>{title}</span>
						<span className="text-[9px] text-muted/70 normal-case font-normal">
							点击即可执行
						</span>
					</div>
					<div className="max-h-64 overflow-y-auto p-1 space-y-0.5">
						{actions.map((action) => (
							<button
								key={action.id}
								type="button"
								onClick={() => handleItemClick(action)}
								className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left rounded-lg text-foreground hover:bg-accent/10 hover:text-accent transition-colors cursor-pointer group"
							>
								<div className="w-6 h-6 rounded-md bg-accent/10 text-accent flex items-center justify-center shrink-0 group-hover:bg-accent group-hover:text-accent-foreground transition-all">
									<action.icon className="w-3.5 h-3.5" />
								</div>
								<div className="flex flex-col min-w-0 flex-1">
									<span className="text-xs font-medium leading-tight group-hover:text-accent transition-colors">
										{action.label}
									</span>
									{action.description && (
										<span className="text-[10px] text-muted leading-snug truncate mt-0.5">
											{action.description}
										</span>
									)}
								</div>
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
