// Invite guest dialog component
import { useEffect, useRef, useState } from "preact/hooks";
import type { ActiveRoom } from "./CrewList.tsx";
import { getCopy } from "../lib/copy.ts";

export interface InviteGuestFormData {
  roomId: string;
  email: string;
  expirationHours: number;
}

export interface InviteGuestDialogProps {
  isOpen: boolean;
  activeRooms: ActiveRoom[];
  onClose: () => void;
  onInvite: (formData: InviteGuestFormData) => Promise<void>;
  isInviting: boolean;
}

export function InviteGuestDialog({
  isOpen,
  activeRooms,
  onClose,
  onInvite,
  isInviting,
}: InviteGuestDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  
  const [formData, setFormData] = useState<InviteGuestFormData>({
    roomId: "",
    email: "",
    expirationHours: 24,
  });
  
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      dialog.showModal();
      // Set default room if available
      if (activeRooms.length > 0 && !formData.roomId) {
        setFormData(prev => ({ ...prev, roomId: activeRooms[0].id }));
      }
    } else {
      dialog.close();
      // Reset form when dialog closes
      setFormData({
        roomId: activeRooms.length > 0 ? activeRooms[0].id : "",
        email: "",
        expirationHours: 24,
      });
      setEmailError(null);
    }
  }, [isOpen, activeRooms]);

  const validateEmail = (email: string): string | null => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!email.trim()) {
      return "Email is required";
    }
    
    if (!emailRegex.test(email)) {
      return "Please enter a valid email address";
    }
    
    return null;
  };

  const handleEmailChange = (email: string) => {
    setFormData(prev => ({ ...prev, email }));
    setEmailError(null);
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    
    const emailValidationError = validateEmail(formData.email);
    if (emailValidationError) {
      setEmailError(emailValidationError);
      return;
    }

    if (!formData.roomId) {
      return;
    }

    try {
      await onInvite(formData);
      onClose();
    } catch (error) {
      console.error("Invite failed:", error);
    }
  };

  const handleClose = (event: Event) => {
    const dialog = event.target as HTMLDialogElement;
    if (event.type === "close" || dialog === event.target) {
      onClose();
    }
  };

  const getExpirationText = (hours: number): string => {
    if (hours < 24) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''}`;
  };

  return (
    <dialog ref={dialogRef} class="invite-guest-dialog" onClose={handleClose}>
      <div class="invite-guest-content">
        <div class="invite-guest-header">
          <h3>{getCopy("crew.inviteDialog.title")}</h3>
          <button
            type="button"
            onClick={onClose}
            class="dialog-close-btn"
            aria-label="Close dialog"
            disabled={isInviting}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} class="invite-guest-form">
          <div class="invite-guest-body">
            {activeRooms.length === 0 ? (
              <div class="no-rooms-message">
                <div class="no-rooms-icon">🏠</div>
                <h4>No Active Rooms</h4>
                <p>
                  You need to create a room first before inviting guests. 
                  Guests can only be invited to active rooms.
                </p>
              </div>
            ) : (
              <>
                <div class="form-group">
                  <label for="room-select" class="form-label">
                    Select Room *
                  </label>
                  <select
                    id="room-select"
                    value={formData.roomId}
                    onChange={(e) =>
                      setFormData(prev => ({
                        ...prev,
                        roomId: (e.target as HTMLSelectElement).value,
                      }))
                    }
                    class="form-select"
                    required
                    disabled={isInviting}
                  >
                    <option value="">Choose a room...</option>
                    {activeRooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name} (Host: {room.hostName}, {room.participantCount} participants)
                      </option>
                    ))}
                  </select>
                </div>

                <div class="form-group">
                  <label for="guest-email" class="form-label">
                    Guest Email *
                  </label>
                  <input
                    id="guest-email"
                    type="email"
                    value={formData.email}
                    onInput={(e) =>
                      handleEmailChange((e.target as HTMLInputElement).value)
                    }
                    class={`form-input ${emailError ? 'error' : ''}`}
                    placeholder="guest@example.com"
                    required
                    disabled={isInviting}
                  />
                  {emailError && (
                    <div class="field-error">{emailError}</div>
                  )}
                </div>

                <div class="form-group">
                  <label for="expiration-hours" class="form-label">
                    Access Duration
                  </label>
                  <select
                    id="expiration-hours"
                    value={formData.expirationHours}
                    onChange={(e) =>
                      setFormData(prev => ({
                        ...prev,
                        expirationHours: parseInt((e.target as HTMLSelectElement).value),
                      }))
                    }
                    class="form-select"
                    disabled={isInviting}
                  >
                    <option value={1}>1 hour</option>
                    <option value={2}>2 hours</option>
                    <option value={4}>4 hours</option>
                    <option value={8}>8 hours</option>
                    <option value={24}>1 day</option>
                    <option value={48}>2 days</option>
                    <option value={72}>3 days</option>
                    <option value={168}>1 week</option>
                  </select>
                  <div class="field-help">
                    Guest access will expire after {getExpirationText(formData.expirationHours)}
                  </div>
                </div>

                <div class="invite-info">
                  <div class="info-icon">ℹ️</div>
                  <div class="info-text">
                    <p>
                      The guest will receive an email with a magic link to join the selected room. 
                      The link will expire after the specified duration.
                    </p>
                    <p>
                      Guests have limited permissions and can only participate in the room they're invited to.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          <div class="invite-guest-actions">
            <button
              type="button"
              onClick={onClose}
              class="cancel-btn"
              disabled={isInviting}
            >
              {getCopy("common.cancel")}
            </button>
            
            {activeRooms.length > 0 && (
              <button
                type="submit"
                class="invite-submit-btn"
                disabled={!formData.roomId || !formData.email.trim() || isInviting || !!emailError}
              >
                {isInviting ? "Sending Invite..." : "Send Invite"}
              </button>
            )}
          </div>
        </form>
      </div>
    </dialog>
  );
}