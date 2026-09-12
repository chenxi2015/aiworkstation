import { type Editor, EditorContent } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { AiBubbleMenu } from "./AiBubbleMenu";
import { EditorToolbar } from "./components/EditorToolbar";
import { PipelineProgressFloatingBar } from "./components/PipelineProgressFloatingBar";
import { ScrollToTopButton } from "./components/ScrollToTopButton";
import { SlashCommandMenu } from "./components/SlashCommandMenu";
import { TableActionMenu } from "./components/TableActionMenu";
import { EditorMediaContext } from "./extensions/MediaNodeView";
import { useEditorMediaUpload } from "./hooks/useEditorMediaUpload";
import { useParagraphRewritePipeline } from "./hooks/useParagraphRewritePipeline";
import { useRichTextEditor } from "./hooks/useRichTextEditor";

export interface RichTextEditorProps {
	/** 文档 id（媒体上传需要） */
	docId: number;
	/** 文档标题（AI 篇章上下文参考） */
	docTitle?: string;
	/** 文档风格预设（AI 润色/改写参考） */
	stylePreset?: string;
	/** TipTap JSON 字符串（初始内容；组件以 docId 为 key 重挂载，不做增量同步） */
	initialContent: string;
	/** 内容变化回调（父组件负责防抖落库） */
	onChange: (contentJson: string, contentText: string) => void;
	/** AI bar 文本生成（AI bar 专用，由父组件注入以解耦服务端依赖） */
	onAiGenerate?: (prompt: string) => Promise<string>;
	/** AI bar 改写前快照回调（由父组件负责打版本快照） */
	onBeforeAiApply?: () => Promise<void>;
	/** 暴露 TipTap Editor 实例给父组件（用于导入插入内容等外部指令） */
	onEditorReady?: (editor: Editor | null) => void;
	/** 点击顶部工具栏导入按钮回调 */
	onOpenImport?: () => void;
	/** 启动分屏改写对比视图 */
	onOpenSplitRewrite?: () => void;
	/** 暴露段落流水线触发器给父组件（用于 AI 侧边栏跨模块触发） */
	onRegisterPipeline?: (
		trigger: (instruction?: string) => Promise<void>,
	) => void;
}

/**
 * TipTap 富文本编辑器主组件：
 * 组装工具栏、画布、媒体上传与 AI/表格/斜杠交互菜单。
 */
