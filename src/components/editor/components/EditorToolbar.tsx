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
import type { MaterialToolKind } from "../toolbar/materialTools";
import { AlignDropdown } from "./AlignDropdown";
import { ColorDropdown } from "./ColorDropdown";
import { HeadingDropdown } from "./HeadingDropdown";
import { ListDropdown } from "./ListDropdown";
import { MaterialToolsDropdown } from "./MaterialToolsDropdown";
import { MediaDropdown } from "./MediaDropdown";
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

interface ToolbarGroupProps {
	children: React.ReactNode;
	className?: string;
}

/**
 * Functional button group wrapper with subtle background and border
 */
function ToolbarGroup({ children, className = "" }: ToolbarGroupProps) {
	return (
		<div
			className={`flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/10 border border-border/40 shrink-0 ${className}`}
		>
			{children}
		</div>
	);
}

export interface EditorToolbarProps {
	editor: Editor;
	preview: boolean;
	uploading?: boolean;
	onTogglePreview: () => void;
	onSelectLocalImages: () => void;
	onSelectLocalVideos: () => void;
	onOpenMaterialPicker: (kind: MaterialToolKind) => void;
	onInsertImageUrl: (url: string) => void;
	onInsertVideoUrl: (url: string) => void;
	onOpenImport?: () => void;
}

/**
 * Editor top formatting and action toolbar with structured functional groups
 */
export function EditorToolbar({
	editor,
	preview,
	uploading,
	onTogglePreview,
	onSelectLocalImages,
	onSelectLocalVideos,
	onOpenMaterialPicker,
	onInsertImageUrl,
	onInsertVideoUrl,
	onOpenImport,
}: EditorToolbarProps) {
	const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
	const [sourceModalOpen, setSourceModalOpen] = useState(false);

	const previousLinkUrl: string | undefined = editor.getAttributes("link").href;

	const applyLink = (url: string) => {
		editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
	};

	const removeLink = () => {
		editor.chain().focus().extendMarkRange("link").unsetLink().run();
	};

	return (
		<div className="shrink-0 relative z-50 border-b border-border bg-surface px-3 py-1.5 flex items-center justify-center gap-1.5 flex-wrap">
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
					{/* Group 1: History Undo / Redo */}
					<ToolbarGroup>
						<ToolButton
							icon={Undo2}
							label="撤销 (Cmd+Z)"
							disabled={!editor.can().undo()}
							onClick={() => editor.chain().focus().undo().run()}
						/>
						<ToolButton
							icon={Redo2}
							label="重做 (Cmd+Shift+Z)"
							disabled={!editor.can().redo()}
							onClick={() => editor.chain().focus().redo().run()}
						/>
					</ToolbarGroup>

					{/* Group 2: Document Structure & Headings */}
					<ToolbarGroup>
						<HeadingDropdown editor={editor} />
					</ToolbarGroup>

					{/* Group 3: Inline Text Formatting */}
					<ToolbarGroup>
						<ToolButton
							icon={Bold}
							label="加粗 (Cmd+B)"
							active={editor.isActive("bold")}
							onClick={() => editor.chain().focus().toggleBold().run()}
						/>
						<ToolButton
							icon={Italic}
							label="斜体 (Cmd+I)"
							active={editor.isActive("italic")}
							onClick={() => editor.chain().focus().toggleItalic().run()}
						/>
						<ToolButton
							icon={Strikethrough}
							label="删除线 (Cmd+Shift+X)"
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
					</ToolbarGroup>

					{/* Group 4: Colors and Theme */}
					<ToolbarGroup>
						<ColorDropdown editor={editor} mode="text" />
						<ColorDropdown editor={editor} mode="background" />
						<ThemeColorDropdown editor={editor} />
					</ToolbarGroup>

					{/* Group 5: Paragraph Alignment and Lists */}
					<ToolbarGroup>
						<AlignDropdown editor={editor} />
						<ListDropdown editor={editor} />
						<ToolButton
							icon={Quote}
							label="引用"
							active={editor.isActive("blockquote")}
							onClick={() => editor.chain().focus().toggleBlockquote().run()}
						/>
					</ToolbarGroup>

					{/* Group 6: Block Elements & Widgets (Link, Table, Chart, CodeBlock, Divider) */}
					<ToolbarGroup>
						<div className="relative inline-block">
							<ToolButton
								icon={Link}
								label="插入链接"
								active={editor.isActive("link") || linkPopoverOpen}
								onClick={() => setLinkPopoverOpen((prev) => !prev)}
							/>
							<UrlInputPopover
								isOpen={linkPopoverOpen}
								placeholder="粘贴链接…"
								initialValue={previousLinkUrl || ""}
								openUrl={previousLinkUrl || undefined}
								onRemove={previousLinkUrl ? removeLink : undefined}
								onSubmit={applyLink}
								onClose={() => setLinkPopoverOpen(false)}
							/>
						</div>
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
					</ToolbarGroup>

					{/* Group 7: Media & External Resources */}
					<ToolbarGroup>
						<MediaDropdown
							kind="image"
							label="图片"
							icon={ImagePlus}
							tooltip="插入图片（本地上传 / 网络图片 / 素材库）"
							disabled={uploading}
							onSelectLocal={onSelectLocalImages}
							onInsertUrl={onInsertImageUrl}
							onOpenMaterialPicker={() => onOpenMaterialPicker("image")}
							urlPlaceholder="粘贴图片 URL…"
						/>
						<MediaDropdown
							kind="video"
							label="视频"
							icon={Video}
							tooltip="插入视频（本地上传 / 网络视频 / 素材库）"
							disabled={uploading}
							onSelectLocal={onSelectLocalVideos}
							onInsertUrl={onInsertVideoUrl}
							onOpenMaterialPicker={() => onOpenMaterialPicker("video")}
							urlPlaceholder="粘贴视频 URL…"
						/>
						<MaterialToolsDropdown
							onOpenMaterialPicker={onOpenMaterialPicker}
							disabled={uploading}
						/>
						{onOpenImport && (
							<button
								type="button"
								onClick={onOpenImport}
								className="flex items-center gap-1 px-2 py-1 text-xs text-muted hover:text-foreground hover:bg-muted/10 rounded-md transition-colors cursor-pointer"
								title="导入外部内容 (网页/Word/PDF/Excel/Obsidian)"
							>
								<Upload className="w-3.5 h-3.5" />
								<span>导入</span>
							</button>
						)}
					</ToolbarGroup>

					{/* Group 8: View & Developer Tools */}
					<ToolbarGroup>
						<ToolButton
							icon={FileCode2}
							label="查看源代码"
							onClick={() => setSourceModalOpen(true)}
						/>
					</ToolbarGroup>

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
