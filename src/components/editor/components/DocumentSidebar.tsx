import { Skeleton } from "@heroui/react";
import { FileText, Loader2, Pin } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { ActiveFolderId } from "../hooks/useDocumentManager";
import type { EditorDocFolder, EditorDocument } from "../types";
import {
	DeleteDocumentDialog,
	DocumentSidebarHeader,
	PinnedDocRow,
	SortableDocRow,
	useDocumentSidebarList,
} from "./document-sidebar";

export interface DocumentSidebarProps {
	/** All documents (filtered inside by folder and search keyword) */
	documents: EditorDocument[];
	loading: boolean;
	activeId: number | null;
	activeFolderId: ActiveFolderId;
	folders: EditorDocFolder[];
	onSelect: (id: number) => void;
	onCreate: () => void;
	onDuplicate: (id: number) => Promise<void>;
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
	onDuplicate,
	onDelete,
	onOpenImport,
	onTogglePin,
	onMoveDocument,
	onArchive,
}: DocumentSidebarProps) {
	const [deletingDoc, setDeletingDoc] = useState<EditorDocument | null>(null);
	const [deleteLocalAssets, setDeleteLocalAssets] = useState(false);
	const [search, setSearch] = useState("");

	// Delegate filtering, grouping, and pagination to custom hook
	const {
		searching,
		visibleDocs,
		pinnedDocs,
		unpinnedDocs,
		displayedUnpinnedDocs,
		hasMore,
		pageSize,
		scrollContainerRef,
		sentinelRef,
		handleScroll,
	} = useDocumentSidebarList({
		documents,
		activeId,
		activeFolderId,
		search,
	});

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
				{/* Header: Actions & Search */}
				<DocumentSidebarHeader
					search={search}
					onSearchChange={setSearch}
					onCreate={onCreate}
					onOpenImport={onOpenImport}
				/>

				{/* Documents list */}
				<div
					ref={scrollContainerRef}
					onScroll={handleScroll}
					className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0"
				>
					{loading && <DocumentSidebarSkeletonList />}

					{!loading && visibleDocs.length === 0 && (
						<DocumentSidebarEmptyState
							searching={searching}
							activeFolderId={activeFolderId}
						/>
					)}

					{/* Pinned section */}
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
									onDuplicate={onDuplicate}
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

					{/* Unpinned documents with sortable DnD */}
					{displayedUnpinnedDocs.map((doc, index) => (
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
							onDuplicate={onDuplicate}
							onTogglePin={onTogglePin}
							onMoveDocument={onMoveDocument}
							onArchive={onArchive}
							onRequestDelete={handleRequestDelete}
						/>
					))}

					{/* Pagination loader and status */}
					{hasMore && (
						<div
							ref={sentinelRef}
							className="py-3 flex items-center justify-center gap-1.5 text-xs text-muted/70 select-none"
						>
							<Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
							<span>加载更多文档…</span>
						</div>
					)}

					{!hasMore && unpinnedDocs.length > pageSize && (
						<div className="py-3 text-center text-[10px] text-muted/50 select-none border-t border-border/20 mt-2">
							已加载全部 {visibleDocs.length} 篇文档
						</div>
					)}
				</div>
			</aside>

			{/* Delete confirmation dialog */}
			<DeleteDocumentDialog
				doc={deletingDoc}
				isOpen={deletingDoc !== null}
				deleteLocalAssets={deleteLocalAssets}
				onChangeDeleteLocalAssets={setDeleteLocalAssets}
				onClose={() => {
					setDeletingDoc(null);
					setDeleteLocalAssets(false);
				}}
				onConfirm={handleConfirmDelete}
			/>
		</>
	);
}

/** Skeleton loader for document list */
function DocumentSidebarSkeletonList() {
	return (
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
	);
}

/** Empty state message */
function DocumentSidebarEmptyState({
	searching,
	activeFolderId,
}: {
	searching: boolean;
	activeFolderId: ActiveFolderId;
}) {
	const message = useMemo(() => {
		if (searching) return "没有找到匹配的文档";
		if (activeFolderId === "all")
			return "还没有文档，点击上方「新建文档」开始创作";
		if (activeFolderId === "unfiled")
			return "没有未分类文档，所有文档已归入文件夹";
		return "该文件夹还没有文档，可将文档拖拽到这里";
	}, [searching, activeFolderId]);

	return (
		<div className="text-center py-8 px-3">
			<FileText className="w-6 h-6 text-muted/40 mx-auto mb-2" />
			<p className="text-xs text-muted">{message}</p>
		</div>
	);
}
