// Archive list component for displaying room recordings
import { getCopy } from "../lib/copy.ts";

export interface Recording {
  id: string;
  roomName: string;
  date: string;
  duration: number; // in seconds
  participantCount: number;
  participants: string[];
  files: RecordingFile[];
  metadata?: {
    hostName: string;
    description?: string;
    tags?: string[];
  };
}

export interface RecordingFile {
  id: string;
  fileName: string;
  participantName: string;
  fileSize: number; // in bytes
  format: string; // mp3, ogg, webm
  downloadUrl: string;
}

export interface ArchiveListProps {
  recordings: Recording[];
  searchQuery: string;
  sortBy: "name" | "date";
  sortOrder: "asc" | "desc";
  currentPage: number;
  totalPages: number;
  selectedRecording: Recording | null;
  onSearch: (query: string) => void;
  onSort: (sortBy: "name" | "date", order: "asc" | "desc") => void;
  onPageChange: (page: number) => void;
  onSelectRecording: (recording: Recording | null) => void;
  onDeleteRecording: (recordingId: string) => void;
  isHost: boolean;
  isAdmin: boolean;
}

export function ArchiveList({
  recordings,
  searchQuery,
  sortBy,
  sortOrder,
  currentPage,
  totalPages,
  selectedRecording,
  onSearch,
  onSort,
  onPageChange,
  onSelectRecording,
  onDeleteRecording,
  isHost,
  isAdmin,
}: ArchiveListProps) {
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    return `${minutes}m ${secs}s`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatFileSize = (bytes: number): string => {
    const sizes = ["B", "KB", "MB", "GB"];
    if (bytes === 0) return "0 B";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const canDeleteRecording = (recording: Recording): boolean => {
    return isAdmin || (isHost && recording.metadata?.hostName === "current-user");
  };

  return (
    <div class="archive-container">
      {/* Search and Controls */}
      <div class="archive-header">
        <div class="archive-title">
          <h1>{getCopy("archive.title")}</h1>
          <p class="archive-subtitle">
            {getCopy("archive.subtitle")}
          </p>
        </div>

        <div class="archive-controls">
          <div class="search-container">
            <input
              type="text"
              placeholder={getCopy("archive.searchRecordings")}
              value={searchQuery}
              onInput={(e) => onSearch((e.target as HTMLInputElement).value)}
              class="search-input"
              aria-label={getCopy("archive.searchRecordings")}
            />
            <span class="search-icon">🔍</span>
          </div>

          <div class="sort-controls">
            <label class="sort-label">{getCopy("archive.sortBy")}</label>
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = (e.target as HTMLSelectElement).value.split("-");
                onSort(field as "name" | "date", order as "asc" | "desc");
              }}
              class="sort-select"
              aria-label={getCopy("archive.sortBy")}
            >
              <option value="date-desc">{getCopy("archive.sortByDateNewest")}</option>
              <option value="date-asc">{getCopy("archive.sortByDateOldest")}</option>
              <option value="name-asc">{getCopy("archive.sortByNameAZ")}</option>
              <option value="name-desc">{getCopy("archive.sortByNameZA")}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div class="archive-content">
        {/* Recordings List */}
        <div class="recordings-list">
          {recordings.length === 0 ? (
            <div class="empty-state">
              <div class="empty-icon">📁</div>
              <h3>{getCopy("archive.noRecordings")}</h3>
              <p>
                {searchQuery
                  ? getCopy("archive.tryAdjustingSearch")
                  : getCopy("archive.noRecordingsMessage")}
              </p>
            </div>
          ) : (
            <>
              {recordings.map((recording) => (
                <div
                  key={recording.id}
                  class={`recording-item ${
                    selectedRecording?.id === recording.id ? "selected" : ""
                  }`}
                  onClick={() => onSelectRecording(recording)}
                >
                  <div class="recording-info">
                    <div class="recording-header">
                      <h3 class="recording-name">{recording.roomName}</h3>
                      <div class="recording-meta">
                        <span class="recording-date">
                          {formatDate(recording.date)}
                        </span>
                        <span class="recording-duration">
                          {formatDuration(recording.duration)}
                        </span>
                        <span class="participant-count">
                          {recording.participantCount} participants
                        </span>
                      </div>
                    </div>

                    <div class="recording-participants">
                      <span class="participants-label">Participants:</span>
                      <span class="participants-list">
                        {recording.participants.join(", ")}
                      </span>
                    </div>
                  </div>

                  <div class="recording-actions">
                    {canDeleteRecording(recording) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteRecording(recording.id);
                        }}
                        class="delete-btn"
                        aria-label={`Delete recording ${recording.roomName}`}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div class="pagination">
                  <button
                    type="button"
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    class="pagination-btn"
                    aria-label="Previous page"
                  >
                    ← Previous
                  </button>

                  <div class="pagination-info">
                    <span>
                      Page {currentPage} of {totalPages}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    class="pagination-btn"
                    aria-label="Next page"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Recording Details Sidebar */}
        {selectedRecording && (
          <div class="recording-sidebar">
            <div class="sidebar-header">
              <h2>Recording Details</h2>
              <button
                type="button"
                onClick={() => onSelectRecording(null)}
                class="sidebar-close"
                aria-label="Close details"
              >
                ✕
              </button>
            </div>

            <div class="sidebar-content">
              <div class="recording-summary">
                <h3>{selectedRecording.roomName}</h3>
                <div class="summary-grid">
                  <div class="summary-item">
                    <label>Date:</label>
                    <span>{formatDate(selectedRecording.date)}</span>
                  </div>
                  <div class="summary-item">
                    <label>Duration:</label>
                    <span>{formatDuration(selectedRecording.duration)}</span>
                  </div>
                  <div class="summary-item">
                    <label>Participants:</label>
                    <span>{selectedRecording.participantCount}</span>
                  </div>
                  {selectedRecording.metadata?.hostName && (
                    <div class="summary-item">
                      <label>Host:</label>
                      <span>{selectedRecording.metadata.hostName}</span>
                    </div>
                  )}
                </div>

                {selectedRecording.metadata?.description && (
                  <div class="recording-description">
                    <label>Description:</label>
                    <p>{selectedRecording.metadata.description}</p>
                  </div>
                )}
              </div>

              <div class="recording-files">
                <h4>Recording Files</h4>
                <div class="files-list">
                  {selectedRecording.files.map((file) => (
                    <div key={file.id} class="file-item">
                      <div class="file-info">
                        <div class="file-name">{file.fileName}</div>
                        <div class="file-meta">
                          <span class="file-participant">
                            {file.participantName}
                          </span>
                          <span class="file-size">
                            {formatFileSize(file.fileSize)}
                          </span>
                          <span class="file-format">{file.format.toUpperCase()}</span>
                        </div>
                      </div>
                      <div class="file-actions">
                        <a
                          href={file.downloadUrl}
                          download={file.fileName}
                          class="download-btn"
                          aria-label={`Download ${file.fileName}`}
                        >
                          ⬇️
                        </a>
                        {canDeleteRecording(selectedRecording) && (
                          <button
                            type="button"
                            class="delete-file-btn"
                            aria-label={`Delete ${file.fileName}`}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}