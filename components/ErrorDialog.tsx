// Error dialog component
import { useEffect, useRef } from "preact/hooks";

export interface ErrorDialogProps {
  isOpen: boolean;
  message: string;
  onClose: () => void;
}

export function ErrorDialog({ isOpen, message, onClose }: ErrorDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [isOpen]);

  // Handle ESC key and backdrop click
  const handleClose = (event: Event) => {
    const dialog = event.target as HTMLDialogElement;
    if (event.type === "close" || dialog === event.target) {
      onClose();
    }
  };

  return (
    <dialog ref={dialogRef} class="error-dialog" onClose={handleClose}>
      <div class="error-content">
        <div class="error-header">
          <h3>Error</h3>
        </div>
        <div class="error-body">
          <p>{message}</p>
        </div>
        <div class="error-actions">
          <button type="button" onClick={onClose} class="error-dismiss-btn">
            Dismiss
          </button>
        </div>
      </div>
    </dialog>
  );
}
