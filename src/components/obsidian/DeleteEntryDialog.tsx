import { Checkbox, Label } from "@heroui/react";
import { useState } from "react";
import { ConfirmDialog } from "../workbench/ConfirmDialog";

const SKIP_KEY = "obsidian_delete_skip_confirm";

/** 用户勾选了「不再询问」时跳过删除确认弹窗 */
export function shouldSkipDeleteConfirm(): boolean {
	try {
		return window.localStorage.getItem(SKIP_KEY) === "1";
	} catch {
		return false;
	}
}

export interface DeleteEntryDialogProps {
	/** 待删除条目；null 时关闭 */
	target: { name: string; kind: "folder" | "note" } | null;
	onClose: () => void;
	/** 确认删除（移动条目到系统回收站） */
	onConfirm: () => void | Promise<void>;
}

/** 删除笔记/文件夹确认弹窗（HeroUI AlertDialog，对齐 Obsidian 样式与回收站语义） */
export function DeleteEntryDialog({
	target,
	onClose,
	onConfirm,
}: DeleteEntryDialogProps) {
	const [skipFuture, setSkipFuture] = useState(false);

	const isFolder = target?.kind === "folder";
	const fileLabel = isFolder ? "文件夹" : "文件";
	const displayName =
		target && !isFolder && !target.name.toLowerCase().endsWith(".md")
			? `${target.name}.md`
			: (target?.name ?? "");

	return (
		<ConfirmDialog
			isOpen={target !== null}
			onOpenChange={(open) => !open && onClose()}
			title={`删除${fileLabel}`}
			description={
				<>
					你确定要删除 “{displayName}” 吗？
					<br />
					它将被移动到系统回收站里。
					{isFolder ? "（其中全部内容一起移动）" : ""}
				</>
			}
			confirmLabel="删除"
			onConfirm={async () => {
				if (skipFuture) {
					try {
						window.localStorage.setItem(SKIP_KEY, "1");
					} catch {}
				}
				await onConfirm();
			}}
		>
			<Checkbox
				isSelected={skipFuture}
				onChange={setSkipFuture}
				className="mt-3"
			>
				<Checkbox.Content>
					<Checkbox.Control>
						<Checkbox.Indicator />
					</Checkbox.Control>
					<Label className="text-xs text-muted cursor-pointer">不再询问</Label>
				</Checkbox.Content>
			</Checkbox>
		</ConfirmDialog>
	);
}
