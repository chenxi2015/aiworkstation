import type { Editor } from "@tiptap/react";
import { Ban, Baseline, ChevronDown, Highlighter } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { stripMarkStyleColor } from "../utils/markStyleColor";

const TEXT_COLORS = [
	{ label: "默认黑", value: "#1f2329" },
	{ label: "高级灰", value: "#646a73" },
	{ label: "摸鱼绿", value: "#5c7a6c" },
	{ label: "正红", value: "#d4380d" },
	{ label: "橙", value: "#d46b08" },
	{ label: "金黄", value: "#d4b106" },
	{ label: "翠绿", value: "#389e0d" },
	{ label: "青", value: "#08979c" },
	{ label: "蓝", value: "#0958d9" },
	{ label: "紫", value: "#531dab" },
	{ label: "品红", value: "#c41d7f" },
];

const BACKGROUND_COLORS = [
	{ label: "浅红", value: "#fff1f0" },
	{ label: "浅橙", value: "#fff2e8" },
	{ label: "浅黄", value: "#fffbe6" },
	{ label: "浅绿", value: "#f6ffed" },
	{ label: "浅青", value: "#e6fffb" },
	{ label: "浅蓝", value: "#e6f4ff" },
	{ label: "浅紫", value: "#f9f0ff" },
	{ label: "浅粉", value: "#fff0f6" },
	{ label: "浅灰", value: "#f5f5f5" },
];

export interface ColorDropdownProps {
	editor: Editor;
	mode: "text" | "background";
	isDropUp?: boolean;
}

/**
 * 文字颜色 / 背景高亮下拉选择器（Google Docs 风格：图标 + 当前颜色指示条）
 */
export function ColorDropdown({
	editor,
	mode,
	isDropUp = false,
}: ColorDropdownProps) {
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

	const isText = mode === "text";
	const label = isText ? "文字颜色" : "背景高亮";
	const Icon = isText ? Baseline : Highlighter;
	const colors = isText ? TEXT_COLORS : BACKGROUND_COLORS;

	const attrs = editor.getAttributes("textStyle");
	const currentColor: string | undefined = isText
		? attrs.color || undefined
		: attrs.backgroundColor || undefined;

	const applyColor = (value: string) => {
		if (isText) {
			editor
				.chain()
				.focus()
				.setColor(value)
				.command(stripMarkStyleColor("text"))
				.run();
		} else {
			editor
				.chain()
				.focus()
				.setBackgroundColor(value)
				.command(stripMarkStyleColor("background"))
				.run();
		}
		setIsOpen(false);
	};

	const clearColor = () => {
		if (isText) {
			editor
				.chain()
				.focus()
				.unsetColor()
				.command(stripMarkStyleColor("text"))
				.run();
		} else {
			editor
				.chain()
				.focus()
				.unsetBackgroundColor()
				.command(stripMarkStyleColor("background"))
				.run();
		}
		setIsOpen(false);
	};

	return (
		<div ref={dropdownRef} className="relative inline-block">
			<button
				type="button"
				onMouseDown={(e) => e.preventDefault()}
				onClick={() => setIsOpen((prev) => !prev)}
				title={label}
				className={`flex flex-col items-center px-1.5 pt-1 pb-0.5 rounded-md transition-colors cursor-pointer select-none ${
					isOpen || currentColor
						? "bg-accent/15 text-accent"
						: "text-muted hover:text-foreground hover:bg-muted/10"
				}`}
			>
				<span className="flex items-center gap-0.5">
					<Icon className="w-3.5 h-3.5" />
					<ChevronDown
						className={`w-2.5 h-2.5 opacity-70 transition-transform duration-200 ${
							isOpen ? "rotate-180" : ""
						}`}
					/>
				</span>
				<span
					className="mt-0.5 h-[3px] w-5 rounded-full border border-black/10"
					style={{ backgroundColor: currentColor || "transparent" }}
				/>
			</button>

			{isOpen && (
				<div
					className={`absolute left-0 ${
						isDropUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
					} w-44 p-2 bg-surface border border-border/80 rounded-xl shadow-lg ring-1 ring-black/5 dark:ring-white/10 z-50`}
				>
					<div className="text-[11px] text-muted px-1 pb-1.5">{label}</div>
					<div className="grid grid-cols-6 gap-1.5">
						{colors.map((c) => (
							<button
								key={c.value}
								type="button"
								onMouseDown={(e) => e.preventDefault()}
								onClick={() => applyColor(c.value)}
								title={c.label}
								className={`w-5 h-5 rounded-md border transition-transform hover:scale-110 cursor-pointer ${
									currentColor === c.value
										? "border-accent ring-1 ring-accent"
										: "border-black/10"
								}`}
								style={{ backgroundColor: c.value }}
							/>
						))}
					</div>
					<button
						type="button"
						onMouseDown={(e) => e.preventDefault()}
						onClick={clearColor}
						className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg text-[11px] text-muted hover:text-foreground hover:bg-muted/10 transition-colors cursor-pointer"
					>
						<Ban className="w-3 h-3" />
						清除{label}
					</button>
				</div>
			)}
		</div>
	);
}
