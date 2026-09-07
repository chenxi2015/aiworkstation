import {
	Button,
	FieldError,
	Input,
	Label,
	Modal,
	TextField,
} from "@heroui/react";
import { type FormEvent, useEffect, useState } from "react";

interface RenameCategoryModalProps {
	isOpen: boolean;
	category: string;
	allCategories?: string[];
	onClose: () => void;
	onRename: (oldCategory: string, newCategory: string) => Promise<void>;
}

/**
 * Modal to rename a navigation category across all its member folders
 */
export function RenameCategoryModal({
	isOpen,
	category,
	allCategories = [],
	onClose,
	onRename,
}: RenameCategoryModalProps) {
	const [name, setName] = useState(category);
	const [error, setError] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		if (isOpen) {
			setName(category);
			setError("");
			setIsSubmitting(false);
		}
	}, [isOpen, category]);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) {
			setError("分类名称不能为空");
			return;
		}
		if (trimmed === category) {
			onClose();
			return;
		}
		if (trimmed === "未分类") {
			setError("不能使用系统保留分类名「未分类」");
			return;
		}

		setIsSubmitting(true);
		try {
			await onRename(category, trimmed);
			onClose();
		} catch (err) {
			console.error("Failed to rename category:", err);
			setError("重命名分类失败，请重试");
		} finally {
			setIsSubmitting(false);
		}
	};

	const fieldClassName =
		"rounded-xl border border-border bg-surface shadow-2xs transition-all hover:border-border/90 focus:border-accent focus:ring-2 focus:ring-accent/15";

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="sm">
				<Modal.Dialog aria-label="编辑分类名称">
					<Modal.CloseTrigger />

					<Modal.Header>
						<Modal.Heading>编辑分类名称</Modal.Heading>
					</Modal.Header>

					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
						<Modal.Body className="flex flex-col gap-3">
							<TextField
								value={name}
								onChange={(val) => {
									setName(val);
									if (error) setError("");
								}}
								isInvalid={!!error}
							>
								<Label>
									分类名称 <span className="text-danger">*</span>
								</Label>
								<Input
									placeholder="例如：生活与娱乐"
									maxLength={30}
									className={fieldClassName}
									autoFocus
								/>
								{error && <FieldError>{error}</FieldError>}
							</TextField>

							<p className="text-xs text-muted leading-relaxed">
								{allCategories.includes(name.trim()) &&
								name.trim() !== category ? (
									<span className="text-amber-500 font-medium">
										⚠️ 已存在同名分类「{name.trim()}
										」，保存后当前分类下的文件夹将合并并入该分类中。
									</span>
								) : (
									<>
										重命名后，原属于「
										<span className="text-foreground font-medium">
											{category}
										</span>
										」下的所有文件夹将同步变更为此新分类名称。
									</>
								)}
							</p>
						</Modal.Body>

						<Modal.Footer className="flex items-center justify-end gap-2">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="rounded-full"
								onPress={onClose}
								isDisabled={isSubmitting}
							>
								取消
							</Button>
							<Button
								type="submit"
								variant="primary"
								size="sm"
								className="rounded-full"
								isDisabled={isSubmitting}
							>
								{isSubmitting ? "保存中..." : "保存"}
							</Button>
						</Modal.Footer>
					</form>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
