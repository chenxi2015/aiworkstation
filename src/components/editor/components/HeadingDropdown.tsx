import type { Editor } from "@tiptap/react";
import {
	Check,
	ChevronDown,
	Heading1,
	Heading2,
	Heading3,
	Pilcrow,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface HeadingOption {
	id: string;
	label: string;
	shortLabel: string;
	icon: typeof Pilcrow;
	isActive: (editor: Editor) => boolean;
	action: (editor: Editor) => void;
}

const HEADING_OPTIONS: HeadingOption[] = [
	{
		id: "paragraph",
		label: "正文",
		shortLabel: "正文",
		icon: Pilcrow,
		isActive: (editor) =>
			editor.isActive("paragraph") ||
			(!editor.isActive("heading", { level: 1 }) &&
				!editor.isActive("heading", { level: 2 }) &&
				!editor.isActive("heading", { level: 3 })),
		action: (editor) => editor.chain().focus().setParagraph().run(),
	},
	{
		id: "h1",
		label: "一级标题 (H1)",
		shortLabel: "标题 1",
		icon: Heading1,
		isActive: (editor) => editor.isActive("heading", { level: 1 }),
		action: (editor) =>
			editor.chain().focus().toggleHeading({ level: 1 }).run(),
	},
	{
		id: "h2",
		label: "二级标题 (H2)",
		shortLabel: "标题 2",
		icon: Heading2,
		isActive: (editor) => editor.isActive("heading", { level: 2 }),
		action: (editor) =>
			editor.chain().focus().toggleHeading({ level: 2 }).run(),
	},
	{
		id: "h3",
		label: "三级标题 (H3)",
		shortLabel: "标题 3",
		icon: Heading3,
		isActive: (editor) => editor.isActive("heading", { level: 3 }),
		action: (editor) =>
			editor.chain().focus().toggleHeading({ level: 3 }).run(),
	},
];

export interface HeadingDropdownProps {
	editor: Editor;
	isDropUp?: boolean;
	buttonClassName?: string;
}

/**
 * Dropdown selector for switching block text styles (paragraph and heading levels)
 */
export function HeadingDropdown({
	editor,
	isDropUp = false,
	buttonClassName,
}: HeadingDropdownProps) {
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

	// Resolve the active option according to the editor's current block format
	const activeOption =
		HEADING_OPTIONS.find(
			(opt) => opt.id !== "paragraph" && opt.isActive(editor),
		) || HEADING_OPTIONS[0];

	const CurrentIcon = activeOption.icon;
	const isHeadingActive = activeOption.id !== "paragraph";

	const handleSelect = (option: HeadingOption) => {
		setIsOpen(false);
		option.action(editor);
	};

	const defaultButtonCls = `flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors cursor-pointer select-none ${
		isOpen || isHeadingActive
			? "bg-accent/15 text-accent font-medium"
			: "text-foreground/75 hover:text-foreground hover:bg-muted/20"
	}`;

	return (
		<div ref={dropdownRef} className="relative inline-block">
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				className={buttonClassName || defaultButtonCls}
				title="选择文本样式"
			>
				<CurrentIcon className="w-3.5 h-3.5 shrink-0" />
				<span className="text-xs">{activeOption.shortLabel}</span>
				<ChevronDown
					className={`w-3 h-3 opacity-70 transition-transform duration-200 ${
						isOpen ? "rotate-180" : ""
					}`}
				/>
			</button>

			{/* Dropdown Menu */}
			{isOpen && (
				<div
					className={`absolute left-0 ${
						isDropUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
					} w-40 p-1 bg-surface border border-border/80 rounded-xl shadow-lg ring-1 ring-black/5 dark:ring-white/10 z-50 overflow-hidden flex flex-col`}
				>
					{HEADING_OPTIONS.map((option) => {
						const OptionIcon = option.icon;
						const isSelected = activeOption.id === option.id;

						return (
							<button
								key={option.id}
								type="button"
								onMouseDown={(e) => {
									// Prevent losing editor selection focus
									e.preventDefault();
								}}
								onClick={() => handleSelect(option)}
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
