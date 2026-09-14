import type { Editor } from "@tiptap/react";
import { Check, ChevronDown, List, ListOrdered, ListTodo } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ListOption {
	id: "bullet" | "ordered" | "task";
	label: string;
	icon: typeof List;
	isActive: (editor: Editor) => boolean;
	action: (editor: Editor) => void;
}

const LIST_OPTIONS: ListOption[] = [
	{
		id: "bullet",
		label: "无序列表",
		icon: List,
		isActive: (editor) => editor.isActive("bulletList"),
		action: (editor) => editor.chain().focus().toggleBulletList().run(),
	},
	{
		id: "ordered",
		label: "有序列表",
		icon: ListOrdered,
		isActive: (editor) => editor.isActive("orderedList"),
		action: (editor) => editor.chain().focus().toggleOrderedList().run(),
	},
	{
		id: "task",
		label: "任务待办清单",
		icon: ListTodo,
		isActive: (editor) => editor.isActive("taskList"),
		action: (editor) => editor.chain().focus().toggleTaskList().run(),
	},
];

export interface ListDropdownProps {
	editor: Editor;
	isDropUp?: boolean;
}

/**
 * 列表类型合并下拉（无序 / 有序 / 待办）
 */
export function ListDropdown({ editor, isDropUp = false }: ListDropdownProps) {
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

	const activeOption = LIST_OPTIONS.find((opt) => opt.isActive(editor));
	const CurrentIcon = activeOption?.icon || List;

	const handleSelect = (option: ListOption) => {
		setIsOpen(false);
		option.action(editor);
	};

	return (
		<div ref={dropdownRef} className="relative inline-block">
			<button
				type="button"
				onMouseDown={(e) => e.preventDefault()}
				onClick={() => setIsOpen((prev) => !prev)}
				title="列表"
				className={`flex items-center gap-0.5 p-1.5 rounded-md text-xs transition-colors cursor-pointer select-none ${
					isOpen || activeOption
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
					} w-40 p-1 bg-surface border border-border/80 rounded-xl shadow-lg ring-1 ring-black/5 dark:ring-white/10 z-50 overflow-hidden flex flex-col`}
				>
					{LIST_OPTIONS.map((option) => {
						const OptionIcon = option.icon;
						const isSelected = activeOption?.id === option.id;
						return (
							<button
								key={option.id}
								type="button"
								onMouseDown={(e) => e.preventDefault()}
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
