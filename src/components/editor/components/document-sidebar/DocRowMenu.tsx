import { Dropdown, toast } from "@heroui/react";
import {
	Archive,
	Check,
	Copy,
	Ellipsis,
	Folder as FolderIcon,
	FolderInput,
	FolderOpen,
	Inbox,
	Loader2,
	Pin,
	PinOff,
	Sparkles,
	Trash2,
} from "lucide-react";
import { memo, useState } from "react";
import { openDocumentDirectoryRpc } from "../../../../services/api/editorClient";
import { useAddToAiChat } from "../../../workbench/ai/chat/utils/chatContextHelpers";
import type { EditorDocFolder, EditorDocument } from "../../types";

export interface DocRowMenuProps {
	doc: EditorDocument;
	folders: EditorDocFolder[];
	folderName?: string | null;
	onDuplicate: (docId: number) => Promise<void>;
	onTogglePin: (docId: number, pinned: boolean) => Promise<void>;
	onMoveDocument: (docId: number, folderId: number | null) => Promise<void>;
	onArchive: (docId: number) => Promise<void>;
	onRequestDelete: (doc: EditorDocument) => void;
}

/** Document actions dropdown menu */
export const DocRowMenu = memo(function DocRowMenu({
	doc,
	folders,
	folderName,
	onDuplicate,
	onTogglePin,
	onMoveDocument,
	onArchive,
	onRequestDelete,
}: DocRowMenuProps) {
	const [opening, setOpening] = useState(false);
	const currentFolderId = doc.folderId ?? null;
	const { addDocumentToAi } = useAddToAiChat();

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
						id="add-to-ai"
						textValue="添加到AI对话"
						onAction={() => addDocumentToAi(doc, folderName)}
					>
						<div className="flex items-center gap-2 py-0.5">
							<Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
							<span className="text-xs font-medium">添加到AI对话</span>
						</div>
					</Dropdown.Item>
					<Dropdown.Item
						id="duplicate"
						textValue="复制为新文档"
						onAction={() => void onDuplicate(doc.id)}
					>
						<div className="flex items-center gap-2 py-0.5">
							<Copy className="w-3.5 h-3.5 text-muted shrink-0" />
							<span className="text-xs">复制为新文档</span>
						</div>
					</Dropdown.Item>
					<Dropdown.Item
						id="open-local"
						textValue="打开本地文件夹"
						onAction={handleOpenLocalFolder}
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
									id="move-unfiled"
									textValue="移出文件夹（未分类）"
									onAction={() => {
										if (currentFolderId !== null) {
											void onMoveDocument(doc.id, null);
										}
									}}
								>
									<div className="flex items-center gap-2 py-0.5">
										<Inbox className="w-3.5 h-3.5 text-muted shrink-0" />
										<span className="text-xs flex-1">移出文件夹（未分类）</span>
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
});

