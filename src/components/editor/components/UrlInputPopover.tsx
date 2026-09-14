import { CornerDownLeft, ExternalLink, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

export interface UrlInputPopoverProps {
	isOpen: boolean;
	onClose: () => void;
	placeholder?: string;
	/** 打开时的初始值（如已有链接地址） */
	initialValue?: string;
	/** 传入后展示「打开链接」按钮 */
	openUrl?: string;
	/** 传入后展示「移除」按钮（用于清除已有链接） */
	onRemove?: () => void;
	/** 提交输入的 URL（已 trim，保证非空），提交后自动关闭 */
	onSubmit: (url: string) => void;
	isDropUp?: boolean;
}

/**
 * Notion 风格的内联 URL 输入浮条（锚定在触发按钮下方），
 * 用于插入链接 / 外链图片 / 外链视频等场景，替代原生 window.prompt。
 */
export function UrlInputPopover({
	isOpen,
	onClose,
	placeholder = "粘贴链接…",
	initialValue = "",
	openUrl,
	onRemove,
	onSubmit,
	isDropUp = false,
}: UrlInputPopoverProps) {
	const [value, setValue] = useState(initialValue);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!isOpen) return;
		setValue(initialValue);
		// 自动聚焦输入框并选中已有内容
		requestAnimationFrame(() => inputRef.current?.select());
	}, [isOpen, initialValue]);

	useEffect(() => {
		if (!isOpen) return;
		const handlePointerDown = (e: PointerEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				onClose();
			}
		};
		window.addEventListener("pointerdown", handlePointerDown);
		return () => window.removeEventListener("pointerdown", handlePointerDown);
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		const url = value.trim();
		if (!url) return;
		onSubmit(url);
		onClose();
	};

	const actionButtonCls =
		"p-1.5 rounded-full text-muted hover:text-foreground hover:bg-muted/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: 仅阻止编辑器失焦以保留选区，非交互监听
		<div
			ref={containerRef}
			onMouseDown={(e) => e.preventDefault()}
			className={`absolute left-0 ${
				isDropUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
			} z-50 flex items-center gap-0.5 w-72 p-1 pl-3 bg-surface border border-border/80 rounded-full shadow-lg ring-1 ring-black/5 dark:ring-white/10`}
		>
			<form
				onSubmit={handleSubmit}
				className="flex items-center flex-1 min-w-0"
			>
				<input
					ref={inputRef}
					type="text"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape") onClose();
					}}
					placeholder={placeholder}
					className="flex-1 min-w-0 bg-transparent outline-none text-xs text-foreground placeholder:text-muted/70"
				/>
			</form>
			<button
				type="button"
				title="确定"
				disabled={!value.trim()}
				onClick={handleSubmit}
				className={actionButtonCls}
			>
				<CornerDownLeft className="w-3.5 h-3.5" />
			</button>
			{openUrl && (
				<button
					type="button"
					title="在新标签页打开"
					onClick={() => window.open(openUrl, "_blank", "noopener,noreferrer")}
					className={actionButtonCls}
				>
					<ExternalLink className="w-3.5 h-3.5" />
				</button>
			)}
			{onRemove && (
				<button
					type="button"
					title="移除链接"
					onClick={() => {
						onRemove();
						onClose();
					}}
					className={`${actionButtonCls} hover:text-red-500`}
				>
					<Trash2 className="w-3.5 h-3.5" />
				</button>
			)}
		</div>
	);
}
