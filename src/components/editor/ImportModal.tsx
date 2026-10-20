import { FileText, Globe, Loader2, RefreshCw, Upload, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { importWebpageRpc } from "../../services/api/editorClient";
import { markdownToHtml, parseWordDocx } from "./importers";
import { MAX_DOC_CONTENT_CHARS, MAX_IMPORT_FILE_BYTES } from "./types";

export interface ImportModalProps {
	isOpen: boolean;
	onClose: () => void;
	/** Callback after user confirms import: either create new doc or insert at cursor */
	onImport: (params: {
		title: string;
		html: string;
		target: "new" | "insert";
	}) => Promise<void>;
}

type TabKey = "web" | "file";

interface ParsedResult {
	title: string;
	html: string;
}

/**
 * Reusable preview card for parsed import results to eliminate code duplication
 */
function ImportResultPreview({
	result,
	badgeText,
	onReset,
	onConfirm,
	isSubmitting,
}: {
	result: ParsedResult;
	badgeText: string;
	onReset: () => void;
	onConfirm: (target: "new" | "insert") => Promise<void>;
	isSubmitting: boolean;
}) {
	return (
		<div className="p-4 rounded-xl bg-surface-secondary/50 border border-border space-y-3 animate-in fade-in duration-150">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-xs font-semibold text-foreground truncate max-w-[200px] sm:max-w-sm">
						{result.title}
					</span>
					<span className="text-[10px] text-success bg-success/15 px-2 py-0.5 rounded-full shrink-0">
						{badgeText}
					</span>
				</div>
				<button
					type="button"
					onClick={onReset}
					disabled={isSubmitting}
					className="text-muted hover:text-foreground text-xs flex items-center gap-1 cursor-pointer transition-colors shrink-0"
					title="重新选择"
				>
					<RefreshCw className="w-3 h-3" />
					<span>重新输入</span>
				</button>
			</div>

			<div
				className="text-xs text-muted/90 max-h-56 overflow-y-auto p-3.5 bg-surface rounded-lg border border-border/60 prose dark:prose-invert prose-xs max-w-none leading-relaxed"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: preview parsed document html
				dangerouslySetInnerHTML={{ __html: result.html }}
			/>

			<div className="flex justify-end gap-2 pt-1 flex-wrap">
				<button
					type="button"
					disabled={isSubmitting}
					onClick={() => void onConfirm("insert")}
					className="px-3.5 py-1.5 rounded-lg border border-border text-xs text-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
				>
					插入当前文档
				</button>
				<button
					type="button"
					disabled={isSubmitting}
					onClick={() => void onConfirm("new")}
					className="px-3.5 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
				>
					{isSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
					作为新文档导入
				</button>
			</div>
		</div>
	);
}

export function ImportModal({ isOpen, onClose, onImport }: ImportModalProps) {
	const [activeTab, setActiveTab] = useState<TabKey>("web");

	// Web crawling state
	const [urlInput, setUrlInput] = useState("");
	const [webLoading, setWebLoading] = useState(false);
	const [webResult, setWebResult] = useState<ParsedResult | null>(null);
	const [webError, setWebError] = useState<string | null>(null);

	// Local file upload state
	const [fileLoading, setFileLoading] = useState(false);
	const [fileResult, setFileResult] = useState<ParsedResult | null>(null);
	const [fileError, setFileError] = useState<string | null>(null);
	const [isDragging, setIsDragging] = useState(false);

	// Submitting import action
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Crawl webpage by URL
	const handleCrawlWebpage = useCallback(async () => {
		const targetUrl = urlInput.trim();
		if (!targetUrl) return;

		setWebLoading(true);
		setWebError(null);
		setWebResult(null);

		try {
			const res = await importWebpageRpc(targetUrl);
			if (!res.success) {
				setWebError(res.error || "抓取网页失败，请检查链接或网络后重试");
			} else {
				setWebResult({
					title: res.title || "导入的文章",
					html: markdownToHtml(res.markdown),
				});
			}
		} catch (err) {
			setWebError(err instanceof Error ? err.message : "抓取发生未知错误");
		} finally {
			setWebLoading(false);
		}
	}, [urlInput]);

	// Process local document file (docx, md, txt)
	const processFile = useCallback(async (file: File) => {
		setFileLoading(true);
		setFileError(null);
		setFileResult(null);

		try {
			if (file.size > MAX_IMPORT_FILE_BYTES) {
				throw new Error(
					`文件体积 ${(file.size / 1024 / 1024).toFixed(1)}MB，超过 ${MAX_IMPORT_FILE_BYTES / 1024 / 1024}MB 上限。请拆分后再导入`,
				);
			}

			const ext = file.name.split(".").pop()?.toLowerCase();
			let parsed: ParsedResult;

			if (ext === "docx") {
				parsed = await parseWordDocx(file);
			} else if (ext === "md" || ext === "txt") {
				const text = await file.text();
				parsed = {
					title: file.name.replace(/\.[^.]+$/, ""),
					html: markdownToHtml(text),
				};
			} else {
				throw new Error(
					"仅支持 Word (.docx)、Markdown (.md) 与纯文本 (.txt) 文件",
				);
			}

			if (parsed.html.length > MAX_DOC_CONTENT_CHARS) {
				throw new Error("解析后内容过长，超出单文档容量上限，请拆分后再导入");
			}

			setFileResult(parsed);
		} catch (err) {
			setFileError(err instanceof Error ? err.message : "解析文件失败");
		} finally {
			setFileLoading(false);
		}
	}, []);

	// Native input change
	const handleFileInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) {
				void processFile(file);
			}
			e.target.value = "";
		},
		[processFile],
	);

	// Drag & drop handlers
	const handleDrop = useCallback(
		(e: React.DragEvent<HTMLElement>) => {
			e.preventDefault();
			setIsDragging(false);
			const file = e.dataTransfer.files?.[0];
			if (file) {
				void processFile(file);
			}
		},
		[processFile],
	);

	const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
		e.preventDefault();
		setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
		e.preventDefault();
		setIsDragging(false);
	}, []);

	// Confirm import to editor
	const handleConfirmImport = useCallback(
		async (result: ParsedResult, target: "new" | "insert") => {
			setIsSubmitting(true);
			try {
				await onImport({
					title: result.title,
					html: result.html,
					target,
				});
				onClose();
			} catch (err) {
				window.alert(err instanceof Error ? err.message : "导入失败");
			} finally {
				setIsSubmitting(false);
			}
		},
		[onImport, onClose],
	);

	// Close modal on Escape key press
	useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !webLoading && !fileLoading && !isSubmitting) {
				onClose();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, webLoading, fileLoading, isSubmitting, onClose]);

	if (!isOpen || typeof document === "undefined") return null;

	return createPortal(
		<div
			className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
			onClick={(e) => {
				if (
					e.target === e.currentTarget &&
					!webLoading &&
					!fileLoading &&
					!isSubmitting
				) {
					onClose();
				}
			}}
		>
			<div
				className="bg-surface dark:bg-background border border-border rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
				onClick={(e) => e.stopPropagation()}
			>
				{/* 头部 */}
				<div className="flex items-center justify-between px-5 py-4 border-b border-border">
					<div className="flex items-center gap-2">
						<FileText className="w-4 h-4 text-accent" />
						<h2 className="text-sm font-semibold text-foreground">
							导入内容到创作台
						</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-muted/10 transition-colors cursor-pointer"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				{/* 选项卡（聚焦双核心高频场景） */}
				<div className="flex border-b border-border px-5 gap-6">
					<button
						type="button"
						onClick={() => setActiveTab("web")}
						className={`py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
							activeTab === "web"
								? "border-accent text-accent"
								: "border-transparent text-muted hover:text-foreground"
						}`}
					>
						<Globe className="w-3.5 h-3.5" />
						网页链接抓取
					</button>
					<button
						type="button"
						onClick={() => setActiveTab("file")}
						className={`py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
							activeTab === "file"
								? "border-accent text-accent"
								: "border-transparent text-muted hover:text-foreground"
						}`}
					>
						<Upload className="w-3.5 h-3.5" />
						本地文稿导入
					</button>
				</div>

				{/* 主内容区 */}
				<div className="flex-1 overflow-y-auto p-5 min-h-[260px]">
					{/* Tab 1: 网页链接抓取 */}
					{activeTab === "web" && (
						<div className="space-y-4">
							<p className="text-xs text-muted leading-relaxed">
								输入微信公众号、博客或任意文章链接，自动提取正文与图片排版。
							</p>

							{!webResult && (
								<div className="flex gap-2">
									<input
										type="url"
										value={urlInput}
										onChange={(e) => setUrlInput(e.target.value)}
										placeholder="https://mp.weixin.qq.com/... 或任意文章链接"
										className="flex-1 min-w-0 bg-surface-secondary border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-accent text-foreground placeholder:text-muted/60"
										onKeyDown={(e) => {
											if (e.key === "Enter") void handleCrawlWebpage();
										}}
									/>
									<button
										type="button"
										disabled={webLoading || !urlInput.trim()}
										onClick={handleCrawlWebpage}
										className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer flex items-center gap-1.5 shrink-0"
									>
										{webLoading && (
											<Loader2 className="w-3.5 h-3.5 animate-spin" />
										)}
										{webLoading ? "抓取中…" : "抓取内容"}
									</button>
								</div>
							)}

							{webError && (
								<div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs leading-relaxed">
									{webError}
								</div>
							)}

							{webResult && (
								<ImportResultPreview
									result={webResult}
									badgeText="抓取成功"
									onReset={() => {
										setWebResult(null);
										setWebError(null);
									}}
									onConfirm={(target) => handleConfirmImport(webResult, target)}
									isSubmitting={isSubmitting}
								/>
							)}
						</div>
					)}

					{/* Tab 2: 本地文稿导入 */}
					{activeTab === "file" && (
						<div className="space-y-4">
							<p className="text-xs text-muted leading-relaxed">
								支持导入 Word (.docx)、Markdown (.md) 与纯文本 (.txt) 文件。
							</p>

							{!fileResult && (
								<label
									onDrop={handleDrop}
									onDragOver={handleDragOver}
									onDragLeave={handleDragLeave}
									className={`block border-2 border-dashed rounded-xl p-8 text-center transition-colors relative cursor-pointer ${
										isDragging
											? "border-accent bg-accent/5"
											: "border-border hover:border-accent/50 bg-surface-secondary/20"
									}`}
								>
									<input
										type="file"
										accept=".docx,.md,.txt"
										onChange={handleFileInputChange}
										className="sr-only"
									/>
									<Upload className="w-8 h-8 text-muted/60 mx-auto mb-2" />
									<p className="text-xs font-medium text-foreground mb-1">
										点击选择或拖放文件到此处
									</p>
									<p className="text-[11px] text-muted">
										支持 Word (.docx)、Markdown (.md)、纯文本 (.txt)，单文件最大
										10MB
									</p>
								</label>
							)}

							{fileLoading && (
								<div className="flex items-center justify-center py-6 text-muted gap-2 text-xs">
									<Loader2 className="w-4 h-4 animate-spin" />
									正在解析文档排版…
								</div>
							)}

							{fileError && (
								<div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs leading-relaxed">
									{fileError}
								</div>
							)}

							{fileResult && (
								<ImportResultPreview
									result={fileResult}
									badgeText="解析完成"
									onReset={() => {
										setFileResult(null);
										setFileError(null);
									}}
									onConfirm={(target) =>
										handleConfirmImport(fileResult, target)
									}
									isSubmitting={isSubmitting}
								/>
							)}
						</div>
					)}
				</div>
			</div>
		</div>,
		document.body,
	);
}
