// Invite landing island for guest room access
import { signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import { ErrorDialog } from "../components/ErrorDialog.tsx";
import { getCopy } from "../lib/copy.ts";

export interface InviteLandingProps {
  token: string;
  roomId: string | null;
}

interface InviteInfo {
  roomName: string;
  hostName: string;
  expiresAt: string;
  participantCount: number;
  isActive: boolean;
}

// Signals for invite state
const inviteInfo = signal<InviteInfo | null>(null);
const isLoading = signal(true);
const error = signal<string | null>(null);
const isJoining = signal(false);

export default function InviteLanding({
  token,
  roomId,
}: InviteLandingProps) {
  const [guestName, setGuestName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    validateInvite();
  }, [token]);

  const validateInvite = async () => {
    isLoading.value = true;
    error.value = null;

    try {
      // TODO: Implement actual API call to validate invite token
      const response = await fetch(`/api/invites/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, roomId }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(getCopy("invite.errors.invalidOrExpired"));
        }
        if (response.status === 410) {
          throw new Error(getCopy("invite.errors.expired"));
        }
        throw new Error(getCopy("invite.errors.failedToValidate"));
      }

      const data = await response.json();
      inviteInfo.value = data.invite;
    } catch (err) {
      console.error("Failed to validate invite:", err);
      error.value = err instanceof Error ? err.message : getCopy("invite.errors.failedToValidate");
    } finally {
      isLoading.value = false;
    }
  };

  const validateGuestName = (name: string): string | null => {
    if (!name.trim()) {
      return getCopy("invite.errors.nameRequired");
    }
    
    if (name.trim().length < 2) {
      return getCopy("invite.errors.nameMinLength");
    }
    
    if (name.trim().length > 50) {
      return getCopy("invite.errors.nameMaxLength");
    }
    
    return null;
  };

  const handleNameChange = (name: string) => {
    setGuestName(name);
    setNameError(null);
  };

  const handleJoinRoom = async () => {
    const nameValidationError = validateGuestName(guestName);
    if (nameValidationError) {
      setNameError(nameValidationError);
      return;
    }

    if (!inviteInfo.value) return;

    isJoining.value = true;
    error.value = null;

    try {
      // TODO: Implement actual API call to join room
      const response = await fetch(`/api/invites/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          guestName: guestName.trim(),
          roomId,
        }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(getCopy("invite.errors.roomNotFound"));
        }
        if (response.status === 410) {
          throw new Error(getCopy("invite.errors.expired"));
        }
        throw new Error(getCopy("invite.errors.failedToJoin"));
      }

      const data = await response.json();
      
      // Redirect to room with guest session
      globalThis.location.href = `/room?id=${data.roomId}&guest=${data.guestToken}`;
    } catch (err) {
      console.error("Failed to join room:", err);
      error.value = err instanceof Error ? err.message : getCopy("invite.errors.failedToJoin");
    } finally {
      isJoining.value = false;
    }
  };

  const formatTimeRemaining = (expiresAt: string): string => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffInMinutes = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60));

    if (diffInMinutes <= 0) return "Expired";
    if (diffInMinutes < 60) return getCopy("time.minutesAgo", { count: diffInMinutes.toString() });
    
    const hours = Math.floor(diffInMinutes / 60);
    if (hours < 24) return `${hours} ${hours === 1 ? getCopy("time.hour") : getCopy("time.hours")}`;
    
    const days = Math.floor(hours / 24);
    return `${days} ${days === 1 ? getCopy("time.day") : getCopy("time.days")}`;
  };

  if (isLoading.value) {
    return (
      <div class="invite-loading">
        <div class="loading-container">
          <div class="loading-spinner"></div>
          <h2>{getCopy("invite.validatingInvitation")}</h2>
          <p>{getCopy("invite.validatingMessage")}</p>
        </div>
      </div>
    );
  }

  if (error.value || !inviteInfo.value) {
    return (
      <div class="invite-error">
        <div class="error-container">
          <div class="error-icon">❌</div>
          <h2>{getCopy("invite.invalidInvitation")}</h2>
          <p>{error.value || getCopy("invite.invalidMessage")}</p>
          <div class="error-actions">
            <a href="/login" class="login-link">
              {getCopy("invite.goToLogin")}
            </a>
          </div>
        </div>
      </div>
    );
  }

  const invite = inviteInfo.value;
  const timeRemaining = formatTimeRemaining(invite.expiresAt);
  const isExpired = timeRemaining === "Expired";

  if (isExpired) {
    return (
      <div class="invite-expired">
        <div class="expired-container">
          <div class="expired-icon">⏰</div>
          <h2>{getCopy("invite.expiredInvitation")}</h2>
          <p>{getCopy("invite.expiredMessage")}</p>
          <div class="expired-info">
            <p>
              <strong>{getCopy("room.title")}:</strong> {invite.roomName}<br />
              <strong>{getCopy("invite.roomDetails.host")}</strong> {invite.hostName}<br />
              <strong>Expired:</strong> {new Date(invite.expiresAt).toLocaleString()}
            </p>
          </div>
          <div class="expired-actions">
            <a href="/login" class="login-link">
              {getCopy("invite.goToLogin")}
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!invite.isActive) {
    return (
      <div class="invite-inactive">
        <div class="inactive-container">
          <div class="inactive-icon">🚫</div>
          <h2>{getCopy("invite.roomNotActive")}</h2>
          <p>{getCopy("invite.roomNotActiveMessage")}</p>
          <div class="inactive-info">
            <p>
              <strong>{getCopy("room.title")}:</strong> {invite.roomName}<br />
              <strong>{getCopy("invite.roomDetails.host")}</strong> {invite.hostName}
            </p>
            <p>
              {getCopy("invite.contactHost")}
            </p>
          </div>
          <div class="inactive-actions">
            <button
              type="button"
              onClick={validateInvite}
              class="refresh-btn"
              disabled={isLoading.value}
            >
              {isLoading.value ? getCopy("invite.checking") : getCopy("invite.checkAgain")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="invite-valid">
      <div class="invite-container">
        <div class="invite-header">
          <div class="invite-icon">🎙️</div>
          <h1>{getCopy("invite.title")}</h1>
          <p class="invite-subtitle">
            {getCopy("invite.subtitle")}
          </p>
        </div>

        <div class="room-info">
          <div class="room-card">
            <h2>{invite.roomName}</h2>
            <div class="room-details">
              <div class="detail-item">
                <span class="detail-label">{getCopy("invite.roomDetails.host")}</span>
                <span class="detail-value">{invite.hostName}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">{getCopy("invite.roomDetails.participants")}</span>
                <span class="detail-value">{getCopy("invite.roomDetails.currentlyInRoom", { count: invite.participantCount.toString() })}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">{getCopy("invite.roomDetails.accessExpires")}</span>
                <span class="detail-value">{getCopy("invite.roomDetails.remaining", { time: timeRemaining })}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="join-form">
          <div class="form-group">
            <label for="guest-name" class="form-label">
              {getCopy("invite.yourName")} *
            </label>
            <input
              id="guest-name"
              type="text"
              value={guestName}
              onInput={(e) =>
                handleNameChange((e.target as HTMLInputElement).value)
              }
              class={`form-input ${nameError ? 'error' : ''}`}
              placeholder={getCopy("invite.enterName")}
              maxLength={50}
              disabled={isJoining.value}
            />
            {nameError && (
              <div class="field-error">{nameError}</div>
            )}
            <div class="field-help">
              {getCopy("invite.nameVisible")}
            </div>
          </div>

          <div class="join-actions">
            <button
              type="button"
              onClick={handleJoinRoom}
              class="join-btn"
              disabled={!guestName.trim() || isJoining.value || !!nameError}
            >
              {isJoining.value ? getCopy("invite.joiningRoom") : getCopy("invite.joinRoom")}
            </button>
          </div>
        </div>

        <div class="invite-info">
          <div class="info-icon">ℹ️</div>
          <div class="info-text">
            <p>
              {getCopy("invite.guestInfo")}
            </p>
            <p>
              {getCopy("invite.permissionsInfo")}
            </p>
          </div>
        </div>
      </div>

      {/* Error Dialog */}
      <ErrorDialog
        isOpen={!!error.value}
        message={error.value || ""}
        onClose={() => error.value = null}
      />
    </div>
  );
}