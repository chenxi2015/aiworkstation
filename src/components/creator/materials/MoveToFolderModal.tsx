import { Modal } from "@heroui/react";
import { Folder, Inbox, Loader2 } from "lucide-react";
import type { MaterialFolder } from "../types";

interface MoveToFolderModalProps {
	isOpen: boolean;
	folders: MaterialFolder[];
	selectedCount: number;
	busy: boolean;
	onClose: () => void;
	onMove: (folderId: number | null) => void;
}

/**
 * Modal for batch moving materials into a target folder or unfiled
 */
export function MoveToFolderModal({
	isOpen,
	folders,
	selectedCount,
	busy,
	onClose,
	onMove,
}: MoveToFolderModalProps) {
	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="md" className="w-full">
				<Modal.Dialog aria-label="移动到文件夹" className="!max-w-md w-full">
					<Modal.CloseTrigger />
					<Modal.Header>
						<Modal.Heading>移动到文件夹</Modal.Heading>
					</Modal.Header>
					<Modal.Body className="flex flex-col gap-1 mt-2">
						<p className="text-[10px] text-muted mb-1">
							将选中的 {selectedCount} 条素材移动到：
						</p>
						<button
							type="button"
							disabled={busy}
							onClick={() => onMove(null)}
							className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-foreground/80 hover:bg-muted/10 transition-colors cursor-pointer disabled:opacity-50"
						>
							<Inbox className="w-3.5 h-3.5 text-muted" />
							未归档
						</button>
						{folders.map((folder) => (
							<button
								key={folder.id}
								type="button"
								disabled={busy}
								onClick={() => onMove(folder.id)}
								className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-foreground/80 hover:bg-muted/10 transition-colors cursor-pointer disabled:opacity-50"
							>
								<Folder className="w-3.5 h-3.5 text-muted" />
								<span className="flex-1 min-w-0 truncate text-left">
									{folder.name}
								</span>
								<span className="shrink-0 text-[10px] text-muted tabular-nums">
									{folder.materialCount ?? 0}
								</span>
							</button>
						))}
						{folders.length === 0 && (
							<p className="px-3 py-2 text-[10px] text-muted leading-relaxed">
								还没有文件夹，可先在右上角「新建文件夹」创建
							</p>
						)}
						{busy && (
							<p className="flex items-center gap-1.5 px-3 py-1 text-[10px] text-muted">
								<Loader2 className="w-3 h-3 animate-spin" />
								正在移动…
							</p>
						)}
					</Modal.Body>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
