import { AlertDialog, Button, toast } from "@heroui/react";
import { useEffect, useState } from "react";
import { requestUninstallSkill } from "../../services/api/skillsClient";
import type { SkillInfo } from "./types";

export interface UninstallConfirmModalProps {
	skill: SkillInfo | null;
	isOpen: boolean;
	onClose: () => void;
	onSuccess: () => void;
}

/**
 * Skill uninstallation confirmation dialog built with HeroUI AlertDialog.
 */
export function UninstallConfirmModal({
	skill,
	isOpen,
	onClose,
	onSuccess,
}: UninstallConfirmModalProps) {
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");

	// Reset error state when modal opens or closes
	useEffect(() => {
		if (isOpen) {
			setError("");
		}
	}, [isOpen]);

	const handleConfirm = async () => {
		if (!skill?.dirPath) return;
		setSubmitting(true);
		setError("");

		try {
			const res = await requestUninstallSkill(skill.dirPath);
			if (res.success) {
				toast.success(`技能 "${skill.name}" 已成功卸载`);
				onSuccess();
				onClose();
			} else {
				setError(res.message);
				toast.danger(res.message || "卸载技能失败");
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : "卸载请求发生异常";
			setError(msg);
			toast.danger(msg);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<AlertDialog.Backdrop
			isOpen={isOpen && Boolean(skill)}
			onOpenChange={(open) => {
				if (!open && !submitting) {
					onClose();
				}
			}}
			variant="blur"
		>
			<AlertDialog.Container placement="center">
				<AlertDialog.Dialog className="sm:max-w-[420px]">
					<AlertDialog.CloseTrigger />
					<AlertDialog.Header>
						<AlertDialog.Icon status="danger" />
						<AlertDialog.Heading>确认卸载技能？</AlertDialog.Heading>
					</AlertDialog.Header>

					<AlertDialog.Body className="space-y-3">
						<p className="text-sm text-muted leading-relaxed">
							此操作将从本地磁盘安全删除技能{" "}
							<span className="font-semibold text-foreground">
								{skill?.name}
							</span>{" "}
							及其所有配置文件，操作后不可恢复：
						</p>

						{skill?.dirPath && (
							<div className="p-2.5 rounded-lg bg-surface-secondary/60 dark:bg-surface-secondary/40 font-mono text-xs text-muted break-all border border-border select-text">
								{skill.dirPath}
							</div>
						)}

						{error && (
							<div className="p-2.5 rounded-lg bg-danger/10 text-danger border border-danger/20 text-xs">
								{error}
							</div>
						)}
					</AlertDialog.Body>

					<AlertDialog.Footer>
						<Button
							slot="close"
							variant="tertiary"
							isDisabled={submitting}
							onPress={onClose}
						>
							取消
						</Button>
						<Button
							variant="danger"
							isPending={submitting}
							onPress={handleConfirm}
						>
							确认卸载
						</Button>
					</AlertDialog.Footer>
				</AlertDialog.Dialog>
			</AlertDialog.Container>
		</AlertDialog.Backdrop>
	);
}

