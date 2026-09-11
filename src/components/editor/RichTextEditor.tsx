import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
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
	Minus,
	PencilLine,
	Quote,
	Redo2,
	Strikethrough,
	Undo2,
	Unlink,
	Upload,
	Video,
} from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";
import { uploadAssetRpc } from "../../services/api/editorClient";
import { AiBubbleMenu } from "./AiBubbleMenu";
import { CodeBlockWithHighlight } from "./extensions/CodeBlockWithHighlight";
import { extractImageUrl, extractVideoUrl, markdownToHtml } from "./importers";
import { VideoNode } from "./videoNode";

/**
 * Convert file to Base64 data URL as fallback when server upload fails
 */
function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

/**
 * Extract files from clipboard or drag dataTransfer
 */
function extractMediaFiles(
	dataTransfer: DataTransfer | null | undefined,
): File[] {
	if (!dataTransfer) return [];
	const files: File[] = [];

	if (dataTransfer.files && dataTransfer.files.length > 0) {
		for (let i = 0; i < dataTransfer.files.length; i++) {
			const file = dataTransfer.files.item(i);
			if (file) files.push(file);
		}
	} else if (dataTransfer.items && dataTransfer.items.length > 0) {
		for (let i = 0; i < dataTransfer.items.length; i++) {
			const item = dataTransfer.items[i];
			if (item.kind === "file") {
				const file = item.getAsFile();
				if (file) files.push(file);
			}
		}
	}
	return files;
}

/**
 * Update media node src attribute when async upload finishes
 */
function updateMediaSrc(editor: Editor, oldSrc: string, newSrc: string) {
	let found = false;
	editor.state.doc.descendants((node, pos) => {
		if (found) return false;
		if (
			(node.type.name === "image" || node.type.name === "video") &&
			node.attrs.src === oldSrc
		) {
			editor.view.dispatch(
				editor.state.tr.setNodeAttribute(pos, "src", newSrc),
			);
			found = true;
			return false;
		}
	});
}

/**
 * 常见 Markdown 语法特征模式集
 */
