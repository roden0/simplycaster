// Video mosaic component for displaying participant video streams

export interface Participant {
  id: string;
  name: string;
  isHost: boolean;
  videoStream?: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
}

export interface VideoMosaicProps {
  participants: Participant[];
  currentUserId: string;
  isHost: boolean;
  onKickParticipant?: (participantId: string) => void;
}

export function VideoMosaic({
  participants,
  currentUserId,
  isHost,
  onKickParticipant,
}: VideoMosaicProps) {
  const getGridClass = (count: number) => {
    if (count === 1) return "video-grid-1";
    if (count === 2) return "video-grid-2";
    if (count <= 4) return "video-grid-4";
    if (count <= 6) return "video-grid-6";
    return "video-grid-many";
  };

  return (
    <div class="video-mosaic">
      <div class={`video-grid ${getGridClass(participants.length)}`}>
        {participants.map((participant) => (
          <div
            key={participant.id}
            class={`participant-box ${
              participant.id === currentUserId ? "current-user" : ""
            }`}
          >
            <div class="video-container">
              <video
                class="participant-video"
                autoplay
                muted={participant.id === currentUserId}
                playsInline
              />

              {!participant.videoEnabled && (
                <div class="video-placeholder">
                  <div class="avatar-placeholder">
                    {participant.name.charAt(0).toUpperCase()}
                  </div>
                </div>
              )}
            </div>

            <div class="participant-info">
              <div class="participant-details">
                <span class="participant-name">
                  {participant.name}
                  {participant.isHost && <span class="host-badge">Host</span>}
                  {participant.id === currentUserId && (
                    <span class="you-badge">You</span>
                  )}
                </span>

                <div class="participant-status">
                  <span
                    class={`audio-status ${
                      participant.audioEnabled ? "enabled" : "disabled"
                    }`}
                  >
                    {participant.audioEnabled ? "🎤" : "🔇"}
                  </span>
                  <span
                    class={`video-status ${
                      participant.videoEnabled ? "enabled" : "disabled"
                    }`}
                  >
                    {participant.videoEnabled ? "📹" : "📷"}
                  </span>
                </div>
              </div>

              {isHost && participant.id !== currentUserId && (
                <button
                  type="button"
                  onClick={() => onKickParticipant?.(participant.id)}
                  class="kick-button"
                  aria-label={`Remove ${participant.name} from room`}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {participants.length === 0 && (
        <div class="empty-room">
          <div class="empty-room-message">
            <h3>Waiting for participants...</h3>
            <p>Share the room link to invite others to join.</p>
          </div>
        </div>
      )}
    </div>
  );
}
