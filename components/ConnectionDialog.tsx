// Connection status dialog component
import { useEffect, useRef } from "preact/hooks";

export interface ConnectionDialogProps {
  isOpen: boolean;
  message?: string;
}

export function ConnectionDialog({
  isOpen,
  message = "Connecting to room...",
}: ConnectionDialogProps) {
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

  return (
    <dialog ref={dialogRef} class="connection-dialog">
      <div class="connection-content">
        <p class="connection-message">{message}</p>
        <div class="loading-spinner" aria-label="Loading"></div>
      </div>
    </dialog>
  );
}