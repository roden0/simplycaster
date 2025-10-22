// Invite dialog component
import { useEffect, useRef, useState } from "preact/hooks";

export interface InviteDialogProps {
  isOpen: boolean;
  roomId: string;
  onClose: () => void;
}

export function InviteDialog({ isOpen, roomId, onClose }: InviteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      dialog.showModal();
    } else {
      dialog.close();
      setCopied(false); // Reset copied state when dialog closes
    }
  }, [isOpen]);

  const roomUrl = `${globalThis.location?.origin || ""}/room?id=${roomId}`;

  const handleCopyLink = async () => {
    try {
      await globalThis.navigator.clipboard.writeText(roomUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  const handleClose = (event: Event) => {
    const dialog = event.target as HTMLDialogElement;
    if (event.type === "close" || dialog === event.target) {
      onClose();
    }
  };

  return (
    <dialog ref={dialogRef} class="invite-dialog" onClose={handleClose}>
      <div class="invite-content">
        <div class="invite-header">
          <h3>Invite Participants</h3>
          <button
            type="button"
            onClick={onClose}
            class="dialog-close-btn"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <div class="invite-body">
          <p>Share this link to invite participants to the room:</p>
          
          <div class="invite-link-container">
            <input
              type="text"
              value={roomUrl}
              readonly
              class="invite-link-input"
              aria-label="Room invitation link"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              class={`copy-link-btn ${copied ? "copied" : ""}`}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <div class="invite-info">
            <p class="invite-note">
              Participants will need this link to join the room. Only the host can start and stop recordings.
            </p>
          </div>
        </div>

        <div class="invite-actions">
          <button type="button" onClick={onClose} class="invite-close-btn">
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}