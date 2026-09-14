import type { Editor } from "@tiptap/react";
import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	Check,
	ChevronDown,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Alignment = "left" | "center" | "right";

interface AlignOption {
	id: Alignment;
	label: string;
	icon: typeof AlignLeft;
}

const ALIGN_OPTIONS: AlignOption[] = [
	{ id: "left", label: "居左对齐", icon: AlignLeft },
	{ id: "center", label: "居中对齐", icon: AlignCenter },
	{ id: "right", label: "居右对齐", icon: AlignRight },
];

export interface AlignDropdownProps {
	editor: Editor;
	isDropUp?: boolean;
}

/**
 * 对齐方式合并下拉（居左 / 居中 / 居右）
 */
export function AlignDropdown({
	editor,
	isDropUp = false,
}: AlignDropdownProps) {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

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

	const activeOption =
		ALIGN_OPTIONS.find(
			(opt) => opt.id !== "left" && editor.isActive({ textAlign: opt.id }),
		) || ALIGN_OPTIONS[0];

	const applyAlign = (alignment: Alignment) => {
		// 再次点击当前对齐方式则恢复居左
		const next: Alignment =
			alignment !== "left" && editor.isActive({ textAlign: alignment })
				? "left"
				: alignment;
		if (
			editor.isActive("image") ||
			editor.isActive("video") ||
			!editor.state.selection.empty
		) {
			editor.commands.setTextAlign(next);
		} else {
			editor.chain().focus().setTextAlign(next).run();
		}
		setIsOpen(false);
	};

	const CurrentIcon = activeOption.icon;

	return (
		<div ref={dropdownRef} className="relative inline-block">
			<button
				type="button"
				onMouseDown={(e) => e.preventDefault()}
				onClick={() => setIsOpen((prev) => !prev)}
				title="对齐方式"
				className={`flex items-center gap-0.5 p-1.5 rounded-md text-xs transition-colors cursor-pointer select-none ${
					isOpen || activeOption.id !== "left"
						? "bg-accent/15 text-accent font-medium"
						: "text-muted hover:text-foreground hover:bg-muted/10"
				}`}
			>
				<CurrentIcon className="w-3.5 h-3.5" />
				<ChevronDown
					className={`w-2.5 h-2.5 opacity-70 transition-transform duration-200 ${
						isOpen ? "rotate-180" : ""
					}`}
				/>
			</button>

			{isOpen && (
				<div
					className={`absolute left-0 ${
						isDropUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
					} w-36 p-1 bg-surface border border-border/80 rounded-xl shadow-lg ring-1 ring-black/5 dark:ring-white/10 z-50 overflow-hidden flex flex-col`}
				>
					{ALIGN_OPTIONS.map((option) => {
						const OptionIcon = option.icon;
						const isSelected = activeOption.id === option.id;
						return (
							<button
								key={option.id}
								type="button"
								onMouseDown={(e) => e.preventDefault()}
								onClick={() => applyAlign(option.id)}
								className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
									isSelected
										? "bg-accent/15 text-accent font-medium"
										: "text-foreground hover:bg-muted/10"
								}`}
							>
								<div className="flex items-center gap-2 min-w-0">
									<OptionIcon className="w-3.5 h-3.5 shrink-0" />
									<span className="truncate">{option.label}</span>
								</div>
								{isSelected && <Check className="w-3.5 h-3.5 shrink-0 ml-1" />}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
