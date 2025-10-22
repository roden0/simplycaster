// Recording status display component

export interface RecordingStatusProps {
  isRecording: boolean;
  recordingTime: number; // in seconds
  className?: string;
}

export function RecordingStatus({
  isRecording,
  recordingTime,
  className = "",
}: RecordingStatusProps) {
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${
        minutes.toString().padStart(2, "0")
      }:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${
      secs.toString().padStart(2, "0")
    }`;
  };

  return (
    <div class={`recording-status ${className}`}>
      <div class="recording-timer">
        <span class="timer-display" aria-live="polite">
          {formatTime(recordingTime)}
        </span>
      </div>

      {isRecording && (
        <div class="recording-indicator">
          <span class="recording-dot"></span>
          <span class="recording-text">Recording</span>
        </div>
      )}

      {!isRecording && recordingTime > 0 && (
        <div class="paused-indicator">
          <span class="paused-text">Paused</span>
        </div>
      )}
    </div>
  );
}
