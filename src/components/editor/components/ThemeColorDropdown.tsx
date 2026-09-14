import type { Editor } from "@tiptap/react";
import { Check, ChevronDown, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	collectDocumentColors,
	type DocumentColorEntry,
	replaceThemeColor,
} from "../utils/themeColor";

const TARGET_COLORS = [
	"#d4380d",
	"#d46b08",
	"#d4b106",
	"#389e0d",
	"#08979c",
	"#0958d9",
	"#531dab",
	"#c41d7f",
	"#1f2329",
	"#646a73",
	"#5c7a6c",
	"#f5222d",
];

export interface ThemeColorDropdownProps {
	editor: Editor;
}

/**
 * 主题色批量替换：扫描整篇文档中已使用的颜色（文字色/背景色/内联 style），
 * 选定源色与目标色后一次性替换全部出现位置。
 * 直接操作 ProseMirror 事务（单次撤销可回退），不经过 AI 改写管线，
 * 因此不会发生 Markdown 往返导致的样式丢失。
 */
export function ThemeColorDropdown({ editor }: ThemeColorDropdownProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [docColors, setDocColors] = useState<DocumentColorEntry[]>([]);
	const [fromColor, setFromColor] = useState<string | null>(null);
	const [toColor, setToColor] = useState<string>(TARGET_COLORS[5]);
	const [feedback, setFeedback] = useState<string | null>(null);
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

	const openPanel = () => {
		if (!isOpen) {
			setDocColors(collectDocumentColors(editor.getJSON()));
			setFromColor(null);
			setFeedback(null);
		}
		setIsOpen((prev) => !prev);
	};

	const handleReplace = () => {
		if (!fromColor) return;
		const result = replaceThemeColor(editor, fromColor, toColor);
		if (result.changed) {
			setFeedback(
				`已将 ${fromColor} 替换为 ${toColor}，共 ${result.replacements} 处`,
			);
			setDocColors(collectDocumentColors(editor.getJSON()));
			setFromColor(null);
		} else {
			setFeedback("未找到可替换的颜色");
		}
	};

	return (
		<div ref={dropdownRef} className="relative inline-block">
			<button
				type="button"
				onMouseDown={(e) => e.preventDefault()}
				onClick={openPanel}
				title="主题色替换（整篇批量换色）"
				className={`p-1.5 rounded-md text-xs transition-colors cursor-pointer select-none ${
					isOpen
						? "bg-accent/15 text-accent"
						: "text-muted hover:text-foreground hover:bg-muted/10"
				}`}
			>
				<span className="flex items-center gap-0.5">
					<Palette className="w-3.5 h-3.5" />
					<ChevronDown
						className={`w-2.5 h-2.5 opacity-70 transition-transform duration-200 ${
							isOpen ? "rotate-180" : ""
						}`}
					/>
				</span>
			</button>

			{isOpen && (
				<div className="absolute left-0 top-full mt-1.5 w-60 p-2.5 bg-surface border border-border/80 rounded-xl shadow-lg ring-1 ring-black/5 dark:ring-white/10 z-50">
					<div className="text-[11px] text-muted px-1 pb-1.5">
						主题色替换 · 整篇生效，可撤销
					</div>

					{docColors.length === 0 ? (
						<div className="px-1 py-3 text-[11px] text-muted text-center">
							文档中没有检测到颜色
						</div>
					) : (
						<>
							<div className="text-[11px] text-muted px-1 pb-1">源颜色</div>
							<div className="max-h-28 overflow-y-auto rounded-lg border border-border/60">
								{docColors.map((entry) => (
									<button
										key={entry.hex}
										type="button"
										onMouseDown={(e) => e.preventDefault()}
										onClick={() => {
											setFromColor(entry.hex);
											setFeedback(null);
										}}
										className={`w-full flex items-center gap-2 px-2 py-1.5 text-[11px] transition-colors cursor-pointer ${
											fromColor === entry.hex
												? "bg-accent/10 text-foreground"
												: "text-muted hover:bg-muted/10"
										}`}
									>
										<span
											className="w-4 h-4 rounded border border-black/10 shrink-0"
											style={{ backgroundColor: entry.hex }}
										/>
										<span className="font-mono">{entry.hex}</span>
										<span className="ml-auto opacity-60">{entry.count} 处</span>
									</button>
								))}
							</div>

							<div className="text-[11px] text-muted px-1 pt-2 pb-1">
								替换为
							</div>
							<div className="grid grid-cols-6 gap-1.5 px-1">
								{TARGET_COLORS.map((color) => (
									<button
										key={color}
										type="button"
										onMouseDown={(e) => e.preventDefault()}
										onClick={() => setToColor(color)}
										title={color}
										className={`relative w-5 h-5 rounded-md border transition-transform hover:scale-110 cursor-pointer ${
											toColor === color
												? "border-accent ring-1 ring-accent"
												: "border-black/10"
										}`}
										style={{ backgroundColor: color }}
									>
										{toColor === color && (
											<Check className="absolute inset-0 m-auto w-3 h-3 text-white drop-shadow" />
										)}
									</button>
								))}
							</div>
							<div className="flex items-center gap-2 px-1 pt-2">
								<input
									type="color"
									value={toColor}
									onChange={(e) => setToColor(e.target.value)}
									className="w-6 h-6 rounded cursor-pointer border border-border/60 bg-transparent p-0"
									title="自定义目标色"
								/>
								<span className="font-mono text-[11px] text-muted">
									{toColor}
								</span>
								<button
									type="button"
									onMouseDown={(e) => e.preventDefault()}
									onClick={handleReplace}
									disabled={!fromColor}
									className="ml-auto px-2.5 py-1 rounded-lg text-[11px] font-medium bg-accent text-white hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
								>
									替换
								</button>
							</div>
						</>
					)}

					{feedback && (
						<div className="px-1 pt-2 text-[11px] text-accent">{feedback}</div>
					)}
				</div>
			)}
		</div>
	);
}