export function RichTextEditor({
	docId,
	docTitle,
	stylePreset,
	initialContent,
	onChange,
	onAiGenerate,
	onBeforeAiApply,
	onEditorReady,
	onOpenImport,
	onOpenSplitRewrite,
	onRegisterPipeline,
}: RichTextEditorProps) {
	const [preview, setPreview] = useState(false);
	const [showScrollTop, setShowScrollTop] = useState(false);
	const editorRef = useRef<Editor | null>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	// 1. Media upload management
	const mediaUpload = useEditorMediaUpload({
		docId,
		editorRef,
	});

	// 2. Editor instance & extension lifecycle
	const { editor, slashMenu, setSlashMenu, slashMenuRef } = useRichTextEditor({
		docId,
		initialContent,
		onChange,
		onEditorReady,
		insertAndUploadMediaFiles: mediaUpload.insertAndUploadMediaFiles,
		externalEditorRef: editorRef,
	});

	// 3. Sequential streaming paragraph rewrite pipeline
	const pipeline = useParagraphRewritePipeline({
		editor,
		docTitle,
		stylePreset,
		onBeforeAiApply,
	});

	useEffect(() => {
		onRegisterPipeline?.(pipeline.startPipeline);
	}, [onRegisterPipeline, pipeline.startPipeline]);

	if (!editor) return null;

	const togglePreview = () => {
		const next = !preview;
		setPreview(next);
		editor.setEditable(!next);
		setShowScrollTop(false);
	};

	const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
		const isScrolled = e.currentTarget.scrollTop > 200;
		setShowScrollTop(isScrolled);
	};

	const handleScrollToTop = () => {
		scrollContainerRef.current?.scrollTo({
			top: 0,
			behavior: "smooth",
		});
	};

	return (
		<div className="flex flex-col flex-1 min-h-0">
			{/* 顶部工具栏 */}
			<EditorToolbar
				editor={editor}
				preview={preview}
				uploading={mediaUpload.uploading}
				onTogglePreview={togglePreview}
				onSelectLocalImages={mediaUpload.triggerSelectLocalImages}
				onSelectLocalVideos={mediaUpload.triggerSelectLocalVideos}
				onInsertImageUrl={mediaUpload.promptInsertImageUrl}
				onInsertVideoUrl={mediaUpload.promptInsertVideoUrl}
				onOpenImport={onOpenImport}
				onOpenSplitRewrite={onOpenSplitRewrite}
			/>

			{/* AI BubbleMenu — appears on text selection */}
			{!preview && (
				<AiBubbleMenu
					editor={editor}
					onGenerate={onAiGenerate}
					onBeforeApply={onBeforeAiApply}
					isPipelineRunning={pipeline.isStreaming}
				/>
			)}

			{/* Floating Table Action Menu */}
			{!preview && <TableActionMenu editor={editor} />}

			{/* Slash Command floating menu */}
			{slashMenu && !preview && (
				<SlashCommandMenu
					ref={slashMenuRef}
					editor={editor}
					range={slashMenu.range}
					query={slashMenu.query}
					clientRect={slashMenu.clientRect}
					onClose={() => setSlashMenu(null)}
					onSelectMedia={(kind) => {
						if (kind === "image") mediaUpload.triggerSelectLocalImages();
						else mediaUpload.triggerSelectLocalVideos();
					}}
				/>
			)}

			{/* 编辑画布 / 仿纸质沉浸预览 */}
			<div className="relative flex-1 min-h-0 flex flex-col">
				<EditorMediaContext.Provider value={{ docId }}>
					{preview ? (
						<div
							ref={scrollContainerRef}
							onScroll={handleScroll}
							className="doc-scroll-container flex-1 overflow-y-auto min-h-0 bg-slate-100/70 dark:bg-zinc-950/70 flex justify-center items-start py-6 px-4"
						>
							<article className="document-paper w-full max-w-[860px] my-2 mb-12 h-fit shrink-0 bg-surface text-foreground rounded-2xl shadow-sm border border-border p-8 sm:p-14 transition-all">
								<EditorContent
									editor={editor}
									className="tiptap-editor doc-content-body prose prose-neutral dark:prose-invert max-w-none focus:outline-none"
								/>
							</article>
						</div>
					) : (
						<div
							ref={scrollContainerRef}
							onScroll={handleScroll}
							className="flex-1 overflow-y-auto min-h-0"
						>
							<div className="max-w-3xl mx-auto px-8 py-6">
								<EditorContent
									editor={editor}
									className="tiptap-editor prose prose-neutral dark:prose-invert max-w-none focus:outline-none"
								/>
							</div>
						</div>
					)}
				</EditorMediaContext.Provider>

				{/* 滚动置顶按钮 */}
				<ScrollToTopButton
					visible={showScrollTop}
					onClick={handleScrollToTop}
				/>

				{/* AI 逐段流式改写进度与批量审阅条 */}
				<PipelineProgressFloatingBar
					isStreaming={pipeline.isStreaming}
					currentStep={pipeline.currentStep}
					totalSteps={pipeline.totalSteps}
					hasActiveSuggestions={pipeline.activeSuggestionCount > 0}
					onStop={pipeline.stopPipeline}
					onAcceptAll={pipeline.acceptAll}
					onRejectAll={pipeline.rejectAll}
				/>
			</div>

			{/* 隐藏文件选择器 */}
			<input
				ref={mediaUpload.imageInputRef}
				type="file"
				accept="image/*"
				multiple
				className="hidden"
				onChange={(e) => {
					const files = Array.from(e.target.files || []);
					if (files.length > 0) mediaUpload.insertAndUploadMediaFiles(files);
					e.target.value = "";
				}}
			/>
			<input
				ref={mediaUpload.videoInputRef}
				type="file"
				accept="video/*"
				multiple
				className="hidden"
				onChange={(e) => {
					const files = Array.from(e.target.files || []);
					if (files.length > 0) mediaUpload.insertAndUploadMediaFiles(files);
					e.target.value = "";
				}}
			/>
		</div>
	);
}
