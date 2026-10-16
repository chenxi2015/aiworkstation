import { Button, Modal, ScrollShadow, toast } from "@heroui/react";
import { useNavigate } from "@tanstack/react-router";
import {
	Check,
	Clock,
	ExternalLink,
	Eye,
	FileText,
	Folder,
	HardDrive,
	LayoutGrid,
	Loader2,
	NotebookPen,
	Palette,
	Search,
	Trash2,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatDraftPayload } from "../../../../../hooks/ai/useChatMessages";
import {
	discardDraftRpc,
	getDraftPreviewRpc,
	saveDraftAsDocumentRpc,
	saveDraftAsNoteRpc,
} from "../../../../../services/api/draftClient";
import {
	fetchObsidianTree,
	invalidateObsidianTreeCache,
} from "../../../../../services/api/obsidianClient";
import {
	collectAllFolders,
	type VaultFolderItem,
} from "../../../../obsidian/tree/vaultTreeUtils";
import type { ObsidianTreeNode } from "../../../../obsidian/types";
import { ConfirmDialog } from "../../../ConfirmDialog";
import { AiMarkdownRenderer } from "../../shared/AiMarkdownRenderer";

export interface DraftDeliveryCardProps {
	draft: ChatDraftPayload;
	onDraftStatusChange?: (updated: ChatDraftPayload) => void;
}

