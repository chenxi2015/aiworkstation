import type { Editor } from "@tiptap/react";
import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	Bold,
	Code,
	Code2,
	Eye,
	Heading1,
	Heading2,
	Heading3,
	ImagePlus,
	Italic,
	Link,
	List,
	ListOrdered,
	ListTodo,
	Minus,
	PencilLine,
	Pilcrow,
	Quote,
	Redo2,
	Strikethrough,
	Table as TableIcon,
	Underline as UnderlineIcon,
	Undo2,
	Unlink,
	Upload,
	Video,
} from "lucide-react";
import { AiRewriteDropdown } from "./bubble/AiRewriteDropdown";
import { DEFAULT_ACTIONS, getActionInstruction } from "./bubble/types";

interface ToolButtonProps {
	icon: typeof Bold;
	label: string;
	active?: boolean;
	disabled?: boolean;
	onClick: () => void;
}

function ToolButton({
	icon: Icon,
	label,
	active,
	disabled,
	onClick,
}: ToolButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			title={label}
			className={`p-1.5 rounded-md text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
				active
					? "bg-accent/15 text-accent font-medium"
					: "text-muted hover:text-foreground hover:bg-muted/10"
			}`}
		>
			<Icon className="w-3.5 h-3.5" />
		</button>
	);
}

function Divider() {
	return <div className="w-[1px] h-4 bg-border/60 mx-1 shrink-0" />;
}

export interface EditorToolbarProps {
	editor: Editor;
	preview: boolean;
	uploading?: boolean;
	onTogglePreview: () => void;
	onSelectLocalImages: () => void;
	onSelectLocalVideos: () => void;
	onInsertImageUrl: () => void;
	onInsertVideoUrl: () => void;
	onOpenImport?: () => void;
	onOpenSplitRewrite?: (instruction?: string, modeLabel?: string) => void;
}

/**
 * Editor top formatting and action toolbar
 */
