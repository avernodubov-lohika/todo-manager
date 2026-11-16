import * as Dialog from '@radix-ui/react-dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, pending }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="card fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 p-6">
          <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{description}</Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="btn-secondary">Cancel</Dialog.Close>
            <button className="btn-danger" disabled={pending} onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
