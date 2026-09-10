import { Columns2, Eye, PencilLine } from "lucide-react";
import {
	type KeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { AiMarkdownRenderer } from "../workbench/ai/shared/AiMarkdownRenderer";

type EditorMode = "edit" | "split" | "preview";

const MODE_STORAGE_KEY = "creator_markdown_editor_mode";

const MODES: Array<{
	id: EditorMode;
	label: string;
	icon: typeof PencilLine;
}> = [
	{ id: "edit", label: "编辑", icon: PencilLine },
	{ id: "split", label: "分屏", icon: Columns2 },
	{ id: "preview", label: "预览", icon: Eye },
];

function readInitialMode(): EditorMode {
	try {
		const saved = localStorage.getItem(MODE_STORAGE_KEY);
		if (saved === "edit" || saved === "split" || saved === "preview") {
			return saved;
		}
	} catch {
		// localStorage 不可用（SSR / 隐私模式）时静默回退
	}
	return "edit";
}

interface MarkdownEditorProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	/** ⌘S / Ctrl+S 触发（如"存为新版本"） */
	onSave?: () => void;
	autoFocus?: boolean;
	className?: string;
}

/**
 * 通用 Markdown 编辑器：编辑 / 分屏 / 预览 三模式，实时 Streamdown 渲染。
 * - Tab 插入两个空格；⌘S / Ctrl+S 触发 onSave
 * - 底部状态栏：字数（不含空白）· 行数
 */
export function MarkdownEditor({
	value,
	onChange,
	placeholder = "支持 Markdown 语法…",
	onSave,
	autoFocus,
	className = "",
}: MarkdownEditorProps) {
	const [mode, setMode] = useState<EditorMode>(readInitialMode);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	// 弹窗场景下挂载后聚焦编辑框（替代 autoFocus 属性，满足 a11y lint）
	useEffect(() => {
		if (autoFocus && mode !== "preview") {
			textareaRef.current?.focus();
		}
	}, [autoFocus, mode]);

	const stats = useMemo(() => {
		const chars = value.replace(/\s/g, "").length;
		const lines = value ? value.split("\n").length : 0;
		return { chars, lines };
	}, [value]);

	const switchMode = (next: EditorMode) => {
		setMode(next);
		try {
			localStorage.setItem(MODE_STORAGE_KEY, next);
		} catch {
			// 忽略持久化失败
		}
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
			e.preventDefault();
			onSave?.();
			return;
		}
		if (e.key === "Tab") {
			e.preventDefault();
			const el = e.currentTarget;
			const { selectionStart, selectionEnd } = el;
			onChange(
				`${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`,
			);
			requestAnimationFrame(() => {
				el.selectionStart = selectionStart + 2;
				el.selectionEnd = selectionStart + 2;
			});
		}
	};

	const textarea = (
		<textarea
			ref={textareaRef}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			onKeyDown={handleKeyDown}
			placeholder={placeholder}
			spellCheck={false}
			className="flex-1 min-h-0 w-full resize-none bg-transparent px-4 py-3 text-[13px] leading-relaxed font-mono text-foreground placeholder:text-muted/60 focus:outline-none"
		/>
	);

	const preview = (
		<div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
			{value.trim() ? (
				<AiMarkdownRenderer content={value} compact />
			) : (
				<p className="text-[11px] text-muted">暂无内容可预览</p>
			)}
		</div>
	);

	return (
		<div
			className={`flex flex-col min-h-0 rounded-xl border border-border bg-surface overflow-hidden focus-within:border-accent/50 transition-colors ${className}`}
		>
			{/* 工具栏：模式切换 */}
			<div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-surface-secondary/40 shrink-0">
				{MODES.map(({ id, label, icon: Icon }) => (
					<button
						key={id}
						type="button"
						onClick={() => switchMode(id)}
						className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
							mode === id
								? "bg-accent/10 text-accent"
								: "text-muted hover:text-foreground hover:bg-surface-secondary/60"
						}`}
					>
						<Icon className="w-3 h-3" />
						{label}
					</button>
				))}
				<span className="ml-auto text-[10px] text-muted hidden md:block pr-1">
					支持 Markdown：# 标题 · **加粗** · - 列表 · 表格 · 代码块
				</span>
			</div>

			{/* 编辑区 */}
			{mode === "edit" && textarea}
			{mode === "preview" && preview}
			{mode === "split" && (
				<div className="flex-1 min-h-0 grid grid-cols-2 divide-x divide-border">
					<div className="flex min-h-0">{textarea}</div>
					<div className="flex min-h-0 bg-surface-secondary/20">{preview}</div>
				</div>
			)}

			{/* 状态栏 */}
			<div className="flex items-center gap-3 px-3 py-1.5 border-t border-border text-[10px] text-muted shrink-0">
				<span>
					{stats.chars} 字 · {stats.lines} 行
				</span>
				{onSave && <span className="ml-auto">⌘S 保存</span>}
			</div>
		</div>
	);
}
