import { Skeleton, toast } from "@heroui/react";
import dayjs from "dayjs";
import {
	FilePlus2,
	FileText,
	FolderOpen,
	Loader2,
	Trash2,
	Upload,
} from "lucide-react";
import { useState } from "react";
import { openDocumentDirectoryRpc } from "../../../services/api/editorClient";
import { ConfirmDialog } from "../../workbench/ConfirmDialog";
import type { EditorDocument } from "../types";

const STATUS_LABELS: Record<EditorDocument["status"], string> = {
	editing: "编辑中",
	finalized: "已定稿",
	archived: "已归档",
};

export interface DocumentSidebarProps {
	documents: EditorDocument[];
	loading: boolean;
	activeId: number | null;
	onSelect: (id: number) => void;
	onCreate: () => void;
	onDelete: (id: number, deleteLocalAssets?: boolean) => Promise<void>;
	onOpenImport: () => void;
}

export function DocumentSidebar({
	documents,
	loading,
	activeId,
	onSelect,
	onCreate,
	onDelete,
	onOpenImport,
}: DocumentSidebarProps) {
	const [deletingDoc, setDeletingDoc] = useState<EditorDocument | null>(null);
	const [deleteLocalAssets, setDeleteLocalAssets] = useState(false);
	const [openingDocId, setOpeningDocId] = useState<number | null>(null);

	const handleOpenLocalFolder = async (e: React.MouseEvent, docId: number) => {
		e.stopPropagation();
		setOpeningDocId(docId);
		try {
			await openDocumentDirectoryRpc(docId);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			toast.danger(`打开本地文件夹失败: ${message}`);
		} finally {
			setOpeningDocId(null);
		}
	};

	const handleConfirmDelete = async () => {
		if (!deletingDoc) return;
		await onDelete(deletingDoc.id, deleteLocalAssets);
		setDeletingDoc(null);
		setDeleteLocalAssets(false);
	};

	return (
		<>
			<aside className="w-60 shrink-0 border-r border-border bg-surface-secondary/30 flex flex-col min-h-0">
				{/* Top actions: Create / Import */}
				<div className="p-3 border-b border-border flex items-center gap-2">
					<button
						type="button"
						onClick={onCreate}
						className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
					>
						<FilePlus2 className="w-3.5 h-3.5" />
						新建文档
					</button>
					<button
						type="button"
						onClick={onOpenImport}
						className="flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg bg-surface-secondary border border-border text-foreground hover:bg-muted/15 text-xs font-medium transition-colors cursor-pointer"
						title="导入内容 (网页/Word/PDF/Excel/Obsidian)"
					>
						<Upload className="w-3.5 h-3.5" />
						导入
					</button>
				</div>

				{/* Documents list */}
				<div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
					{loading && (
						<div className="space-y-1.5">
							{[0, 1, 2, 3, 4].map((i) => (
								<div
									key={i}
									className={`w-full px-3 py-2.5 rounded-lg border border-border/30 bg-surface-secondary/20 space-y-2 ${
										i === 0 ? "border-accent/30 bg-accent/5" : ""
									}`}
								>
									<div className="flex items-center justify-between gap-2">
										<Skeleton
											className={`h-3.5 rounded ${
												i === 0
													? "w-3/4"
													: i % 2 === 0
														? "w-4/5"
														: "w-3/5"
											}`}
										/>
										<Skeleton className="w-8 h-2.5 rounded shrink-0" />
									</div>
									<div className="flex items-center justify-between gap-2">
										<Skeleton className="w-16 h-2.5 rounded" />
										<Skeleton className="w-10 h-2.5 rounded" />
									</div>
								</div>
							))}
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
								onClick={() => onSelect(doc.id)}
								onKeyDown={(e) => {
									if (e.key === "Enter") onSelect(doc.id);
								}}
							>
								<div className="flex items-center gap-1.5">
									<span className="text-[11px] font-mono font-medium text-muted/60 shrink-0 select-none">
										#{doc.id}
									</span>
									<span className="text-xs font-medium truncate flex-1">
										{doc.title}
									</span>
									<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
										<button
											type="button"
											title="打开本地文件夹"
											aria-label="打开本地文件夹"
											disabled={openingDocId === doc.id}
											className="p-0.5 rounded text-muted hover:text-foreground hover:bg-muted/20 transition-colors cursor-pointer disabled:opacity-50"
											onClick={(e) => handleOpenLocalFolder(e, doc.id)}
										>
											{openingDocId === doc.id ? (
												<Loader2 className="w-3 h-3 animate-spin" />
											) : (
												<FolderOpen className="w-3 h-3" />
											)}
										</button>
										<button
											type="button"
											title="删除文档"
											aria-label="删除文档"
											className="p-0.5 rounded text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
											onClick={(e) => {
												e.stopPropagation();
												setDeleteLocalAssets(false);
												setDeletingDoc(doc);
											}}
										>
											<Trash2 className="w-3 h-3" />
										</button>
									</div>
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

			{/* Delete confirmation dialog */}
			<ConfirmDialog
				isOpen={deletingDoc !== null}
				onOpenChange={(open) => {
					if (!open) {
						setDeletingDoc(null);
						setDeleteLocalAssets(false);
					}
				}}
				title="删除文档"
				description={`确定删除「${deletingDoc?.title ?? ""}」吗？版本快照会一并删除，此操作不可撤销。`}
				onConfirm={handleConfirmDelete}
			>
				<label className="flex items-center gap-2 mt-3 p-2 rounded-lg bg-surface-secondary/50 border border-border/50 text-xs text-foreground cursor-pointer select-none hover:bg-surface-secondary transition-colors">
					<input
						type="checkbox"
						checked={deleteLocalAssets}
						onChange={(e) => setDeleteLocalAssets(e.target.checked)}
						className="accent-accent w-3.5 h-3.5 rounded cursor-pointer shrink-0"
					/>
					<span className="text-muted text-[11px] leading-snug">
						同时彻底删除本地下载的媒体资源（图片、视频等）
					</span>
				</label>
			</ConfirmDialog>
		</>
	);
}
