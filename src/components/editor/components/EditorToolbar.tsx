import type { Editor } from "@tiptap/react";
import {
	Bold,
	ChartColumn,
	Code,
	Code2,
	Eye,
	FileCode2,
	ImagePlus,
	Italic,
	Link,
	Minus,
	PencilLine,
	Quote,
	Redo2,
	Strikethrough,
	Table as TableIcon,
	Underline as UnderlineIcon,
	Undo2,
	Upload,
	Video,
} from "lucide-react";
import { useState } from "react";
import { AlignDropdown } from "./AlignDropdown";
import { ColorDropdown } from "./ColorDropdown";
import { HeadingDropdown } from "./HeadingDropdown";
import { ListDropdown } from "./ListDropdown";
import { SourceCodeModal } from "./SourceCodeModal";
import { ThemeColorDropdown } from "./ThemeColorDropdown";
import { UrlInputPopover } from "./UrlInputPopover";

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
	onInsertImageUrl: (url: string) => void;
	onInsertVideoUrl: (url: string) => void;
	onOpenImport?: () => void;
}

type UrlPopoverKind = "link" | "image" | "video" | null;

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
}: EditorToolbarProps) {
	const [urlPopover, setUrlPopover] = useState<UrlPopoverKind>(null);
	const [sourceModalOpen, setSourceModalOpen] = useState(false);

	const previousLinkUrl: string | undefined = editor.getAttributes("link").href;

	const applyLink = (url: string) => {
		editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
	};

	const removeLink = () => {
		editor.chain().focus().extendMarkRange("link").unsetLink().run();
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
					<HeadingDropdown editor={editor} />
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
						icon={Strikethrough}
						label="删除线"
						active={editor.isActive("strike")}
						onClick={() => editor.chain().focus().toggleStrike().run()}
					/>
					<ToolButton
						icon={UnderlineIcon}
						label="下划线 (Cmd+U)"
						active={editor.isActive("underline")}
						onClick={() => editor.chain().focus().toggleUnderline().run()}
					/>
					<ToolButton
						icon={Code}
						label="行内代码"
						active={editor.isActive("code")}
						onClick={() => editor.chain().focus().toggleCode().run()}
					/>
					<Divider />
					<ColorDropdown editor={editor} mode="text" />
					<ColorDropdown editor={editor} mode="background" />
					<ThemeColorDropdown editor={editor} />
					<Divider />
					<AlignDropdown editor={editor} />
					<Divider />
					<ListDropdown editor={editor} />
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
					<ToolButton
						icon={ChartColumn}
						label="插入图表"
						active={editor.isActive("chart")}
						onClick={() => editor.chain().focus().insertChart().run()}
					/>
					<Divider />
					<div className="relative inline-block">
						<ToolButton
							icon={Link}
							label="插入链接"
							active={editor.isActive("link") || urlPopover === "link"}
							onClick={() =>
								setUrlPopover((prev) => (prev === "link" ? null : "link"))
							}
						/>
						<UrlInputPopover
							isOpen={urlPopover === "link"}
							placeholder="粘贴链接…"
							initialValue={previousLinkUrl || ""}
							openUrl={previousLinkUrl || undefined}
							onRemove={previousLinkUrl ? removeLink : undefined}
							onSubmit={applyLink}
							onClose={() => setUrlPopover(null)}
						/>
					</div>
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
					<div className="relative inline-block">
						<button
							type="button"
							onClick={() =>
								setUrlPopover((prev) => (prev === "image" ? null : "image"))
							}
							className={`px-2 py-1 text-xs rounded-md transition-colors cursor-pointer ${
								urlPopover === "image"
									? "bg-accent/15 text-accent font-medium"
									: "text-muted hover:text-foreground hover:bg-muted/10"
							}`}
						>
							外链图片
						</button>
						<UrlInputPopover
							isOpen={urlPopover === "image"}
							placeholder="粘贴图片 URL…"
							onSubmit={onInsertImageUrl}
							onClose={() => setUrlPopover(null)}
						/>
					</div>
					<div className="relative inline-block">
						<button
							type="button"
							onClick={() =>
								setUrlPopover((prev) => (prev === "video" ? null : "video"))
							}
							className={`px-2 py-1 text-xs rounded-md transition-colors cursor-pointer ${
								urlPopover === "video"
									? "bg-accent/15 text-accent font-medium"
									: "text-muted hover:text-foreground hover:bg-muted/10"
							}`}
						>
							外链视频
						</button>
						<UrlInputPopover
							isOpen={urlPopover === "video"}
							placeholder="粘贴视频 URL…"
							onSubmit={onInsertVideoUrl}
							onClose={() => setUrlPopover(null)}
						/>
					</div>
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
					<ToolButton
						icon={FileCode2}
						label="查看源代码"
						onClick={() => setSourceModalOpen(true)}
					/>
					<SourceCodeModal
						editor={editor}
						isOpen={sourceModalOpen}
						onClose={() => setSourceModalOpen(false)}
					/>
				</>
			)}
		</div>
	);
}
