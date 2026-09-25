import { Button, Input, Label, Modal, TextField, toast } from "@heroui/react";
import { Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
	createMaterialFolderRpc,
	updateMaterialFolderRpc,
} from "../../../services/api/creatorClient";
import type { MaterialFolder } from "../types";

interface FolderFormModalProps {
	isOpen: boolean;
	folder: MaterialFolder | null;
	onClose: () => void;
	onSaved: () => Promise<void>;
}

/**
 * Modal for creating or renaming a material folder
 */
export function FolderFormModal({
	isOpen,
	folder,
	onClose,
	onSaved,
}: FolderFormModalProps) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (isOpen) {
			setName(folder?.name ?? "");
			setDescription(folder?.description ?? "");
		}
	}, [isOpen, folder]);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		if (!name.trim()) {
			toast.warning("文件夹名称不能为空");
			return;
		}
		setSaving(true);
		try {
			if (folder) {
				await updateMaterialFolderRpc({
					id: folder.id,
					name: name.trim(),
					description: description.trim() || undefined,
				});
				toast.success(`文件夹已重命名为「${name.trim()}」`);
			} else {
				await createMaterialFolderRpc({
					name: name.trim(),
					description: description.trim() || undefined,
				});
				toast.success(`文件夹「${name.trim()}」已创建`);
			}
			onClose();
			await onSaved();
		} catch (err) {
			toast.danger(
				`保存失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="md" className="w-full">
				<Modal.Dialog
					aria-label={folder ? "重命名文件夹" : "新建文件夹"}
					className="!max-w-md w-full"
				>
					<Modal.CloseTrigger />
					<Modal.Header>
						<Modal.Heading>
							{folder ? "重命名文件夹" : "新建文件夹"}
						</Modal.Heading>
					</Modal.Header>
					<form onSubmit={handleSubmit}>
						<Modal.Body className="flex flex-col gap-3 mt-2">
							<TextField value={name} onChange={setName}>
								<Label>文件夹名称</Label>
								<Input
									placeholder="例如：短视频选题 / 竞品调研"
									variant="secondary"
								/>
							</TextField>
							<TextField value={description} onChange={setDescription}>
								<Label>描述（可选）</Label>
								<Input
									placeholder="这个文件夹归集什么素材"
									variant="secondary"
								/>
							</TextField>
						</Modal.Body>
						<Modal.Footer className="flex justify-end gap-2 mt-3">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="rounded-full cursor-pointer"
								onPress={onClose}
							>
								取消
							</Button>
							<Button
								type="submit"
								variant="primary"
								size="sm"
								className="rounded-full flex items-center gap-1.5 cursor-pointer"
								isDisabled={saving}
							>
								{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
								{folder ? "保存" : "创建"}
							</Button>
						</Modal.Footer>
					</form>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