export const DraftDeliveryCard = memo(function DraftDeliveryCard({
	draft,
	onDraftStatusChange,
}: DraftDeliveryCardProps) {
	const navigate = useNavigate();
	const [status, setStatus] = useState<"pending" | "archived" | "expired">(
		draft.status,
	);
	const [archivedTo, setArchivedTo] = useState(draft.archivedTo);

	// Preview state
	const [isPreviewOpen, setIsPreviewOpen] = useState(false);
	const [previewLoading, setPreviewLoading] = useState(false);
	const [previewContent, setPreviewContent] = useState("");

	// Note folder selection state
	const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
	const [vaultTree, setVaultTree] = useState<ObsidianTreeNode[]>([]);
	const [treeLoading, setTreeLoading] = useState(false);
	const [folderSearch, setFolderSearch] = useState("");
	const [selectedDir, setSelectedDir] = useState<string>("");

	// Action loading state
	const [isActionLoading, setIsActionLoading] = useState(false);
	const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);

	const onDraftStatusChangeRef = useRef(onDraftStatusChange);
	onDraftStatusChangeRef.current = onDraftStatusChange;
	const verifiedDraftIdRef = useRef<string | null>(null);

	// Sync or verify status once per draftId if pending
	useEffect(() => {
		if (draft.status !== "pending") return;
		if (verifiedDraftIdRef.current === draft.draftId) return;
		verifiedDraftIdRef.current = draft.draftId;

		let cancelled = false;
		getDraftPreviewRpc(draft.draftId)
			.then((res) => {
				if (cancelled) return;
				if (!res.exists || res.status === "expired") {
					setStatus("expired");
					onDraftStatusChangeRef.current?.({ ...draft, status: "expired" });
				} else if (res.status === "archived") {
					setStatus("archived");
					setArchivedTo(res.archivedTo);
					onDraftStatusChangeRef.current?.({
						...draft,
						status: "archived",
						archivedTo: res.archivedTo,
					});
				}
			})
			.catch(() => {
				// Network or server error, retain current state
			});

		return () => {
			cancelled = true;
		};
	}, [draft.draftId, draft.status]);

	// Open preview modal
	const handleOpenPreview = useCallback(async () => {
		setIsPreviewOpen(true);
		setPreviewLoading(true);
		try {
			const res = await getDraftPreviewRpc(draft.draftId);
			if (!res.exists || res.status === "expired") {
				setStatus("expired");
				onDraftStatusChange?.({ ...draft, status: "expired" });
				toast.warning("该草稿已过期或已丢弃");
			} else {
				setPreviewContent(res.content);
			}
		} catch (err) {
			toast.danger("加载草稿预览失败");
		} finally {
			setPreviewLoading(false);
		}
	}, [draft, onDraftStatusChange]);

	// Save as document
	const handleSaveAsDocument = useCallback(async () => {
		setIsActionLoading(true);
		try {
			const res = await saveDraftAsDocumentRpc({ draftId: draft.draftId });
			setStatus("archived");
			const target = { kind: "document" as const, ref: String(res.documentId) };
			setArchivedTo(target);
			onDraftStatusChange?.({
				...draft,
				status: "archived",
				archivedTo: target,
			});
			// Notify editor and studio modules to immediately refresh document list
			window.dispatchEvent(
				new CustomEvent("editor:documents-changed", {
					detail: { documentId: res.documentId },
				}),
			);
			toast.success(`已保存为创作文档《${draft.title}》`);
		} catch (err: unknown) {
			toast.danger(err instanceof Error ? err.message : "保存创作文档失败");
		} finally {
			setIsActionLoading(false);
		}
	}, [draft, onDraftStatusChange]);

	// Open folder picker for saving as note
	const handleOpenNoteFolderPicker = useCallback(async () => {
		setIsFolderPickerOpen(true);
		setTreeLoading(true);
		try {
			const res = await fetchObsidianTree(false);
			setVaultTree(res.tree || []);
		} catch {
			toast.warning("读取 Obsidian 目录树失败，将默认保存至 Vault 根目录");
		} finally {
			setTreeLoading(false);
		}
	}, []);

	// Confirm save as note
	const handleConfirmSaveAsNote = useCallback(async () => {
		setIsActionLoading(true);
		try {
			const res = await saveDraftAsNoteRpc({
				draftId: draft.draftId,
				dirRelPath: selectedDir,
			});
			setStatus("archived");
			const target = { kind: "note" as const, ref: res.relPath };
			setArchivedTo(target);
			onDraftStatusChange?.({
				...draft,
				status: "archived",
				archivedTo: target,
			});
			setIsFolderPickerOpen(false);
			// Invalidate tree cache, trigger background fresh scan, and notify Obsidian vault tree
			invalidateObsidianTreeCache();
			void fetchObsidianTree(true);
			window.dispatchEvent(
				new CustomEvent("obsidian:vault-changed", {
					detail: { relPath: res.relPath },
				}),
			);
			const successLabel =
				draft.kind === "excalidraw"
					? "画板"
					: draft.kind === "canvas"
						? "白板"
						: "笔记";
			toast.success(`已保存至 Obsidian ${successLabel}：${res.relPath}`);
		} catch (err: unknown) {
			toast.danger(err instanceof Error ? err.message : "保存至 Obsidian 失败");
		} finally {
			setIsActionLoading(false);
		}
	}, [draft, selectedDir, onDraftStatusChange]);

	// Discard draft
	const handleDiscard = useCallback(async () => {
		setIsActionLoading(true);
		try {
			await discardDraftRpc(draft.draftId);
			setStatus("expired");
			onDraftStatusChange?.({ ...draft, status: "expired" });
			toast.info("草稿已移入回收站");
		} catch (err: unknown) {
			toast.danger(err instanceof Error ? err.message : "丢弃草稿失败");
		} finally {
			setIsActionLoading(false);
		}
	}, [draft, onDraftStatusChange]);

	// Folder options for Obsidian modal
	const folderOptions = useMemo<VaultFolderItem[]>(() => {
		const list: VaultFolderItem[] = [
			{ name: "Vault 根目录 (/)", relPath: "", depth: 0 },
		];
		list.push(...collectAllFolders(vaultTree, 1));
		return list;
	}, [vaultTree]);

	const filteredFolders = useMemo(() => {
		const q = folderSearch.trim().toLowerCase();
		if (!q) return folderOptions;
		return folderOptions.filter(
			(item) =>
				item.name.toLowerCase().includes(q) ||
				item.relPath.toLowerCase().includes(q),
		);
	}, [folderOptions, folderSearch]);

	// 1. Expired/Discarded inert state
	if (status === "expired") {
		return (
			<div className="flex justify-start my-1.5">
				<div className=" w-full rounded-2xl border border-border/40 bg-surface/40 p-3 opacity-60">
					<div className="flex items-center gap-2 text-muted">
						<Clock className="w-4 h-4 shrink-0" />
						<span className="text-xs font-medium line-through truncate">
							{draft.title}
						</span>
						<span className="text-[11px]">（草稿已过期或已丢弃）</span>
					</div>
				</div>
			</div>
		);
	}

	const isExcalidraw = draft.kind === "excalidraw";
	const isCanvas = draft.kind === "canvas";
	const isArticle = !isExcalidraw && !isCanvas;
	const isJsonKind = isExcalidraw || isCanvas;
	const kindLabel = isExcalidraw ? "画板" : isCanvas ? "白板" : "笔记";
	const KindIcon = isExcalidraw ? Palette : isCanvas ? LayoutGrid : FileText;

	// 2. Archived inert state
	if (status === "archived") {
		const isDoc = archivedTo?.kind === "document";
		const OpenIcon = isDoc
			? ExternalLink
			: isExcalidraw
				? Palette
				: isCanvas
					? LayoutGrid
					: ExternalLink;
		const openLabel = isDoc ? "打开文档" : `打开${kindLabel}`;
		const archiveDesc = isDoc
			? "已归档至创作台文档"
			: `已归档至 Obsidian ${kindLabel}：${archivedTo?.ref ?? ""}`;

		return (
			<div className="flex justify-start my-1.5">
				<div className="w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10 p-3.5 space-y-2.5">
					<div className="flex items-center justify-between gap-2">
						<div className="flex items-center gap-2 min-w-0">
							<div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
								<Check className="w-4 h-4" />
							</div>
							<div className="min-w-0">
								<p className="text-xs font-semibold text-foreground truncate">
									{draft.title}
								</p>
								<p className="text-[11px] text-muted">{archiveDesc}</p>
							</div>
						</div>
						<div className="shrink-0 flex items-center gap-1.5">
							{isDoc && archivedTo?.ref && (
								<Button
									size="sm"
									variant="secondary"
									className="h-7 px-3 text-xs rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium cursor-pointer"
									onPress={() => {
										const docId = Number(archivedTo.ref);
										window.dispatchEvent(
											new CustomEvent("editor:documents-changed", {
												detail: { documentId: docId },
											}),
										);
										void navigate({
											to: "/creator/studio",
											search: { doc: docId, mode: "doc" },
										});
									}}
								>
									<ExternalLink className="w-3 h-3 mr-1" />
									打开文档
								</Button>
							)}
							{!isDoc && archivedTo?.ref && (
								<Button
									size="sm"
									variant="secondary"
									className="h-7 px-3 text-xs rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium cursor-pointer"
									onPress={() => {
										invalidateObsidianTreeCache();
										window.dispatchEvent(
											new CustomEvent("obsidian:vault-changed", {
												detail: { relPath: archivedTo.ref },
											}),
										);
										void navigate({
											to: "/obsidian",
											search: { note: archivedTo.ref },
										});
									}}
								>
									<OpenIcon className="w-3 h-3 mr-1" />
									{openLabel}
								</Button>
							)}
						</div>
					</div>
				</div>
			</div>
		);
	}

	const pendingTitle = isArticle ? `《${draft.title}》` : draft.title;
	const pendingDesc = isExcalidraw
		? `画板已生成 · 包含 ${draft.wordCount} 个图形与连线 · 暂存本地草稿区`
		: isCanvas
			? `白板已生成 · 包含 ${draft.wordCount} 个节点与连线 · 暂存本地草稿区`
			: `全文已生成 · 约 ${draft.wordCount} 字 · 暂存本地草稿区`;

	// 3. Pending interactive card
	return (
		<div className="flex justify-start my-1.5">
			<div className="w-full rounded-2xl border border-accent/40 bg-accent-soft/20 dark:bg-accent/10 p-3.5 space-y-3 shadow-xs">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2 min-w-0">
						<div className="w-7 h-7 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
							<KindIcon className="w-4 h-4" />
						</div>
						<div className="min-w-0">
							<p className="text-xs font-semibold text-foreground truncate">
								{pendingTitle}
							</p>
							<p className="text-[11px] text-muted">{pendingDesc}</p>
						</div>
					</div>
					<span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent shrink-0">
						待选落点
					</span>
				</div>

				<div className="flex items-center flex-wrap gap-2 pt-0.5">
					<Button
						size="sm"
						variant="secondary"
						className="h-7.5 px-3 text-xs font-medium rounded-xl bg-surface/80 border border-border/60 hover:bg-surface cursor-pointer text-foreground"
						onPress={handleOpenPreview}
						isDisabled={isActionLoading}
					>
						<Eye className="w-3.5 h-3.5 mr-1 text-muted" />
						预览
					</Button>

					{isArticle && (
						<Button
							size="sm"
							className="h-7.5 px-3 text-xs font-semibold rounded-xl bg-accent text-white hover:opacity-90 cursor-pointer shadow-xs"
							onPress={handleSaveAsDocument}
							isDisabled={isActionLoading}
						>
							{isActionLoading ? (
								<Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
							) : (
								<FileText className="w-3.5 h-3.5 mr-1" />
							)}
							存为创作文档
						</Button>
					)}

					<Button
						size="sm"
						variant={isArticle ? "secondary" : "primary"}
						className={`h-7.5 px-3 text-xs font-semibold rounded-xl cursor-pointer ${
							isArticle
								? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/25"
								: "bg-accent text-white hover:opacity-90 shadow-xs"
						}`}
						onPress={handleOpenNoteFolderPicker}
						isDisabled={isActionLoading}
					>
						{isActionLoading ? (
							<Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
						) : isExcalidraw ? (
							<Palette className="w-3.5 h-3.5 mr-1" />
						) : isCanvas ? (
							<LayoutGrid className="w-3.5 h-3.5 mr-1" />
						) : (
							<NotebookPen className="w-3.5 h-3.5 mr-1" />
						)}
						{isExcalidraw ? "存为画板" : isCanvas ? "存为白板" : "存为笔记"}
					</Button>

					<Button
						size="sm"
						variant="ghost"
						className="h-7.5 px-2.5 text-xs rounded-xl text-muted hover:text-danger cursor-pointer ml-auto"
						onPress={() => setIsDiscardConfirmOpen(true)}
						isDisabled={isActionLoading}
					>
						<Trash2 className="w-3.5 h-3.5 mr-1" />
						丢弃
					</Button>
				</div>
			</div>

			{/* Preview Modal */}
			<Modal.Backdrop
				isOpen={isPreviewOpen}
				onOpenChange={(open) => !open && setIsPreviewOpen(false)}
				variant="blur"
				className="z-60"
			>
				<Modal.Container size="lg" className="w-full">
					<Modal.Dialog
						aria-label={`预览草稿：${draft.title}`}
						className="w-full max-w-2xl max-h-[85vh] flex flex-col"
					>
						<Modal.CloseTrigger />
						<Modal.Header className="shrink-0 pb-2">
							<div className="flex items-center gap-2">
								<div className="p-1.5 rounded-lg bg-accent/10 text-accent">
									<KindIcon className="w-4 h-4" />
								</div>
								<div className="min-w-0 flex-1">
									<Modal.Heading className="text-sm font-semibold truncate">
										{pendingTitle}
									</Modal.Heading>
									<p className="text-[11px] text-muted">
										{isJsonKind
											? `结构概览 · 包含 ${draft.wordCount} 个元素`
											: `全文预览 · 约 ${draft.wordCount} 字`}
									</p>
								</div>
							</div>
						</Modal.Header>

						<Modal.Body className="flex-1 min-h-0 p-4 pt-1">
							{previewLoading ? (
								<div className="flex items-center justify-center h-48">
									<Loader2 className="w-6 h-6 animate-spin text-accent" />
								</div>
							) : isJsonKind ? (
								<ScrollShadow className="max-h-[60vh] rounded-xl border border-border/60 bg-surface-secondary/20 p-4 sm:p-5">
									<pre className="text-xs text-muted font-mono whitespace-pre-wrap break-all select-text">
										{(() => {
											try {
												return JSON.stringify(
													JSON.parse(previewContent),
													null,
													2,
												);
											} catch {
												return previewContent;
											}
										})()}
									</pre>
								</ScrollShadow>
							) : (
								<ScrollShadow className="max-h-[60vh] rounded-xl border border-border/60 bg-surface-secondary/20 p-4 sm:p-5">
									<AiMarkdownRenderer
										content={previewContent}
										compact={false}
									/>
								</ScrollShadow>
							)}
						</Modal.Body>

						<Modal.Footer className="shrink-0 flex items-center justify-between gap-2 pt-2 border-t border-border/40">
							<span className="text-[11px] text-muted">
								暂存本地草稿，尚未写入任何数据库或笔记库
							</span>
							<div className="flex items-center gap-2">
								<Button
									size="sm"
									variant="secondary"
									className="h-8 px-3 text-xs rounded-xl cursor-pointer"
									onPress={() => setIsPreviewOpen(false)}
								>
									关闭
								</Button>
							</div>
						</Modal.Footer>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>

			{/* Save to Obsidian Folder Picker Modal */}
			<Modal.Backdrop
				isOpen={isFolderPickerOpen}
				onOpenChange={(open) => !open && setIsFolderPickerOpen(false)}
				variant="blur"
				className="z-60"
			>
				<Modal.Container size="md" className="w-full">
					<Modal.Dialog
						aria-label="选择保存的 Obsidian 目标文件夹"
						className="w-full max-w-md max-h-[80vh] flex flex-col"
					>
						<Modal.CloseTrigger />
						<Modal.Header className="shrink-0 pb-1">
							<div className="flex items-center gap-2">
								<div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
									<NotebookPen className="w-4 h-4" />
								</div>
								<div>
									<Modal.Heading className="text-sm font-semibold">
										存为 Obsidian {kindLabel}
									</Modal.Heading>
									<p className="text-[11px] text-muted">
										将「{draft.title}」存入 Vault 对应目录
									</p>
								</div>
							</div>
						</Modal.Header>

						<Modal.Body className="flex flex-col flex-1 min-h-0 gap-2 pt-1 pb-2">
							<div className="relative shrink-0">
								<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
								<input
									type="text"
									value={folderSearch}
									onChange={(e) => setFolderSearch(e.target.value)}
									placeholder="搜索目标文件夹…"
									className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-surface-secondary/40 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
								/>
							</div>

							<div className="flex-1 min-h-48 overflow-hidden rounded-lg border border-border/60 bg-surface-secondary/20">
								{treeLoading ? (
									<div className="flex items-center justify-center h-48">
										<Loader2 className="w-5 h-5 animate-spin text-muted" />
									</div>
								) : (
									<ScrollShadow className="h-48 p-1 divide-y divide-border/20">
										{filteredFolders.map((item) => {
											const isSelected = selectedDir === item.relPath;
											return (
												<button
													key={item.relPath || "__root__"}
													type="button"
													onClick={() => setSelectedDir(item.relPath)}
													className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
														isSelected
															? "bg-accent/15 text-accent font-medium"
															: "text-foreground hover:bg-surface-secondary/60"
													}`}
													style={{ paddingLeft: `${8 + item.depth * 14}px` }}
												>
													<div className="flex items-center gap-1.5 truncate">
														{item.relPath === "" ? (
															<HardDrive className="w-3.5 h-3.5 shrink-0 text-muted" />
														) : (
															<Folder className="w-3.5 h-3.5 shrink-0 text-muted" />
														)}
														<span className="truncate">{item.name}</span>
													</div>
													{isSelected && (
														<Check className="w-3.5 h-3.5 shrink-0 text-accent" />
													)}
												</button>
											);
										})}
									</ScrollShadow>
								)}
							</div>
						</Modal.Body>

						<Modal.Footer className="shrink-0 flex items-center justify-end gap-2 pt-2 border-t border-border/40">
							<Button
								size="sm"
								variant="secondary"
								className="h-8 px-3 text-xs rounded-xl cursor-pointer"
								onPress={() => setIsFolderPickerOpen(false)}
							>
								取消
							</Button>
							<Button
								size="sm"
								className="h-8 px-4 text-xs font-semibold rounded-xl bg-accent text-white hover:opacity-90 cursor-pointer"
								onPress={handleConfirmSaveAsNote}
								isDisabled={isActionLoading}
							>
								{isActionLoading ? (
									<Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
								) : (
									<Check className="w-3.5 h-3.5 mr-1" />
								)}
								确认存入
							</Button>
						</Modal.Footer>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>

			{/* Discard Confirmation Dialog */}
			<ConfirmDialog
				isOpen={isDiscardConfirmOpen}
				onOpenChange={setIsDiscardConfirmOpen}
				title="确认丢弃草稿"
				description={
					<span>
						确定要丢弃草稿{" "}
						<strong className="font-semibold text-foreground">
							《{draft.title}》
						</strong>
						吗？丢弃后草稿将被移入回收站。
					</span>
				}
				confirmLabel="确认丢弃"
				onConfirm={handleDiscard}
			/>
		</div>
	);
});
