// Recording controls component for room interface

export interface RecordingControlsProps {
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onInvite: () => void;
  onLeave: () => void;
  disabled?: boolean;
}

export function RecordingControls({
  isRecording,
  onStartRecording,
  onStopRecording,
  onInvite,
  onLeave,
  disabled = false,
}: RecordingControlsProps) {
  return (
    <div class="recording-controls">
      <div class="recording-actions">
        {!isRecording
          ? (
            <button
              type="button"
              onClick={onStartRecording}
              disabled={disabled}
              class="record-button"
              aria-label="Start recording"
            >
              <span class="record-icon">●</span>
              Start Recording
            </button>
          )
          : (
            <button
              type="button"
              onClick={onStopRecording}
              disabled={disabled}
              class="stop-button"
              aria-label="Stop recording"
            >
              <span class="stop-icon">■</span>
              Stop Recording
            </button>
          )}
      </div>

      <div class="room-actions">
        <button
          type="button"
          onClick={onInvite}
          disabled={disabled}
          class="invite-button"
          aria-label="Invite participants"
        >
          <span class="invite-icon">+</span>
          Invite
        </button>

        <button
          type="button"
          onClick={onLeave}
          disabled={disabled}
          class="leave-button"
          aria-label="Leave room"
        >
          <span class="leave-icon">←</span>
          Leave
        </button>
      </div>
    </div>
  );
}
