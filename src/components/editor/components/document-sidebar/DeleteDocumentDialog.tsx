import { memo } from "react";
import { ConfirmDialog } from "../../../workbench/ConfirmDialog";
import type { EditorDocument } from "../../types";

export interface DeleteDocumentDialogProps {
	doc: EditorDocument | null;
	isOpen: boolean;
	deleteLocalAssets: boolean;
	onChangeDeleteLocalAssets: (checked: boolean) => void;
	onClose: () => void;
	onConfirm: () => Promise<void>;
}

export const DeleteDocumentDialog = memo(function DeleteDocumentDialog({
	doc,
	isOpen,
	deleteLocalAssets,
	onChangeDeleteLocalAssets,
	onClose,
	onConfirm,
}: DeleteDocumentDialogProps) {
	return (
		<ConfirmDialog
			isOpen={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			title="删除文档"
			description={`确定删除「${doc?.title ?? ""}」吗？版本快照会一并删除，此操作不可撤销。`}
			onConfirm={onConfirm}
		>
			<label className="flex items-center gap-2 mt-3 p-2 rounded-lg bg-surface-secondary/50 border border-border/50 text-xs text-foreground cursor-pointer select-none hover:bg-surface-secondary transition-colors">
				<input
					type="checkbox"
					checked={deleteLocalAssets}
					onChange={(e) => onChangeDeleteLocalAssets(e.target.checked)}
					className="accent-accent w-3.5 h-3.5 rounded cursor-pointer shrink-0"
				/>
				<span className="text-muted text-[11px] leading-snug">
					同时彻底删除本地下载的媒体资源（图片、视频等）
				</span>
			</label>
		</ConfirmDialog>
	);
});

