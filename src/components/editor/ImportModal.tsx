import {
	FileSpreadsheet,
	FileText,
	Globe,
	Loader2,
	Upload,
	X,
} from "lucide-react";
import { useCallback, useState } from "react";
import {
	importWebpageRpc,
	listObsidianNotesRpc,
	type ObsidianNoteItem,
	readObsidianNoteRpc,
} from "../../services/api/editorClient";
import {
	markdownToHtml,
	parseExcelTable,
	parsePdfText,
	parseWordDocx,
} from "./importers";

export interface ImportModalProps {
	isOpen: boolean;
	onClose: () => void;
	/** 导入回调：模式为新建文档或插入当前正文 */
	onImport: (params: {
		title: string;
		html: string;
		target: "new" | "insert";
	}) => Promise<void>;
}

type TabKey = "web" | "file" | "obsidian";

export function ImportModal({ isOpen, onClose, onImport }: ImportModalProps) {
	const [activeTab, setActiveTab] = useState<TabKey>("web");
	const [urlInput, setUrlInput] = useState("");
	const [webLoading, setWebLoading] = useState(false);
	const [webResult, setWebResult] = useState<{
		title: string;
		html: string;
	} | null>(null);
	const [webError, setWebError] = useState<string | null>(null);

	// 本地文件解析状态
	const [fileLoading, setFileLoading] = useState(false);
	const [fileResult, setFileResult] = useState<{
		title: string;
		html: string;
	} | null>(null);
	const [fileError, setFileError] = useState<string | null>(null);

	// Obsidian 库导入状态
	const [vaultPath, setVaultPath] = useState("~/Documents/Obsidian");
	const [obsidianLoading, setObsidianLoading] = useState(false);
	const [obsidianNotes, setObsidianNotes] = useState<ObsidianNoteItem[]>([]);
	const [obsidianError, setObsidianError] = useState<string | null>(null);
	const [importingObsidian, setImportingObsidian] = useState(false);

	// 抓取网页
	const handleCrawlWebpage = useCallback(async () => {
		if (!urlInput.trim()) return;
		setWebLoading(true);
		setWebError(null);
		setWebResult(null);
		try {
			const res = await importWebpageRpc(urlInput.trim());
			if (!res.success) {
				setWebError(res.error || "抓取网页失败");
			} else {
				setWebResult({
					title: res.title || "导入的网页",
					html: markdownToHtml(res.markdown),
				});
			}
		} catch (err) {
			setWebError(err instanceof Error ? err.message : "抓取发生未知错误");
		} finally {
			setWebLoading(false);
		}
	}, [urlInput]);

	// 处理本地文件上传
	const handleFileUpload = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;
			setFileLoading(true);
			setFileError(null);
			setFileResult(null);

			try {
				const ext = file.name.split(".").pop()?.toLowerCase();
				let parsed: { title: string; html: string };

				if (ext === "docx") {
					parsed = await parseWordDocx(file);
				} else if (ext === "pdf") {
					parsed = await parsePdfText(file);
				} else if (ext === "xlsx" || ext === "xls" || ext === "csv") {
					parsed = await parseExcelTable(file);
				} else if (ext === "md" || ext === "txt") {
					const text = await file.text();
					parsed = {
						title: file.name.replace(/\.[^.]+$/, ""),
						html: markdownToHtml(text),
					};
				} else {
					throw new Error(
						"不支持的文件类型，请选择 Word/PDF/Excel/Markdown 文件",
					);
				}

				setFileResult(parsed);
			} catch (err) {
				setFileError(err instanceof Error ? err.message : "解析文件失败");
			} finally {
				setFileLoading(false);
				e.target.value = "";
			}
		},
		[],
	);

	// 扫描 Obsidian Vault
	const handleScanObsidian = useCallback(async () => {
		if (!vaultPath.trim()) return;
		setObsidianLoading(true);
		setObsidianError(null);
		try {
			const res = await listObsidianNotesRpc(vaultPath.trim());
			if (!res.success) {
				setObsidianError(res.error || "扫描目录失败");
				setObsidianNotes([]);
			} else {
				setObsidianNotes(res.notes);
			}
		} catch (err) {
			setObsidianError(err instanceof Error ? err.message : "读取失败");
		} finally {
			setObsidianLoading(false);
		}
	}, [vaultPath]);

	// 导入选中的单个 Obsidian 笔记
	const handleImportObsidianNote = useCallback(
		async (note: ObsidianNoteItem, target: "new" | "insert") => {
			setImportingObsidian(true);
			try {
				const res = await readObsidianNoteRpc(
					vaultPath.trim(),
					note.relativePath,
				);
				if (!res.success) {
					window.alert(res.error || "读取笔记内容失败");
					return;
				}
				await onImport({
					title: res.title,
					html: markdownToHtml(res.content),
					target,
				});
				onClose();
			} catch (err) {
				window.alert(err instanceof Error ? err.message : "导入失败");
			} finally {
				setImportingObsidian(false);
			}
		},
		[vaultPath, onImport, onClose],
	);

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
			<div className="bg-surface dark:bg-background border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
				{/* 头部 */}
				<div className="flex items-center justify-between px-5 py-4 border-b border-border">
					<div className="flex items-center gap-2">
						<FileText className="w-5 h-5 text-accent" />
						<h2 className="text-base font-semibold">导入内容到创作台</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-muted/10 transition-colors cursor-pointer"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				{/* 标签栏 */}
				<div className="flex border-b border-border px-5 gap-4">
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
						网页 URL 抓取
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
						本地文件 (Word/PDF/Excel/MD)
					</button>
					<button
						type="button"
						onClick={() => setActiveTab("obsidian")}
						className={`py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
							activeTab === "obsidian"
								? "border-accent text-accent"
								: "border-transparent text-muted hover:text-foreground"
						}`}
					>
						<FileSpreadsheet className="w-3.5 h-3.5" />
						Obsidian 库导入
					</button>
				</div>

				{/* 主内容区 */}
				<div className="flex-1 overflow-y-auto p-5 min-h-[300px]">
					{/* Tab 1: 网页 URL */}
					{activeTab === "web" && (
						<div className="space-y-4">
							<p className="text-xs text-muted leading-relaxed">
								复用浏览器静默爬虫通道（携带真实登录态与 SPA
								渲染），抓取页面正文并提纯为富文本排版。
							</p>
							<div className="flex gap-2">
								<input
									type="url"
									value={urlInput}
									onChange={(e) => setUrlInput(e.target.value)}
									placeholder="https://example.com/article"
									className="flex-1 bg-surface-secondary border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-accent"
									onKeyDown={(e) => {
										if (e.key === "Enter") void handleCrawlWebpage();
									}}
								/>
								<button
									type="button"
									disabled={webLoading || !urlInput.trim()}
									onClick={handleCrawlWebpage}
									className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
								>
									{webLoading && (
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
									)}
									抓取内容
								</button>
							</div>

							{webError && (
								<div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">
									{webError}
								</div>
							)}

							{webResult && (
								<div className="p-4 rounded-lg bg-surface-secondary/40 border border-border space-y-3">
									<div className="flex items-center justify-between">
										<span className="text-xs font-semibold text-foreground">
											{webResult.title}
										</span>
										<span className="text-[10px] text-success bg-success/15 px-2 py-0.5 rounded-full">
											抓取成功
										</span>
									</div>
									<div
										className="text-xs text-muted/90 max-h-64 overflow-y-auto p-3 bg-surface rounded border border-border/50 prose dark:prose-invert prose-xs max-w-none"
										// biome-ignore lint/security/noDangerouslySetInnerHtml: preview parsed html
										dangerouslySetInnerHTML={{ __html: webResult.html }}
									/>
									<div className="flex justify-end gap-2 pt-2">
										<button
											type="button"
											onClick={async () => {
												await onImport({ ...webResult, target: "insert" });
												onClose();
											}}
											className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted hover:text-foreground transition-colors cursor-pointer"
										>
											插入当前文档
										</button>
										<button
											type="button"
											onClick={async () => {
												await onImport({ ...webResult, target: "new" });
												onClose();
											}}
											className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
										>
											作为新文档导入
										</button>
									</div>
								</div>
							)}
						</div>
					)}

					{/* Tab 2: 本地文件上传 */}
					{activeTab === "file" && (
						<div className="space-y-4">
							<div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-accent/50 transition-colors relative">
								<input
									type="file"
									accept=".docx,.pdf,.xlsx,.xls,.csv,.md,.txt"
									onChange={handleFileUpload}
									className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
								/>
								<Upload className="w-8 h-8 text-muted/50 mx-auto mb-2" />
								<p className="text-xs font-medium text-foreground mb-1">
									点击选择或拖放文件到此处
								</p>
								<p className="text-[11px] text-muted">
									支持 Word (.docx)、PDF (.pdf)、Excel (.xlsx/.csv)、Markdown
									(.md)
								</p>
							</div>

							{fileLoading && (
								<div className="flex items-center justify-center py-6 text-muted gap-2 text-xs">
									<Loader2 className="w-4 h-4 animate-spin" />
									正在解析文件排版…
								</div>
							)}

							{fileError && (
								<div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">
									{fileError}
								</div>
							)}

							{fileResult && (
								<div className="p-4 rounded-lg bg-surface-secondary/40 border border-border space-y-3">
									<div className="flex items-center justify-between">
										<span className="text-xs font-semibold text-foreground">
											{fileResult.title}
										</span>
										<span className="text-[10px] text-success bg-success/15 px-2 py-0.5 rounded-full">
											解析完成
										</span>
									</div>
									<div
										className="text-xs text-muted/90 max-h-64 overflow-y-auto p-3 bg-surface rounded border border-border/50 prose dark:prose-invert prose-xs max-w-none"
										// biome-ignore lint/security/noDangerouslySetInnerHtml: preview parsed html
										dangerouslySetInnerHTML={{ __html: fileResult.html }}
									/>
									<div className="flex justify-end gap-2 pt-2">
										<button
											type="button"
											onClick={async () => {
												await onImport({ ...fileResult, target: "insert" });
												onClose();
											}}
											className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted hover:text-foreground transition-colors cursor-pointer"
										>
											插入当前文档
										</button>
										<button
											type="button"
											onClick={async () => {
												await onImport({ ...fileResult, target: "new" });
												onClose();
											}}
											className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
										>
											作为新文档导入
										</button>
									</div>
								</div>
							)}
						</div>
					)}

					{/* Tab 3: Obsidian 库导入 */}
					{activeTab === "obsidian" && (
						<div className="space-y-4">
							<p className="text-xs text-muted leading-relaxed">
								扫描本地 Obsidian 笔记库目录中的 Markdown
								笔记，支持一键载入创作台进行富文本加工。
							</p>
							<div className="flex gap-2">
								<input
									type="text"
									value={vaultPath}
									onChange={(e) => setVaultPath(e.target.value)}
									placeholder="Obsidian 库本地绝对路径，如 ~/Documents/Obsidian"
									className="flex-1 bg-surface-secondary border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-accent"
								/>
								<button
									type="button"
									disabled={obsidianLoading || !vaultPath.trim()}
									onClick={handleScanObsidian}
									className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
								>
									{obsidianLoading && (
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
									)}
									扫描笔记
								</button>
							</div>

							{obsidianError && (
								<div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">
									{obsidianError}
								</div>
							)}

							<div className="max-h-60 overflow-y-auto space-y-1 rounded-lg border border-border p-1 bg-surface-secondary/20">
								{obsidianNotes.length === 0 && !obsidianLoading && (
									<div className="text-center py-8 text-xs text-muted">
										请输入本地 Obsidian Vault 路径并点击「扫描笔记」
									</div>
								)}
								{obsidianNotes.map((note) => (
									<div
										key={note.relativePath}
										className="flex items-center justify-between p-2 rounded-md hover:bg-muted/10 transition-colors text-xs"
									>
										<div className="flex-1 min-w-0 pr-2">
											<p className="font-medium text-foreground truncate">
												{note.name}
											</p>
											<p className="text-[10px] text-muted truncate">
												{note.relativePath} ·{" "}
												{Math.max(1, Math.round(note.size / 1024))} KB
											</p>
										</div>
										<div className="flex items-center gap-1.5 shrink-0">
											<button
												type="button"
												disabled={importingObsidian}
												onClick={() =>
													void handleImportObsidianNote(note, "insert")
												}
												className="px-2 py-1 rounded text-[11px] border border-border text-muted hover:text-foreground transition-colors cursor-pointer"
											>
												插入
											</button>
											<button
												type="button"
												disabled={importingObsidian}
												onClick={() =>
													void handleImportObsidianNote(note, "new")
												}
												className="px-2 py-1 rounded text-[11px] bg-accent/15 text-accent hover:bg-accent/25 transition-colors cursor-pointer"
											>
												新文档
											</button>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
