import { AlertDialog, Button } from "@heroui/react";
import { type ReactNode, useState } from "react";

interface ConfirmDialogProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: ReactNode;
	confirmLabel?: string;
	cancelLabel?: string;
	onConfirm: () => void | Promise<void>;
}

/**
 * Reusable danger confirmation dialog built on HeroUI AlertDialog,
 * replacing native window.confirm across destructive workbench actions.
 */
export function ConfirmDialog({
	isOpen,
	onOpenChange,
	title,
	description,
	confirmLabel = "删除",
	cancelLabel = "取消",
	onConfirm,
}: ConfirmDialogProps) {
	const [isPending, setIsPending] = useState(false);

	const handleConfirm = async () => {
		setIsPending(true);
		try {
			await onConfirm();
			onOpenChange(false);
		} finally {
			setIsPending(false);
		}
	};

	return (
		<AlertDialog.Backdrop
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			variant="blur"
		>
			<AlertDialog.Container placement="center">
				<AlertDialog.Dialog className="sm:max-w-[400px]">
					<AlertDialog.CloseTrigger />
					<AlertDialog.Header>
						<AlertDialog.Icon status="danger" />
						<AlertDialog.Heading>{title}</AlertDialog.Heading>
					</AlertDialog.Header>
					{description && (
						<AlertDialog.Body>
							<p>{description}</p>
						</AlertDialog.Body>
					)}
					<AlertDialog.Footer>
						<Button slot="close" variant="tertiary" isDisabled={isPending}>
							{cancelLabel}
						</Button>
						<Button
							variant="danger"
							onPress={handleConfirm}
							isPending={isPending}
						>
							{confirmLabel}
						</Button>
					</AlertDialog.Footer>
				</AlertDialog.Dialog>
			</AlertDialog.Container>
		</AlertDialog.Backdrop>
	);
}
