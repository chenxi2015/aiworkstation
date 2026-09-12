import type { Editor, Range } from "@tiptap/core";
import {
	Code2,
	CornerDownLeft,
	Heading1,
	Heading2,
	Heading3,
	ImagePlus,
	List,
	ListOrdered,
	ListTodo,
	Minus,
	Pilcrow,
	Quote,
	Table as TableIcon,
	Video,
} from "lucide-react";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";

export interface SlashMenuItem {
	id: string;
	title: string;
	description: string;
	icon: typeof Heading1;
	keywords: string[];
	command: (params: { editor: Editor; range: Range }) => void;
}

export interface SlashCommandMenuProps {
	editor: Editor;
	range: Range;
	query: string;
	clientRect: (() => DOMRect | null) | null;
	onClose: () => void;
	onSelectMedia?: (kind: "image" | "video") => void;
}

export interface SlashCommandMenuRef {
	onKeyDown: (event: KeyboardEvent) => boolean;
}

export const SlashCommandMenu = forwardRef<
	SlashCommandMenuRef,
	SlashCommandMenuProps
>(function SlashCommandMenu(
	{ editor, range, query, clientRect, onClose, onSelectMedia },
	ref,
) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const menuRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const mousePositionRef = useRef<{ x: number; y: number }>({ x: -1, y: -1 });

	const items: SlashMenuItem[] = useMemo(
		() => [
			{
				id: "paragraph",
				title: "正文",
				description: "普通段落文本",
				icon: Pilcrow,
				keywords: ["p", "paragraph", "text", "zhengwen", "zw", "正文", "段落", "普通文本"],
				command: ({ editor, range }) => {
					editor
						.chain()
						.focus()
						.deleteRange(range)
						.setParagraph()
						.run();
				},
			},
			{
				id: "heading1",
				title: "一级标题",
				description: "大型主标题",
				icon: Heading1,
				keywords: ["h1", "title", "heading", "biaoti", "bt", "1", "一级标题"],
				command: ({ editor, range }) => {
					editor
						.chain()
						.focus()
						.deleteRange(range)
						.setNode("heading", { level: 1 })
						.run();
				},
			},
			{
				id: "heading2",
				title: "二级标题",
				description: "中型段落标题",
				icon: Heading2,
				keywords: ["h2", "title", "heading", "biaoti", "bt", "2", "二级标题"],
				command: ({ editor, range }) => {
					editor
						.chain()
						.focus()
						.deleteRange(range)
						.setNode("heading", { level: 2 })
						.run();
				},
			},
			{
				id: "heading3",
				title: "三级标题",
				description: "小型子标题",
				icon: Heading3,
				keywords: ["h3", "title", "heading", "biaoti", "bt", "3", "三级标题"],
				command: ({ editor, range }) => {
					editor
						.chain()
						.focus()
						.deleteRange(range)
						.setNode("heading", { level: 3 })
						.run();
				},
			},
			{
				id: "task-list",
				title: "待办任务清单",
				description: "带有复选框的待办事项",
				icon: ListTodo,
				keywords: [
					"todo",
					"task",
					"daiban",
					"renwu",
					"清单",
					"待办",
					"任务",
					"check",
				],
				command: ({ editor, range }) => {
					editor.chain().focus().deleteRange(range).toggleTaskList().run();
				},
			},
			{
				id: "bullet-list",
				title: "无序列表",
				description: "项目符号列表",
				icon: List,
				keywords: ["list", "ul", "bullet", "liebiao", "列表", "无序"],
				command: ({ editor, range }) => {
					editor.chain().focus().deleteRange(range).toggleBulletList().run();
				},
			},
			{
				id: "ordered-list",
				title: "有序列表",
				description: "数字序号排列列表",
				icon: ListOrdered,
				keywords: ["ordered", "ol", "number", "xuhao", "有序", "编号"],
				command: ({ editor, range }) => {
					editor.chain().focus().deleteRange(range).toggleOrderedList().run();
				},
			},
			{
				id: "table",
				title: "插入表格",
				description: "创建 3x3 标准数据表格",
				icon: TableIcon,
				keywords: ["table", "grid", "biaoge", "bg", "表格"],
				command: ({ editor, range }) => {
					editor
						.chain()
						.focus()
						.deleteRange(range)
						.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
						.run();
				},
			},
			{
				id: "blockquote",
				title: "引用文本",
				description: "灰底线条引用块",
				icon: Quote,
				keywords: ["quote", "yinyong", "yy", "引用"],
				command: ({ editor, range }) => {
					editor.chain().focus().deleteRange(range).toggleBlockquote().run();
				},
			},
			{
				id: "code-block",
				title: "代码块",
				description: "语法高亮代码展示",
				icon: Code2,
				keywords: ["code", "daima", "代码", "js", "ts", "json", "python"],
				command: ({ editor, range }) => {
					editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
				},
			},
			{
				id: "divider",
				title: "分割线",
				description: "内容视觉横向分隔条",
				icon: Minus,
				keywords: ["divider", "hr", "line", "fengexian", "分割线"],
				command: ({ editor, range }) => {
					editor.chain().focus().deleteRange(range).setHorizontalRule().run();
				},
			},
			{
				id: "image",
				title: "插入图片",
				description: "上传本地图片到当前位置",
				icon: ImagePlus,
				keywords: ["image", "picture", "photo", "tupian", "tp", "图片"],
				command: ({ editor, range }) => {
					editor.chain().focus().deleteRange(range).run();
					onSelectMedia?.("image");
				},
			},
			{
				id: "video",
				title: "插入视频",
				description: "上传本地视频到当前位置",
				icon: Video,
				keywords: ["video", "shipin", "sp", "视频"],
				command: ({ editor, range }) => {
					editor.chain().focus().deleteRange(range).run();
					onSelectMedia?.("video");
				},
			},
		],
		[onSelectMedia],
	);

	// Filter based on user query
	const filteredItems = useMemo(() => {
		const q = query.toLowerCase().trim();
		if (!q) return items;
		return items.filter(
			(item) =>
				item.title.toLowerCase().includes(q) ||
				item.description.toLowerCase().includes(q) ||
				item.keywords.some((kw) => kw.toLowerCase().includes(q)),
		);
	}, [items, query]);

	const [prevQuery, setPrevQuery] = useState(query);
	if (prevQuery !== query) {
		setPrevQuery(query);
		setSelectedIndex(0);
	}

	const selectItem = (index: number) => {
		const item = filteredItems[index];
		if (item) {
			item.command({ editor, range });
			onClose();
		}
	};

	const handleItemMouseMove = (index: number, e: React.MouseEvent) => {
		// Ignore if mouse coordinates haven't changed (prevents hover from locking selection during keyboard scroll)
		if (
			mousePositionRef.current.x === e.clientX &&
			mousePositionRef.current.y === e.clientY
		) {
			return;
		}
		mousePositionRef.current = { x: e.clientX, y: e.clientY };
		setSelectedIndex(index);
	};

	// Auto scroll active item into view when navigating with Arrow keys
	useEffect(() => {
		if (!listRef.current) return;
		const activeEl = listRef.current.children[selectedIndex] as
			| HTMLElement
			| undefined;
		if (activeEl) {
			activeEl.scrollIntoView({ block: "nearest" });
		}
	}, [selectedIndex]);

	useImperativeHandle(ref, () => ({
		onKeyDown: (event: KeyboardEvent) => {
			if (event.key === "ArrowUp") {
				setSelectedIndex((prev) =>
					filteredItems.length === 0
						? 0
						: (prev + filteredItems.length - 1) % filteredItems.length,
				);
				return true;
			}
			if (event.key === "ArrowDown") {
				setSelectedIndex((prev) =>
					filteredItems.length === 0 ? 0 : (prev + 1) % filteredItems.length,
				);
				return true;
			}
			if (event.key === "Enter") {
				if (filteredItems.length > 0) {
					selectItem(selectedIndex);
					return true;
				}
				return false;
			}
			if (event.key === "Escape") {
				onClose();
				return true;
			}
			return false;
		},
	}));

	// Calculate float position relative to viewport (fixed positioning)
	const rect = clientRect?.();
	const menuHeight = 280;
	const fitsBelow = rect
		? rect.bottom + menuHeight <= window.innerHeight
		: true;
	const top = fitsBelow
		? rect
			? rect.bottom + 6
			: 0
		: Math.max(8, rect ? rect.top - menuHeight - 6 : 0);
	const left = Math.max(
		12,
		Math.min(rect ? rect.left : 20, window.innerWidth - 290),
	);

	if (filteredItems.length === 0) {
		return null;
	}

	return createPortal(
		<div
			ref={menuRef}
			style={{ top: `${top}px`, left: `${left}px` }}
			className="fixed z-50 w-64 max-h-80 flex flex-col rounded-xl border border-border bg-surface/95 backdrop-blur-md shadow-2xl text-foreground transition-all duration-150 animate-in fade-in zoom-in-95 overflow-hidden"
		>
			<div className="flex items-center justify-between px-3 py-2 text-[11px] font-medium text-muted/70 tracking-wider border-b border-border/40 select-none bg-surface/50">
				<span>快捷命令 · 输入筛选</span>
				<span className="text-[10px] text-muted/60 font-normal">↑↓ 移动</span>
			</div>
			<div
				ref={listRef}
				className="flex-1 overflow-y-auto p-1 space-y-0.5 scroll-py-1"
			>
				{filteredItems.map((item, index) => {
					const Icon = item.icon;
					const isSelected = index === selectedIndex;
					return (
						<button
							key={item.id}
							type="button"
							data-index={index}
							aria-selected={isSelected}
							onMouseMove={(e) => handleItemMouseMove(index, e)}
							onClick={() => selectItem(index)}
							className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all duration-100 cursor-pointer ${
								isSelected
									? "bg-accent/15 text-accent font-medium ring-1 ring-accent/30 shadow-xs"
									: "text-foreground/90"
							}`}
						>
							<div
								className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-transform duration-100 ${
									isSelected
										? "bg-accent text-accent-foreground shadow-sm scale-105"
										: "bg-surface-secondary text-muted"
								}`}
							>
								<Icon className="w-4 h-4" />
							</div>
							<div className="flex-1 min-w-0">
								<div className="text-xs truncate">{item.title}</div>
								<div className="text-[10px] text-muted truncate opacity-80">
									{item.description}
								</div>
							</div>
							{isSelected && (
								<div className="shrink-0 flex items-center text-accent opacity-75">
									<CornerDownLeft className="w-3.5 h-3.5" />
								</div>
							)}
						</button>
					);
				})}
			</div>
		</div>,
		document.body,
	);
});
