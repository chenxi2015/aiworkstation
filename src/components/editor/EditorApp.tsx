import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { renderToHTMLString } from "@tiptap/static-renderer/pm/html-string";
import dayjs from "dayjs";
import {
	Archive,
	CheckCircle2,
	Copy,
	Download,
	FilePlus2,
	FileText,
	Loader2,
	Printer,
	Sliders,
	Trash2,
	Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NavLayoutEntry } from "../../modules/registry";
import { getWorkbenchSettings } from "../../server/functions/workbench";
import {
	createDocumentRpc,
	deleteDocumentRpc,
	fetchDocuments,
	generateAiBarTextRpc,
	snapshotVersionRpc,
	updateDocumentRpc,
} from "../../services/api/editorClient";
import { ConfirmDialog } from "../workbench/ConfirmDialog";
import { useWorkbenchQuickActions } from "../workbench/layout/useWorkbenchQuickActions";
import { WorkbenchHeader } from "../workbench/layout/WorkbenchHeader";
import type { Folder } from "../workbench/types";
import { exportToPdfPrint, exportToWordDocx } from "./exporters";
import { ImportModal } from "./ImportModal";
import { tiptapJsonToMarkdown } from "./markdown";
import { RichTextEditor } from "./RichTextEditor";
import { StylePresetModal } from "./StylePresetModal";
import {
	DEFAULT_STYLE_PRESETS,
	type EditorDocument,
	type EditorStylePreset,
} from "./types";
import { VideoNode } from "./videoNode";

/** 导出用扩展集合（与 RichTextEditor 内保持一致） */
const EXPORT_EXTENSIONS = [
	StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
	Image.configure({
		HTMLAttributes: {
			referrerpolicy: "no-referrer",
		},
	}),
	VideoNode,
];

