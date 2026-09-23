import { Modal } from "@heroui/react";
import { MemberCheckoutCard } from "./MemberCheckoutCard";

export interface CheckoutModalProps {
	isOpen: boolean;
	onClose?: () => void;
	onSuccess?: () => void;
	mandatory?: boolean;
	expiredNotice?: boolean;
}

/**
 * Member checkout modal for in-workbench user upgrade/renewal.
 * Rendered as a standard modal overlay (without fullscreen shader background).
 */
export function CheckoutModal({
	isOpen,
	onClose,
	onSuccess,
	mandatory = false,
	expiredNotice = false,
}: CheckoutModalProps) {
	if (!isOpen) return null;

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose?.()}
			variant="blur"
			className="z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
		>
			<Modal.Container className="w-full !max-w-[900px] max-w-[900px]">
				<Modal.Dialog
					aria-label="会员开通与续费"
					className="w-full !max-w-none bg-transparent border-0 shadow-none p-0 overflow-visible"
				>
					<MemberCheckoutCard
						onClose={onClose}
						onSuccess={onSuccess}
						mandatory={mandatory}
						expiredNotice={expiredNotice}
					/>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
