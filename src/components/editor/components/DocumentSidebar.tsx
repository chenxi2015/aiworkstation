import { Feedback } from "@dnd-kit/dom";
import { useDraggable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { Dropdown, Skeleton, toast } from "@heroui/react";
import dayjs from "dayjs";
import {
	Archive,
	Check,
	Ellipsis,
	FileAudio,
	FilePlus2,
	FileText,
	FileVideo,
	Folder as FolderIcon,
	FolderInput,
	FolderOpen,
	Inbox,
	Loader2,
	Pin,
	PinOff,
	Search,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { openDocumentDirectoryRpc } from "../../../services/api/editorClient";
import { ConfirmDialog } from "../../workbench/ConfirmDialog";
import type { ActiveFolderId } from "../hooks/useDocumentManager";
import type { EditorDocFolder, EditorDocument } from "../types";
import { detectDocumentMediaInfo } from "../utils/documentMediaKind";
import {
	EDITOR_DOC_TYPE,
	type EditorDocDragData,
	editorDocRowId,
} from "../utils/editorDnd";

const STATUS_LABELS: Record<EditorDocument["status"], string> = {
	editing: "编辑中",
	finalized: "已定稿",
	archived: "已归档",
};

export interface DocumentSidebarProps {
	/** 全量文档（组件内部按文件夹/搜索词过滤） */
	documents: EditorDocument[];
	loading: boolean;
	activeId: number | null;
	activeFolderId: ActiveFolderId;
	folders: EditorDocFolder[];
	onSelect: (id: number) => void;
	onCreate: () => void;
	onDelete: (id: number, deleteLocalAssets?: boolean) => Promise<void>;
	onOpenImport: () => void;
	onTogglePin: (docId: number, pinned: boolean) => Promise<void>;
	onMoveDocument: (docId: number, folderId: number | null) => Promise<void>;
	onArchive: (docId: number) => Promise<void>;
}

export function DocumentSidebar({
	documents,
	loading,
	activeId,
	activeFolderId,
	folders,
	onSelect,
	onCreate,
	onDelete,
	onOpenImport,
	onTogglePin,
	onMoveDocument,
	onArchive,
}: DocumentSidebarProps) {
	const [deletingDoc, setDeletingDoc] = useState<EditorDocument | null>(null);
	const [deleteLocalAssets, setDeleteLocalAssets] = useState(false);
	const [search, setSearch] = useState("");

	const keyword = search.trim().toLowerCase();
	const searching = keyword.length > 0;

	// 搜索时全局检索（标题+正文），否则按当前文件夹过滤
	const visibleDocs = useMemo(() => {
		if (searching) {
			return documents.filter(
				(doc) =>
					doc.title.toLowerCase().includes(keyword) ||
					doc.contentText.toLowerCase().includes(keyword),
			);
		}
		if (activeFolderId === "all") return documents;
		return documents.filter((doc) => doc.folderId === activeFolderId);
	}, [documents, searching, keyword, activeFolderId]);

	const pinnedDocs = useMemo(
		() => visibleDocs.filter((doc) => doc.pinned),
		[visibleDocs],
	);
	const unpinnedDocs = useMemo(
		() => visibleDocs.filter((doc) => !doc.pinned),
		[visibleDocs],
	);

	const folderNameMap = useMemo(
		() => new Map(folders.map((f) => [f.id, f.name])),
		[folders],
	);

	const handleConfirmDelete = async () => {
		if (!deletingDoc) return;
		await onDelete(deletingDoc.id, deleteLocalAssets);
		setDeletingDoc(null);
		setDeleteLocalAssets(false);
	};

	const handleRequestDelete = useCallback((d: EditorDocument) => {
		setDeleteLocalAssets(false);
		setDeletingDoc(d);
	}, []);

	return (
		<>
			<aside className="w-64 shrink-0 border-r border-border bg-surface flex flex-col min-h-0">
				{/* Top actions: Create / Import */}
				<div className="p-3 border-b border-border flex items-center gap-2">
					<button
						type="button"
						onClick={onCreate}
						className="flex-1 flex items-center justify-center gap-1.5 px-3 h-8 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
					>
						<FilePlus2 className="w-3.5 h-3.5" />
						新建文档
					</button>
					<button
						type="button"
						onClick={onOpenImport}
						className="flex items-center justify-center gap-1 px-2.5 h-8 rounded-lg bg-surface-secondary border border-border text-foreground hover:bg-muted/15 text-xs font-medium transition-colors cursor-pointer"
						title="导入内容 (网页/Word/PDF/Excel/Obsidian)"
					>
						<Upload className="w-3.5 h-3.5" />
						导入
					</button>
				</div>

				{/* Search */}
				<div className="px-3 pt-2.5 pb-1.5">
					<div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border/60 focus-within:border-accent/50 transition-colors">
						<Search className="w-3.5 h-3.5 text-muted/70 shrink-0" />
						<input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="搜索文档…"
							className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted/60"
						/>
						{searching && (
							<button
								type="button"
								aria-label="清空搜索"
								onClick={() => setSearch("")}
								className="p-0.5 rounded text-muted hover:text-foreground transition-colors cursor-pointer shrink-0"
							>
								<X className="w-3 h-3" />
							</button>
						)}
					</div>
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
												i === 0 ? "w-3/4" : i % 2 === 0 ? "w-4/5" : "w-3/5"
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
					{!loading && visibleDocs.length === 0 && (
						<div className="text-center py-8 px-3">
							<FileText className="w-6 h-6 text-muted/40 mx-auto mb-2" />
							<p className="text-xs text-muted">
								{searching
									? "没有找到匹配的文档"
									: activeFolderId === "all"
										? "还没有文档，点击上方「新建文档」开始创作"
										: "该文件夹还没有文档，可将文档拖拽到这里"}
							</p>
						</div>
					)}

					{/* 置顶组 */}
					{pinnedDocs.length > 0 && (
						<>
							<div className="flex items-center gap-1 px-2 pt-1 pb-0.5 text-[10px] text-muted/70 select-none">
								<Pin className="w-2.5 h-2.5" />
								已置顶
							</div>
							{pinnedDocs.map((doc) => (
								<PinnedDocRow
									key={doc.id}
									doc={doc}
									active={doc.id === activeId}
									folders={folders}
									folderName={
										doc.folderId != null
											? (folderNameMap.get(doc.folderId) ?? null)
											: null
									}
									onSelect={onSelect}
									onTogglePin={onTogglePin}
									onMoveDocument={onMoveDocument}
									onArchive={onArchive}
									onRequestDelete={handleRequestDelete}
								/>
							))}
							{unpinnedDocs.length > 0 && (
								<div className="h-px bg-border/50 mx-2 my-1" />
							)}
						</>
					)}

					{/* 普通组：sortable 拖拽排序 */}
					{unpinnedDocs.map((doc, index) => (
						<SortableDocRow
							key={doc.id}
							doc={doc}
							index={index}
							disabled={searching}
							active={doc.id === activeId}
							folders={folders}
							folderName={
								doc.folderId != null
									? (folderNameMap.get(doc.folderId) ?? null)
									: null
							}
							onSelect={onSelect}
							onTogglePin={onTogglePin}
							onMoveDocument={onMoveDocument}
							onArchive={onArchive}
							onRequestDelete={handleRequestDelete}
						/>
					))}
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

interface DocRowCommonProps {
	doc: EditorDocument;
	active: boolean;
	folderName: string | null;
	folders: EditorDocFolder[];
	onSelect: (id: number) => void;
	onTogglePin: (docId: number, pinned: boolean) => Promise<void>;
	onMoveDocument: (docId: number, folderId: number | null) => Promise<void>;
	onArchive: (docId: number) => Promise<void>;
	onRequestDelete: (doc: EditorDocument) => void;
}

/** 置顶文档行：可拖拽到文件夹，但不参与列表排序 */
const PinnedDocRow = memo(function PinnedDocRow(props: DocRowCommonProps) {
	const { doc } = props;
	const { ref, isDragSource } = useDraggable({
		id: editorDocRowId(doc.id),
		type: EDITOR_DOC_TYPE,
		// 跟随物由 EditorDragChip 承担，源卡片不跟随指针
		plugins: [Feedback.configure({ feedback: "none" })],
		data: {
			kind: "editor-doc",
			docId: doc.id,
			folderId: doc.folderId ?? null,
		} satisfies EditorDocDragData,
	});
	return (
		<div ref={ref} className={isDragSource ? "opacity-40" : undefined}>
			<DocRowInner {...props} />
		</div>
	);
});

/** 普通文档行：sortable（组内拖拽排序 + 拖到文件夹） */
const SortableDocRow = memo(function SortableDocRow(
	props: DocRowCommonProps & { index: number; disabled?: boolean },
) {
	const { doc, index, disabled } = props;
	const { ref, isDragSource } = useSortable({
		id: editorDocRowId(doc.id),
		index,
		disabled,
		// 类型+分组双重隔离：只与文档互相排序；拖到文件夹行不会触发跨栏 DOM 移动
		type: EDITOR_DOC_TYPE,
		accept: EDITOR_DOC_TYPE,
		group: "editor-doc",
		// 跟随物由 EditorDragChip 承担，源卡片不跟随指针
		plugins: [Feedback.configure({ feedback: "none" })],
		data: {
			kind: "editor-doc",
			docId: doc.id,
			folderId: doc.folderId ?? null,
		} satisfies EditorDocDragData,
	});
	return (
		<div ref={ref} className={isDragSource ? "opacity-40" : undefined}>
			<DocRowInner {...props} />
		</div>
	);
});

const DocRowInner = memo(function DocRowInner({
	doc,
	active,
	folderName,
	folders,
	onSelect,
	onTogglePin,
	onMoveDocument,
	onArchive,
	onRequestDelete,
}: DocRowCommonProps) {
	const [opening, setOpening] = useState(false);

	const handleOpenLocalFolder = async () => {
		setOpening(true);
		try {
			await openDocumentDirectoryRpc(doc.id);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			toast.danger(`打开本地文件夹失败: ${message}`);
		} finally {
			setOpening(false);
		}
	};

	const mediaKind = useMemo(() => detectDocumentMediaInfo(doc).kind, [doc]);

	return (
		// biome-ignore lint/a11y/useSemanticElements: nested action buttons preclude native button element
		<div
			role="button"
			tabIndex={0}
			className={`group w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer ${
				active
					? "bg-accent/10 border border-accent/30"
					: "hover:bg-muted/10 border border-transparent"
			}`}
			onClick={(e) => {
				e.stopPropagation();
				onSelect(doc.id);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") onSelect(doc.id);
			}}
		>
			<div className="flex items-center gap-1.5">
				{doc.pinned && (
					<Pin className="w-3 h-3 text-accent shrink-0 rotate-45" />
				)}
				<span className="text-[11px] font-mono font-medium text-muted/60 shrink-0 select-none">
					#{doc.id}
				</span>
				{mediaKind === "audio" && (
					<FileAudio className="w-3.5 h-3.5 text-accent shrink-0" />
				)}
				{mediaKind === "video" && (
					<FileVideo className="w-3.5 h-3.5 text-purple-500 shrink-0" />
				)}
				<span className="text-xs font-medium truncate flex-1 select-none">
					{doc.title}
				</span>
				<DocRowMenu
					doc={doc}
					folders={folders}
					opening={opening}
					onTogglePin={onTogglePin}
					onMoveDocument={onMoveDocument}
					onArchive={onArchive}
					onOpenLocalFolder={handleOpenLocalFolder}
					onRequestDelete={onRequestDelete}
				/>
			</div>
			<div className="flex items-center gap-1.5 mt-1">
				{folderName && (
					<span className="text-[10px] leading-none px-1.5 py-[3px] rounded-full bg-accent/10 text-accent truncate max-w-[80px]">
						{folderName}
					</span>
				)}
				{doc.updatedAt && (
					<span className="text-[10px] leading-none text-muted/70 tabular-nums shrink-0">
						{dayjs(doc.updatedAt).format("MM-DD HH:mm")}
					</span>
				)}
				<span
					className={`ml-auto text-[10px] leading-none px-1.5 py-[3px] rounded-full shrink-0 ${
						doc.status === "finalized"
							? "bg-success/15 text-success"
							: "bg-muted/10 text-muted"
					}`}
				>
					{STATUS_LABELS[doc.status]}
				</span>
			</div>
		</div>
	);
});

/** 文档 ⋯ 菜单：置顶 / 移动到文件夹 / 打开本地文件夹 / 归档 / 删除 */
function DocRowMenu({
	doc,
	folders,
	opening,
	onTogglePin,
	onMoveDocument,
	onArchive,
	onOpenLocalFolder,
	onRequestDelete,
}: {
	doc: EditorDocument;
	folders: EditorDocFolder[];
	opening: boolean;
	onTogglePin: (docId: number, pinned: boolean) => Promise<void>;
	onMoveDocument: (docId: number, folderId: number | null) => Promise<void>;
	onArchive: (docId: number) => Promise<void>;
	onOpenLocalFolder: () => void;
	onRequestDelete: (doc: EditorDocument) => void;
}) {
	const currentFolderId = doc.folderId ?? null;
	return (
		<Dropdown>
			<Dropdown.Trigger
				aria-label="文档更多操作"
				className="p-0.5 rounded text-muted hover:text-foreground hover:bg-muted/20 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 data-[pressed]:opacity-100 shrink-0"
				onClick={(e: React.MouseEvent) => e.stopPropagation()}
				onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
			>
				<Ellipsis className="w-3.5 h-3.5" />
			</Dropdown.Trigger>
			<Dropdown.Popover
				placement="bottom end"
				className="min-w-[160px] p-1 shadow-lg border border-border/80 rounded-xl bg-surface"
			>
				<Dropdown.Menu aria-label="文档操作">
					<Dropdown.Item
						id="toggle-pin"
						textValue={doc.pinned ? "取消置顶" : "置顶"}
						onAction={() => void onTogglePin(doc.id, !doc.pinned)}
					>
						<div className="flex items-center gap-2 py-0.5">
							{doc.pinned ? (
								<PinOff className="w-3.5 h-3.5 text-muted shrink-0" />
							) : (
								<Pin className="w-3.5 h-3.5 text-muted shrink-0" />
							)}
							<span className="text-xs">
								{doc.pinned ? "取消置顶" : "置顶"}
							</span>
						</div>
					</Dropdown.Item>
					<Dropdown.Item
						id="open-local"
						textValue="打开本地文件夹"
						onAction={onOpenLocalFolder}
					>
						<div className="flex items-center gap-2 py-0.5">
							{opening ? (
								<Loader2 className="w-3.5 h-3.5 text-muted shrink-0 animate-spin" />
							) : (
								<FolderOpen className="w-3.5 h-3.5 text-muted shrink-0" />
							)}
							<span className="text-xs">打开本地文件夹</span>
						</div>
					</Dropdown.Item>
					<Dropdown.SubmenuTrigger>
						<Dropdown.Item id="move" textValue="移动到文件夹">
							<div className="flex items-center gap-2 py-0.5">
								<FolderInput className="w-3.5 h-3.5 text-muted shrink-0" />
								<span className="text-xs">移动到…</span>
							</div>
						</Dropdown.Item>
						<Dropdown.Popover
							placement="right"
							className="min-w-[140px] p-1 shadow-lg border border-border/80 rounded-xl bg-surface"
						>
							<Dropdown.Menu aria-label="移动到文件夹">
								<Dropdown.Item
									id="move-all"
									textValue="全部（未归档）"
									onAction={() => {
										if (currentFolderId !== null) {
											void onMoveDocument(doc.id, null);
										}
									}}
								>
									<div className="flex items-center gap-2 py-0.5">
										<Inbox className="w-3.5 h-3.5 text-muted shrink-0" />
										<span className="text-xs flex-1">全部（未归档）</span>
										{currentFolderId === null && (
											<Check className="w-3 h-3 text-accent shrink-0" />
										)}
									</div>
								</Dropdown.Item>
								{folders.map((folder) => (
									<Dropdown.Item
										key={folder.id}
										id={`move-${folder.id}`}
										textValue={folder.name}
										onAction={() => {
											if (currentFolderId !== folder.id) {
												void onMoveDocument(doc.id, folder.id);
											}
										}}
									>
										<div className="flex items-center gap-2 py-0.5">
											<FolderIcon className="w-3.5 h-3.5 text-muted shrink-0" />
											<span className="text-xs flex-1 truncate">
												{folder.name}
											</span>
											{currentFolderId === folder.id && (
												<Check className="w-3 h-3 text-accent shrink-0" />
											)}
										</div>
									</Dropdown.Item>
								))}
							</Dropdown.Menu>
						</Dropdown.Popover>
					</Dropdown.SubmenuTrigger>
					<Dropdown.Item
						id="archive"
						textValue="归档"
						onAction={() => {
							void onArchive(doc.id).then(
								() => toast.success(`「${doc.title}」已归档`),
								(err) =>
									toast.danger(
										`归档失败：${err instanceof Error ? err.message : String(err)}`,
									),
							);
						}}
					>
						<div className="flex items-center gap-2 py-0.5">
							<Archive className="w-3.5 h-3.5 text-muted shrink-0" />
							<span className="text-xs">归档（移出创作台）</span>
						</div>
					</Dropdown.Item>
					<Dropdown.Item
						id="delete"
						textValue="删除文档"
						onAction={() => onRequestDelete(doc)}
					>
						<div className="flex items-center gap-2 py-0.5">
							<Trash2 className="w-3.5 h-3.5 text-danger shrink-0" />
							<span className="text-xs text-danger">删除文档</span>
						</div>
					</Dropdown.Item>
				</Dropdown.Menu>
			</Dropdown.Popover>
		</Dropdown>
	);
}