export interface EditorAppProps {
	unclassifiedCount: number;
	navLayout?: NavLayoutEntry[];
	folders: Folder[];
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const STATUS_LABELS: Record<EditorDocument["status"], string> = {
	editing: "编辑中",
	finalized: "已定稿",
	archived: "已归档",
};

/** 自动保存防抖（毫秒） */
const AUTOSAVE_DELAY = 800;

/**
 * 创作模块主页（docs/editor-plan.md Editor-α）：
 * 左：文档列表（草稿箱）；中：标题 + TipTap 画布；底：字数/保存状态/导出。
 */
export function EditorApp({
	unclassifiedCount,
	navLayout,
	folders,
}: EditorAppProps) {
	const { actionProps, modals } = useWorkbenchQuickActions({ folders });
	const [documents, setDocuments] = useState<EditorDocument[]>([]);
	const [loading, setLoading] = useState(true);
	const [activeId, setActiveId] = useState<number | null>(null);
	const [saveState, setSaveState] = useState<SaveState>("idle");
	const [savedAt, setSavedAt] = useState<string | null>(null);
	const [contentText, setContentText] = useState("");
	const [deletingDoc, setDeletingDoc] = useState<EditorDocument | null>(null);
	const [isImportModalOpen, setIsImportModalOpen] = useState(false);
	const [isStylePresetModalOpen, setIsStylePresetModalOpen] = useState(false);
	const [stylePresets, setStylePresets] = useState<EditorStylePreset[]>(
		DEFAULT_STYLE_PRESETS,
	);
	const editorInstanceRef = useRef<import("@tiptap/react").Editor | null>(null);
	const pendingImportHtmlRef = useRef<{ docId: number; html: string } | null>(
		null,
	);

	const activeDoc = useMemo(
		() => documents.find((d) => d.id === activeId) ?? null,
		[documents, activeId],
	);

	/** 待保存的脏数据（防抖窗口内的最新值） */
	const pendingRef = useRef<{
		title?: string;
		content?: string;
		contentText?: string;
		stylePreset?: string;
	} | null>(null);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const activeIdRef = useRef<number | null>(null);
	activeIdRef.current = activeId;

	const flushSave = useCallback(async () => {
		const id = activeIdRef.current;
		const pending = pendingRef.current;
		if (!id || !pending) return;
		pendingRef.current = null;
		setSaveState("saving");
		try {
			await updateDocumentRpc({ id, ...pending });
			setSaveState("saved");
			setSavedAt(new Date().toISOString());
			setDocuments((prev) =>
				prev.map((d) =>
					d.id === id
						? {
								...d,
								title: pending.title ?? d.title,
								content: pending.content ?? d.content,
								contentText: pending.contentText ?? d.contentText,
								stylePreset: pending.stylePreset ?? d.stylePreset,
								updatedAt: new Date().toISOString(),
							}
						: d,
				),
			);
		} catch (err) {
			console.warn("[EditorApp] autosave error:", err);
			setSaveState("error");
		}
	}, []);

	const scheduleSave = useCallback(() => {
		setSaveState("dirty");
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		saveTimerRef.current = setTimeout(flushSave, AUTOSAVE_DELAY);
	}, [flushSave]);

	/** 切换/卸载文档前冲刷未保存内容 */
	const switchDocument = useCallback(
		async (nextId: number | null) => {
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
			await flushSave();
			setActiveId(nextId);
			setSaveState("idle");
			setContentText("");
		},
		[flushSave],
	);

	useEffect(() => {
		(async () => {
			const docs = await fetchDocuments();
			setDocuments(docs);
			setLoading(false);
			setActiveId((prev) => prev ?? docs[0]?.id ?? null);

			try {
				const settings = await getWorkbenchSettings();
				if (
					settings?.editorStylePresets &&
					Array.isArray(settings.editorStylePresets) &&
					settings.editorStylePresets.length > 0
				) {
					setStylePresets(settings.editorStylePresets);
				}
			} catch (err) {
				console.warn("[EditorApp] Failed to load editor style presets:", err);
			}
		})();
	}, []);

	useEffect(() => {
		return () => {
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
			void flushSave();
		};
	}, [flushSave]);

	const handleImport = useCallback(
		async ({
			title,
			html,
			target,
		}: {
			title: string;
			html: string;
			target: "new" | "insert";
		}) => {
			if (target === "insert" && editorInstanceRef.current) {
				editorInstanceRef.current.commands.insertContent(html);
				return;
			}
			await switchDocument(null);
			const doc = await createDocumentRpc({ title: title || "导入文档" });
			setDocuments((prev) => [doc, ...prev]);
			setActiveId(doc.id);
			setSaveState("idle");
			pendingImportHtmlRef.current = { docId: doc.id, html };
		},
		[switchDocument],
	);

	const handleEditorReady = useCallback(
		(editor: import("@tiptap/react").Editor | null) => {
			editorInstanceRef.current = editor;
			if (
				editor &&
				pendingImportHtmlRef.current &&
				pendingImportHtmlRef.current.docId === activeIdRef.current
			) {
				const { html } = pendingImportHtmlRef.current;
				pendingImportHtmlRef.current = null;
				editor.commands.setContent(html);
			}
		},
		[],
	);

	const handleCreate = useCallback(async () => {
		await switchDocument(null);
		const doc = await createDocumentRpc({});
		setDocuments((prev) => [doc, ...prev]);
		setActiveId(doc.id);
		setSaveState("idle");
	}, [switchDocument]);

	const handleDelete = useCallback(async () => {
		if (!deletingDoc) return;
		await deleteDocumentRpc(deletingDoc.id);
		setDocuments((prev) => {
			const next = prev.filter((d) => d.id !== deletingDoc.id);
			if (activeIdRef.current === deletingDoc.id) {
				setActiveId(next[0]?.id ?? null);
			}
			return next;
		});
	}, [deletingDoc]);

	const handleEditorChange = useCallback(
		(contentJson: string, text: string) => {
			pendingRef.current = {
				...pendingRef.current,
				content: contentJson,
				contentText: text,
			};
			setContentText(text);
			scheduleSave();
		},
		[scheduleSave],
	);

	const handleTitleChange = useCallback(
		(title: string) => {
			pendingRef.current = { ...pendingRef.current, title };
			setDocuments((prev) =>
				prev.map((d) => (d.id === activeIdRef.current ? { ...d, title } : d)),
			);
			scheduleSave();
		},
		[scheduleSave],
	);

	const handleStylePresetChange = useCallback(
		(stylePreset: string) => {
			pendingRef.current = { ...pendingRef.current, stylePreset };
			setDocuments((prev) =>
				prev.map((d) =>
					d.id === activeIdRef.current ? { ...d, stylePreset } : d,
				),
			);
			scheduleSave();
		},
		[scheduleSave],
	);

	const handleStatusChange = useCallback(
		async (status: EditorDocument["status"]) => {
			const id = activeIdRef.current;
			if (!id) return;
			await flushSave();
			await updateDocumentRpc({ id, status });
			setDocuments((prev) =>
				prev.map((d) => (d.id === id ? { ...d, status } : d)),
			);
		},
		[flushSave],
	);

	const handleSnapshot = useCallback(async () => {
		const id = activeIdRef.current;
		if (!id) return;
		await flushSave();
		await snapshotVersionRpc({
			documentId: id,
			origin: "human",
			note: "手动存档",
		});
	}, [flushSave]);

	/** AI bar: snapshot before AI writes back to editor */
	const handleBeforeAiApply = useCallback(async () => {
		const id = activeIdRef.current;
		if (!id) return;
		await flushSave();
		await snapshotVersionRpc({
			documentId: id,
			origin: "ai",
			note: "AI bar 改写前自动备份",
		});
	}, [flushSave]);

	/** AI bar: call server-side text generation */
	const handleAiGenerate = useCallback(
		async (prompt: string): Promise<string> => {
			return generateAiBarTextRpc(prompt, undefined, activeDoc?.stylePreset);
		},
		[activeDoc?.stylePreset],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: contentText triggers update
	const currentMarkdown = useMemo(() => {
		if (!activeDoc) return "";
		const json = pendingRef.current?.content ?? activeDoc.content;
		if (!json) return "";
		try {
			return tiptapJsonToMarkdown(JSON.parse(json));
		} catch {
			return "";
		}
	}, [activeDoc, contentText]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: contentText triggers update
	const currentHtml = useMemo(() => {
		if (!activeDoc) return "";
		const json = pendingRef.current?.content ?? activeDoc.content;
		if (!json) return "";
		try {
			return renderToHTMLString({
				content: JSON.parse(json),
				extensions: EXPORT_EXTENSIONS,
			});
		} catch {
			return "";
		}
	}, [activeDoc, contentText]);

	const buildHtmlDocument = useCallback(() => {
		const title = activeDoc?.title || "未命名文档";
		return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="referrer" content="no-referrer" />
<title>${title}</title>
<style>
body { max-width: 720px; margin: 40px auto; padding: 0 16px; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.75; color: #1a1a1a; }
img, video { max-width: 100%; border-radius: 8px; }
blockquote { border-left: 3px solid #ddd; margin: 0; padding-left: 16px; color: #666; }
code { background: #f3f3f3; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
pre { background: #f6f8fa; padding: 16px; border-radius: 8px; overflow-x: auto; }
</style>
</head>
<body>
${currentHtml}
</body>
</html>`;
	}, [activeDoc, currentHtml]);

	const copyText = useCallback(async (text: string) => {
		await navigator.clipboard.writeText(text);
	}, []);

	const downloadFile = useCallback(
		(filename: string, content: string, mime: string) => {
			const blob = new Blob([content], { type: mime });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
		},
		[],
	);

	const wordCount = contentText.length || (activeDoc?.contentText.length ?? 0);

	return (
		<div className="h-screen bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden">
			<WorkbenchHeader
				unclassifiedCount={unclassifiedCount}
				navLayout={navLayout}
				{...actionProps}
			/>
			<main className="flex-1 overflow-hidden flex min-h-0">
				{/* 左：文档列表（草稿箱） */}
				<aside className="w-60 shrink-0 border-r border-border bg-surface-secondary/30 flex flex-col min-h-0">
					<div className="p-3 border-b border-border flex items-center gap-2">
						<button
							type="button"
							onClick={handleCreate}
							className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
						>
							<FilePlus2 className="w-3.5 h-3.5" />
							新建文档
						</button>
						<button
							type="button"
							onClick={() => setIsImportModalOpen(true)}
							className="flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg bg-surface-secondary border border-border text-foreground hover:bg-muted/15 text-xs font-medium transition-colors cursor-pointer"
							title="导入内容 (网页/Word/PDF/Excel/Obsidian)"
						>
							<Upload className="w-3.5 h-3.5" />
							导入
						</button>
					</div>
					<div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
						{loading && (
							<div className="flex items-center justify-center py-8 text-muted">
								<Loader2 className="w-4 h-4 animate-spin" />
							</div>
						)}
						{!loading && documents.length === 0 && (
							<div className="text-center py-8 px-3">
								<FileText className="w-6 h-6 text-muted/40 mx-auto mb-2" />
								<p className="text-xs text-muted">
									还没有文档，点击上方「新建文档」开始创作
								</p>
							</div>
						)}
						{documents.map((doc) => {
							const active = doc.id === activeId;
							return (
								// biome-ignore lint/a11y/useSemanticElements: nested delete button precludes native button element
								<div
									key={doc.id}
									role="button"
									tabIndex={0}
									className={`group w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer ${
										active
											? "bg-accent/10 border border-accent/30"
											: "hover:bg-muted/10 border border-transparent"
									}`}
									onClick={() => void switchDocument(doc.id)}
									onKeyDown={(e) => {
										if (e.key === "Enter") void switchDocument(doc.id);
									}}
								>
									<div className="flex items-center gap-1.5">
										<span className="text-xs font-medium truncate flex-1">
											{doc.title}
										</span>
										<button
											type="button"
											aria-label="删除文档"
											className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted hover:text-danger transition-all cursor-pointer"
											onClick={(e) => {
												e.stopPropagation();
												setDeletingDoc(doc);
											}}
										>
											<Trash2 className="w-3 h-3" />
										</button>
									</div>
									<div className="flex items-center gap-1.5 mt-1">
										<span
											className={`text-[10px] px-1.5 py-px rounded-full ${
												doc.status === "finalized"
													? "bg-success/15 text-success"
													: "bg-muted/10 text-muted"
											}`}
										>
											{STATUS_LABELS[doc.status]}
										</span>
										{doc.updatedAt && (
											<span className="text-[10px] text-muted/70">
												{dayjs(doc.updatedAt).format("MM-DD HH:mm")}
											</span>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</aside>

				{/* 中：标题 + 编辑器 + 底栏 */}
				<section className="flex-1 flex flex-col min-w-0 min-h-0">
					{!activeDoc && !loading && (
						<div className="flex-1 flex items-center justify-center">
							<div className="text-center">
								<FileText className="w-10 h-10 text-muted/30 mx-auto mb-3" />
								<p className="text-sm text-muted mb-1">创作台</p>
								<p className="text-xs text-muted/70">
									从左侧选择文档，或新建一篇开始
								</p>
							</div>
						</div>
					)}
					{activeDoc && (
						<>
							<div className="shrink-0 px-8 pt-4 pb-2 max-w-3xl mx-auto w-full flex items-center gap-3">
								<input
									value={activeDoc.title}
									onChange={(e) => handleTitleChange(e.target.value)}
									placeholder="未命名文档"
									className="flex-1 bg-transparent text-xl font-semibold outline-none placeholder:text-muted/50"
								/>
								<div className="flex items-center gap-1.5">
									<select
										value={activeDoc.stylePreset || ""}
										onChange={(e) => handleStylePresetChange(e.target.value)}
										className="text-xs bg-surface-secondary border border-border rounded-md px-2 py-1 text-muted cursor-pointer"
									>
										<option value="">无风格</option>
										{stylePresets.map((p) => (
											<option key={p.id} value={p.id}>
												{p.label}
											</option>
										))}
									</select>
									<button
										type="button"
										title="管理与自定义风格模板"
										onClick={() => setIsStylePresetModalOpen(true)}
										className="p-1 text-muted hover:text-foreground hover:bg-muted/10 rounded transition-colors cursor-pointer"
									>
										<Sliders className="w-3.5 h-3.5" />
									</button>
								</div>
							</div>
							<RichTextEditor
								key={activeDoc.id}
								docId={activeDoc.id}
								initialContent={activeDoc.content}
								onChange={handleEditorChange}
								onAiGenerate={handleAiGenerate}
								onBeforeAiApply={handleBeforeAiApply}
								onEditorReady={handleEditorReady}
								onOpenImport={() => setIsImportModalOpen(true)}
							/>
							{/* 底部动作栏 */}
							<div className="shrink-0 border-t border-border bg-surface/60 px-4 py-2 flex items-center gap-2 flex-wrap">
								<span className="text-[11px] text-muted">{wordCount} 字</span>
								<span className="text-[11px] text-muted/60">·</span>
								<span className="text-[11px] text-muted">
									{saveState === "saving" && "保存中…"}
									{saveState === "saved" &&
										`已保存 ${savedAt ? dayjs(savedAt).format("HH:mm:ss") : ""}`}
									{saveState === "dirty" && "待保存"}
									{saveState === "error" && "保存失败"}
									{saveState === "idle" && "—"}
								</span>
								<div className="flex-1" />
								<button
									type="button"
									onClick={() => void handleSnapshot()}
									className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted hover:text-foreground hover:bg-muted/10 rounded-md transition-colors cursor-pointer"
								>
									<Archive className="w-3.5 h-3.5" />
									存快照
								</button>
								<button
									type="button"
									onClick={() =>
										void handleStatusChange(
											activeDoc.status === "finalized"
												? "editing"
												: "finalized",
										)
									}
									className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer ${
										activeDoc.status === "finalized"
											? "text-success hover:bg-success/10"
											: "text-muted hover:text-foreground hover:bg-muted/10"
									}`}
								>
									<CheckCircle2 className="w-3.5 h-3.5" />
									{activeDoc.status === "finalized" ? "取消定稿" : "定稿"}
								</button>
								<div className="w-px h-5 bg-border mx-1" />
								<button
									type="button"
									onClick={() =>
										void copyText(contentText || activeDoc.contentText)
									}
									className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted hover:text-foreground hover:bg-muted/10 rounded-md transition-colors cursor-pointer"
								>
									<Copy className="w-3.5 h-3.5" />
									复制纯文本
								</button>
								<button
									type="button"
									onClick={() => void copyText(currentMarkdown)}
									className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted hover:text-foreground hover:bg-muted/10 rounded-md transition-colors cursor-pointer"
								>
									<Copy className="w-3.5 h-3.5" />
									复制 Markdown
								</button>
								<button
									type="button"
									onClick={() =>
										downloadFile(
											`${activeDoc.title || "未命名文档"}.md`,
											currentMarkdown,
											"text/markdown",
										)
									}
									className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted hover:text-foreground hover:bg-muted/10 rounded-md transition-colors cursor-pointer"
								>
									<Download className="w-3.5 h-3.5" />
									.md
								</button>
								<button
									type="button"
									onClick={() =>
										downloadFile(
											`${activeDoc.title || "未命名文档"}.html`,
											buildHtmlDocument(),
											"text/html",
										)
									}
									className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted hover:text-foreground hover:bg-muted/10 rounded-md transition-colors cursor-pointer"
								>
									<Download className="w-3.5 h-3.5" />
									.html
								</button>
								<button
									type="button"
									onClick={() =>
										void exportToWordDocx(
											activeDoc.title,
											currentHtml || activeDoc.contentText,
										)
									}
									className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted hover:text-foreground hover:bg-muted/10 rounded-md transition-colors cursor-pointer"
									title="导出为标准 Word (.docx) 文档"
								>
									<Download className="w-3.5 h-3.5" />
									.docx
								</button>
								<button
									type="button"
									onClick={() =>
										exportToPdfPrint(
											activeDoc.title,
											currentHtml || activeDoc.contentText,
										)
									}
									className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted hover:text-foreground hover:bg-muted/10 rounded-md transition-colors cursor-pointer"
									title="调起纯净排版浏览器打印，可直接另存为 PDF"
								>
									<Printer className="w-3.5 h-3.5" />
									PDF / 打印
								</button>
							</div>
						</>
					)}
				</section>
			</main>
			{modals}
			<ConfirmDialog
				isOpen={deletingDoc !== null}
				onOpenChange={(open) => {
					if (!open) setDeletingDoc(null);
				}}
				title="删除文档"
				description={`确定删除「${deletingDoc?.title ?? ""}」吗？版本快照会一并删除，此操作不可撤销。`}
				onConfirm={handleDelete}
			/>
			<ImportModal
				isOpen={isImportModalOpen}
				onClose={() => setIsImportModalOpen(false)}
				onImport={handleImport}
			/>
			<StylePresetModal
				isOpen={isStylePresetModalOpen}
				onClose={() => setIsStylePresetModalOpen(false)}
				onPresetsUpdated={(updated) => setStylePresets(updated)}
			/>
		</div>
	);
}