const MARKDOWN_PATTERNS: readonly RegExp[] = [
	/^#{1,6}\s+/m,
	/^\s*[-*+]\s+/m,
	/^\s*\d+\.\s+/m,
	/^\s*>\s+/m,
	/```[\s\S]*?```/,
	/\*\*[^*]+?\*\*/,
	/~~[^~]+?~~/,
	/`[^`]+`/,
	/\[.+?\]\(.+?\)/,
	// GFM table: line starting and ending with |
	/^\|.+\|/m,
];

/**
 * High-confidence markdown block patterns
 */
const STRONG_MARKDOWN_BLOCKS = {
	// Fenced code block: ```python ... ```
	codeBlock: /```[\s\S]*?```/,
	// GFM table divider: |---|---|
	tableDivider: /^\|?\s*:?-{2,}:?\s*(\|?\s*:?-{2,}:?\s*)+\|?$/m,
	// Markdown heading: # Title
	heading: /^#{1,6}\s+\S+/m,
};

/**
 * Determine whether pasted clipboard content should be treated and converted as Markdown:
 * 1. Plain text must match Markdown syntax characteristics.
 * 2. If clipboard also contains HTML, check if HTML is merely a shallow wrapper (e.g. browser wrapping raw lines in <p>/<div>)
 *    rather than genuinely rendered rich text (e.g. <table>, <pre>, <h1-6>).
 */
function shouldTreatAsMarkdown(
	text: string,
	html: string | undefined,
): boolean {
	if (!text || !MARKDOWN_PATTERNS.some((p) => p.test(text))) {
		return false;
	}
	if (!html || !html.trim()) {
		return true;
	}

	// If text contains strong markdown blocks (code fences, tables, headings) but HTML lacks corresponding rendered tags,
	// it means HTML is just a plain container wrapping unrendered markdown text.
	if (STRONG_MARKDOWN_BLOCKS.codeBlock.test(text) && !/<pre[\s>]/i.test(html)) {
		return true;
	}
	if (
		STRONG_MARKDOWN_BLOCKS.tableDivider.test(text) &&
		!/<table[\s>]/i.test(html)
	) {
		return true;
	}
	if (
		STRONG_MARKDOWN_BLOCKS.heading.test(text) &&
		!/<h[1-6][\s>]/i.test(html)
	) {
		return true;
	}

	// For general markdown, only block conversion if HTML contains actual rendered semantic blocks
	// (Note: <p>, <div>, <span>, <br> are intentionally excluded because browsers wrap almost any copied text in them).
	const hasRenderedSemanticBlocks =
		/<(h[1-6]|ul|ol|blockquote|table|pre)[\s>]/i.test(html);
	return !hasRenderedSemanticBlocks;
}

export interface RichTextEditorProps {
	/** 文档 id（媒体上传需要） */
	docId: number;
	/** TipTap JSON 字符串（初始内容；组件以 docId 为 key 重挂载，不做增量同步） */
	initialContent: string;
	/** 内容变化回调（父组件负责防抖落库） */
	onChange: (contentJson: string, contentText: string) => void;
	/** AI bar 文本生成（AI bar 专用，由父组件注入以解耦服务端依赖） */
	onAiGenerate?: (prompt: string) => Promise<string>;
	/** AI bar 改写前快照回调（由父组件负责打版本快照） */
	onBeforeAiApply?: () => Promise<void>;
	/** 暴露 TipTap Editor 实例给父组件（用于导入插入内容等外部指令） */
	onEditorReady?: (editor: import("@tiptap/react").Editor | null) => void;
	/** 点击顶部工具栏导入按钮回调 */
	onOpenImport?: () => void;
}

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
			title={label}
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			className={`p-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
				active
					? "bg-accent/15 text-accent"
					: "text-muted hover:text-foreground hover:bg-muted/10"
			}`}
		>
			<Icon className="w-4 h-4" />
		</button>
	);
}

function Divider() {
	return <div className="w-px h-5 bg-border mx-1 shrink-0" />;
}

/**
 * TipTap 富文本编辑器（docs/editor-plan.md Editor-α）：
 * 段落/标题/列表/引用/分割线 + 图片/视频节点 + undo/redo + 预览切换。
 */
export function RichTextEditor({
	docId,
	initialContent,
	onChange,
	onAiGenerate,
	onBeforeAiApply,
	onEditorReady,
	onOpenImport,
}: RichTextEditorProps) {
	const [, forceRender] = useReducer((x: number) => x + 1, 0);
	const [preview, setPreview] = useState(false);
	const [uploading, setUploading] = useState(false);
	const imageInputRef = useRef<HTMLInputElement>(null);
	const videoInputRef = useRef<HTMLInputElement>(null);

	const editorRef = useRef<Editor | null>(null);

	const uploadAndInsertMedia = async (file: File, kind: "image" | "video") => {
		const currentEditor = editorRef.current;
		if (!currentEditor) return;
		setUploading(true);
		const tempUrl = URL.createObjectURL(file);

		// Immediately insert preview for instant UI feedback
		if (kind === "image") {
			currentEditor.chain().focus().setImage({ src: tempUrl }).run();
		} else {
			currentEditor
				.chain()
				.focus()
				.insertContent({ type: "video", attrs: { src: tempUrl } })
				.run();
		}

		try {
			const { url } = await uploadAssetRpc(docId, file);
			updateMediaSrc(currentEditor, tempUrl, url);
		} catch (err) {
			console.error("Failed to upload asset, falling back to base64:", err);
			try {
				const base64 = await fileToDataUrl(file);
				updateMediaSrc(currentEditor, tempUrl, base64);
			} catch {
				window.alert(err instanceof Error ? err.message : String(err));
			}
		} finally {
			URL.revokeObjectURL(tempUrl);
			setUploading(false);
		}
	};

	const editor = useEditor({
		immediatelyRender: false,
		extensions: [
			StarterKit.configure({
				heading: { levels: [1, 2, 3] },
				link: { openOnClick: false },
				codeBlock: false,
			}),
			CodeBlockWithHighlight,
			Image.configure({
				HTMLAttributes: {
					referrerpolicy: "no-referrer",
				},
			}),
			VideoNode,
			Table.configure({ resizable: false }),
			TableRow,
			TableHeader,
			TableCell,
			Placeholder.configure({ placeholder: "开始创作…" }),
		],
		editorProps: {
			handlePaste: (_view, event) => {
				// 1. Check for media files (pasted screenshots, copied images/videos)
				const mediaFiles = extractMediaFiles(event.clipboardData).filter(
					(f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
				);
				if (mediaFiles.length > 0) {
					event.preventDefault();
					for (const file of mediaFiles) {
						const kind = file.type.startsWith("image/") ? "image" : "video";
						uploadAndInsertMedia(file, kind);
					}
					return true;
				}

				// 2. Check for plain text URLs (video URL, image URL, or markdown)
				const text = event.clipboardData?.getData("text/plain")?.trim();
				if (text && editorRef.current) {
					// 2.1 Video URL -> render directly as interactive video
					const videoUrl = extractVideoUrl(text);
					if (videoUrl) {
						editorRef.current
							.chain()
							.focus()
							.insertContent({ type: "video", attrs: { src: videoUrl } })
							.run();
						return true;
					}

					// 2.2 Image URL -> render directly as image
					const imageUrl = extractImageUrl(text);
					if (imageUrl) {
						editorRef.current.chain().focus().setImage({ src: imageUrl }).run();
						return true;
					}

					// 2.3 Markdown content -> convert to formatted rich text
					const html = event.clipboardData?.getData("text/html");
					if (shouldTreatAsMarkdown(text, html)) {
						const converted = markdownToHtml(text);
						if (converted) {
							editorRef.current.commands.insertContent(converted);
							return true;
						}
					}
				}
				return false;
			},
			handleDrop: (_view, event, _slice, moved) => {
				if (moved) return false;
				const mediaFiles = extractMediaFiles(event.dataTransfer).filter(
					(f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
				);
				if (mediaFiles.length > 0) {
					event.preventDefault();
					for (const file of mediaFiles) {
						const kind = file.type.startsWith("image/") ? "image" : "video";
						uploadAndInsertMedia(file, kind);
					}
					return true;
				}
				return false;
			},
		},
		content: initialContent ? JSON.parse(initialContent) : "",
		onUpdate: ({ editor: e }) => {
			onChange(JSON.stringify(e.getJSON()), e.getText());
		},
		onTransaction: () => forceRender(),
	});

	editorRef.current = editor;

	useEffect(() => {
		onEditorReady?.(editor);
		return () => {
			onEditorReady?.(null);
		};
	}, [editor, onEditorReady]);

	if (!editor) return null;

	const insertImageUrl = () => {
		const url = window.prompt("图片 URL");
		if (url?.trim()) editor.chain().focus().setImage({ src: url.trim() }).run();
	};

	const insertVideoUrl = () => {
		const url = window.prompt("视频 URL");
		if (url?.trim()) {
			editor
				.chain()
				.focus()
				.insertContent({ type: "video", attrs: { src: url.trim() } })
				.run();
		}
	};

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

	const handleUpload = (file: File, kind: "image" | "video") => {
		uploadAndInsertMedia(file, kind);
	};

	const togglePreview = () => {
		const next = !preview;
		setPreview(next);
		editor.setEditable(!next);
	};

	return (
		<div className="flex flex-col flex-1 min-h-0">
			{/* 工具栏 */}
			<div className="shrink-0 border-b border-border bg-surface/60 px-4 py-1.5 flex items-center gap-0.5 flex-wrap">
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
							onClick={togglePreview}
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
							onClick={() => imageInputRef.current?.click()}
						/>
						<ToolButton
							icon={Video}
							label="本地视频"
							disabled={uploading}
							onClick={() => videoInputRef.current?.click()}
						/>
						<button
							type="button"
							onClick={insertImageUrl}
							className="px-2 py-1 text-xs text-muted hover:text-foreground hover:bg-muted/10 rounded-md transition-colors cursor-pointer"
						>
							外链图片
						</button>
						<button
							type="button"
							onClick={insertVideoUrl}
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
						<ToolButton
							icon={Eye}
							label="预览"
							active={false}
							onClick={togglePreview}
						/>
					</>
				)}
			</div>

			{/* AI BubbleMenu — appears on text selection */}
			{editor && !preview && (
				<AiBubbleMenu
					editor={editor}
					onGenerate={onAiGenerate}
					onBeforeApply={onBeforeAiApply}
				/>
			)}

			{/* 编辑画布 / 仿 DocViewerApp 纸质沉浸预览 */}
			{preview ? (
				<div className="doc-scroll-container flex-1 overflow-y-auto min-h-0 bg-slate-100/70 dark:bg-zinc-950/70 flex justify-center items-start py-6 px-4">
					<article className="document-paper w-full max-w-[860px] my-2 mb-12 h-fit shrink-0 bg-surface text-foreground rounded-2xl shadow-sm border border-border p-8 sm:p-14 transition-all">
						<EditorContent
							editor={editor}
							className="tiptap-editor doc-content-body prose prose-neutral dark:prose-invert max-w-none focus:outline-none"
						/>
					</article>
				</div>
			) : (
				<div className="flex-1 overflow-y-auto min-h-0">
					<div className="max-w-3xl mx-auto px-8 py-6">
						<EditorContent
							editor={editor}
							className="tiptap-editor prose prose-neutral dark:prose-invert max-w-none focus:outline-none"
						/>
					</div>
				</div>
			)}

			<input
				ref={imageInputRef}
				type="file"
				accept="image/*"
				className="hidden"
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) handleUpload(file, "image");
					e.target.value = "";
				}}
			/>
			<input
				ref={videoInputRef}
				type="file"
				accept="video/*"
				className="hidden"
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) handleUpload(file, "video");
					e.target.value = "";
				}}
			/>
		</div>
	);
}