export function EditorToolbar({
	editor,
	preview,
	uploading,
	onTogglePreview,
	onSelectLocalImages,
	onSelectLocalVideos,
	onInsertImageUrl,
	onInsertVideoUrl,
	onOpenImport,
	onOpenSplitRewrite,
}: EditorToolbarProps) {
	const setLink = () => {
		const previousUrl = editor.getAttributes("link").href;
		const url = window.prompt("URL", previousUrl);
		if (url === null) return;
		if (url === "") {
			editor.chain().focus().extendMarkRange("link").unsetLink().run();
			return;
		}
		editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
	};

	const handleAlign = (alignment: "left" | "center" | "right") => {
		if (
			editor.isActive("image") ||
			editor.isActive("video") ||
			!editor.state.selection.empty
		) {
			editor.commands.setTextAlign(alignment);
		} else {
			editor.chain().focus().setTextAlign(alignment).run();
		}
	};

	return (
		<div className="shrink-0 border-b border-border bg-surface/60 px-4 py-1.5 flex items-center justify-center gap-0.5 flex-wrap">
			{preview ? (
				<div className="flex items-center justify-between w-full py-0.5">
					<div className="flex items-center gap-2">
						<span className="text-xs font-semibold text-accent flex items-center gap-1.5">
							<Eye className="w-3.5 h-3.5" />
							排版实时预览
						</span>
						<span className="text-[11px] text-muted hidden sm:inline">
							（所见即所得 · 视频与媒体可直接交互播放）
						</span>
					</div>
					<button
						type="button"
						onClick={onTogglePreview}
						className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-accent text-accent-foreground hover:opacity-90 transition-opacity cursor-pointer font-medium"
					>
						<PencilLine className="w-3.5 h-3.5" />
						返回编辑
					</button>
				</div>
			) : (
				<>
					<ToolButton
						icon={Undo2}
						label="撤销"
						disabled={!editor.can().undo()}
						onClick={() => editor.chain().focus().undo().run()}
					/>
					<ToolButton
						icon={Redo2}
						label="重做"
						disabled={!editor.can().redo()}
						onClick={() => editor.chain().focus().redo().run()}
					/>
					<Divider />
					<ToolButton
						icon={Pilcrow}
						label="正文 (段落)"
						active={editor.isActive("paragraph")}
						onClick={() => editor.chain().focus().setParagraph().run()}
					/>
					<ToolButton
						icon={Heading1}
						label="标题 1"
						active={editor.isActive("heading", { level: 1 })}
						onClick={() =>
							editor.chain().focus().toggleHeading({ level: 1 }).run()
						}
					/>
					<ToolButton
						icon={Heading2}
						label="标题 2"
						active={editor.isActive("heading", { level: 2 })}
						onClick={() =>
							editor.chain().focus().toggleHeading({ level: 2 }).run()
						}
					/>
					<ToolButton
						icon={Heading3}
						label="标题 3"
						active={editor.isActive("heading", { level: 3 })}
						onClick={() =>
							editor.chain().focus().toggleHeading({ level: 3 }).run()
						}
					/>
					<Divider />
					<ToolButton
						icon={Bold}
						label="加粗"
						active={editor.isActive("bold")}
						onClick={() => editor.chain().focus().toggleBold().run()}
					/>
					<ToolButton
						icon={Italic}
						label="斜体"
						active={editor.isActive("italic")}
						onClick={() => editor.chain().focus().toggleItalic().run()}
					/>
					<ToolButton
						icon={UnderlineIcon}
						label="下划线 (Cmd+U)"
						active={editor.isActive("underline")}
						onClick={() => editor.chain().focus().toggleUnderline().run()}
					/>
					<ToolButton
						icon={Strikethrough}
						label="删除线"
						active={editor.isActive("strike")}
						onClick={() => editor.chain().focus().toggleStrike().run()}
					/>
					<ToolButton
						icon={Code}
						label="行内代码"
						active={editor.isActive("code")}
						onClick={() => editor.chain().focus().toggleCode().run()}
					/>
					<Divider />
					<ToolButton
						icon={AlignLeft}
						label="居左对齐"
						active={editor.isActive({ textAlign: "left" })}
						onClick={() => handleAlign("left")}
					/>
					<ToolButton
						icon={AlignCenter}
						label="居中对齐"
						active={editor.isActive({ textAlign: "center" })}
						onClick={() =>
							handleAlign(
								editor.isActive({ textAlign: "center" }) ? "left" : "center",
							)
						}
					/>
					<ToolButton
						icon={AlignRight}
						label="居右对齐"
						active={editor.isActive({ textAlign: "right" })}
						onClick={() =>
							handleAlign(
								editor.isActive({ textAlign: "right" }) ? "left" : "right",
							)
						}
					/>
					<Divider />
					<ToolButton
						icon={List}
						label="无序列表"
						active={editor.isActive("bulletList")}
						onClick={() => editor.chain().focus().toggleBulletList().run()}
					/>
					<ToolButton
						icon={ListOrdered}
						label="有序列表"
						active={editor.isActive("orderedList")}
						onClick={() => editor.chain().focus().toggleOrderedList().run()}
					/>
					<ToolButton
						icon={ListTodo}
						label="任务待办清单"
						active={editor.isActive("taskList")}
						onClick={() => editor.chain().focus().toggleTaskList().run()}
					/>
					<ToolButton
						icon={Quote}
						label="引用"
						active={editor.isActive("blockquote")}
						onClick={() => editor.chain().focus().toggleBlockquote().run()}
					/>
					<ToolButton
						icon={Code2}
						label="代码块"
						active={editor.isActive("codeBlock")}
						onClick={() => editor.chain().focus().toggleCodeBlock().run()}
					/>
					<ToolButton
						icon={Minus}
						label="分割线"
						onClick={() => editor.chain().focus().setHorizontalRule().run()}
					/>
					<ToolButton
						icon={TableIcon}
						label="插入表格 (3x3)"
						active={editor.isActive("table")}
						onClick={() =>
							editor
								.chain()
								.focus()
								.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
								.run()
						}
					/>
					<Divider />
					<ToolButton
						icon={Link}
						label="插入链接"
						active={editor.isActive("link")}
						onClick={setLink}
					/>
					{editor.isActive("link") && (
						<ToolButton
							icon={Unlink}
							label="取消链接"
							onClick={() => editor.chain().focus().unsetLink().run()}
						/>
					)}
					<Divider />
					<ToolButton
						icon={ImagePlus}
						label="本地图片"
						disabled={uploading}
						onClick={onSelectLocalImages}
					/>
					<ToolButton
						icon={Video}
						label="本地视频"
						disabled={uploading}
						onClick={onSelectLocalVideos}
					/>
					<button
						type="button"
						onClick={onInsertImageUrl}
						className="px-2 py-1 text-xs text-muted hover:text-foreground hover:bg-muted/10 rounded-md transition-colors cursor-pointer"
					>
						外链图片
					</button>
					<button
						type="button"
						onClick={onInsertVideoUrl}
						className="px-2 py-1 text-xs text-muted hover:text-foreground hover:bg-muted/10 rounded-md transition-colors cursor-pointer"
					>
						外链视频
					</button>
					{onOpenImport && (
						<button
							type="button"
							onClick={onOpenImport}
							className="flex items-center gap-1 px-2 py-1 text-xs text-muted hover:text-foreground hover:bg-muted/10 rounded-md transition-colors cursor-pointer"
							title="导入外部内容 (网页/Word/PDF/Excel/Obsidian)"
						>
							<Upload className="w-3.5 h-3.5" />
							导入
						</button>
					)}
					<Divider />
					{onOpenSplitRewrite && (
						<AiRewriteDropdown
							label="AI 改写比对"
							title="选择全篇改写比对模式"
							actions={DEFAULT_ACTIONS}
							align="right"
							buttonClassName="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-accent bg-accent/10 hover:bg-accent/20 rounded-md transition-colors cursor-pointer"
							onSelectAction={(action) => {
								const instruction = getActionInstruction(action);
								onOpenSplitRewrite(instruction, action.label);
							}}
						/>
					)}
					<ToolButton
						icon={Eye}
						label="预览"
						active={false}
						onClick={onTogglePreview}
					/>
				</>
			)}
		</div>
	);
}
