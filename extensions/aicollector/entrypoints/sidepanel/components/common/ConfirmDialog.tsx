import React, { useState, type ReactNode } from 'react';
import { AlertDialog, Button } from '@heroui/react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

/**
 * Reusable confirmation dialog based on HeroUI AlertDialog
 * Designed for sidepanel extension context
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onOpenChange,
  title,
  description,
  confirmLabel = '确定',
  cancelLabel = '取消',
  danger = true,
  onConfirm,
}) => {
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
    <AlertDialog.Backdrop isOpen={isOpen} onOpenChange={onOpenChange} variant="blur">
      <AlertDialog.Container placement="center" className="p-3">
        <AlertDialog.Dialog className="max-w-[340px] w-full p-4 rounded-xl shadow-lg border border-border/80 bg-surface dark:bg-surface-secondary">
          <AlertDialog.CloseTrigger />
          <AlertDialog.Header>
            <AlertDialog.Icon status={danger ? 'danger' : 'warning'} />
            <AlertDialog.Heading className="text-sm font-semibold text-foreground">
              {title}
            </AlertDialog.Heading>
          </AlertDialog.Header>
          {description && (
            <AlertDialog.Body className="mt-2">
              <div className="text-xs text-muted leading-relaxed">{description}</div>
            </AlertDialog.Body>
          )}
          <AlertDialog.Footer className="flex justify-end gap-2 mt-4">
            <Button
              slot="close"
              variant="tertiary"
              size="sm"
              isDisabled={isPending}
              className="text-xs"
            >
              {cancelLabel}
            </Button>
            <Button
              variant={danger ? 'danger' : 'primary'}
              size="sm"
              onPress={handleConfirm}
              isPending={isPending}
              className="text-xs"
            >
              {confirmLabel}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
};
