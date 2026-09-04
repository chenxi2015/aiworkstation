import {
	Button,
	FieldError,
	Input,
	Label,
	Modal,
	TextArea,
	TextField,
} from "@heroui/react";
import { type FormEvent, useEffect, useState } from "react";
import type { Folder } from "./types";

interface AddLinkModalProps {
	isOpen: boolean;
	folder: Folder | null;
	onClose: () => void;
	onSave: (data: { url: string; title?: string; description?: string }) => void;
}

/**
 * Modal for manually adding a link into a specific folder
 */
export function AddLinkModal({
	isOpen,
	folder,
	onClose,
	onSave,
}: AddLinkModalProps) {
	const [url, setUrl] = useState("");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [error, setError] = useState("");

	useEffect(() => {
		if (isOpen) {
			setUrl("");
			setTitle("");
			setDescription("");
			setError("");
		}
	}, [isOpen]);

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		const trimmedUrl = url.trim();
		if (!trimmedUrl) {
			setError("请输入链接地址");
			return;
		}
		if (!/^https?:\/\/\S+$/i.test(trimmedUrl)) {
			setError("请输入以 http:// 或 https:// 开头的有效链接");
			return;
		}

		onSave({
			url: trimmedUrl,
			title: title.trim() || undefined,
			description: description.trim() || undefined,
		});
	};

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="sm">
				<Modal.Dialog aria-label="新建链接">
					<Modal.CloseTrigger />

					<Modal.Header>
						<Modal.Heading>新建链接</Modal.Heading>
						{folder && (
							<p className="text-xs text-muted mt-1">
								将保存到文件夹「{folder.name}」
							</p>
						)}
					</Modal.Header>

					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
						<Modal.Body className="flex flex-col gap-4">
							<TextField
								value={url}
								onChange={(val) => {
									setUrl(val);
									if (error) setError("");
								}}
								isInvalid={!!error}
							>
								<Label>
									链接地址 <span className="text-danger">*</span>
								</Label>
								<Input
									placeholder="https://example.com"
									variant="secondary"
									autoFocus
								/>
								{error && <FieldError>{error}</FieldError>}
							</TextField>

							<TextField value={title} onChange={setTitle}>
								<Label>名称（可选）</Label>
								<Input
									placeholder="留空则使用链接地址作为名称"
									maxLength={60}
									variant="secondary"
								/>
							</TextField>

							<TextField value={description} onChange={setDescription}>
								<Label>描述（可选）</Label>
								<TextArea
									placeholder="这个链接有什么用？"
									maxLength={120}
									rows={2}
									variant="secondary"
								/>
							</TextField>
						</Modal.Body>

						<Modal.Footer className="flex items-center justify-end gap-2">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="rounded-full"
								onPress={onClose}
							>
								取消
							</Button>
							<Button
								type="submit"
								variant="primary"
								size="sm"
								className="rounded-full"
							>
								保存
							</Button>
						</Modal.Footer>
					</form>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
