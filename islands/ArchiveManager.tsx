// Archive manager island for interactive archive functionality
import { signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import { ArchiveList, type Recording } from "../components/ArchiveList.tsx";
import { ErrorDialog } from "../components/ErrorDialog.tsx";
import { getCopy } from "../lib/copy.ts";

export interface ArchiveManagerProps {
  userId: string;
  isHost: boolean;
  isAdmin: boolean;
  initialRecordings?: Recording[];
}

// Signals for archive state
const recordings = signal<Recording[]>([]);
const filteredRecordings = signal<Recording[]>([]);
const searchQuery = signal("");
const sortBy = signal<"name" | "date">("date");
const sortOrder = signal<"asc" | "desc">("desc");
const currentPage = signal(1);
const selectedRecording = signal<Recording | null>(null);
const isLoading = signal(false);
const error = signal<string | null>(null);

const ITEMS_PER_PAGE = 10;

export default function ArchiveManager({
  userId,
  isHost,
  isAdmin,
  initialRecordings = [],
}: ArchiveManagerProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [recordingToDelete, setRecordingToDelete] = useState<string | null>(null);

  // Initialize recordings
  useEffect(() => {
    recordings.value = initialRecordings;
    applyFiltersAndSort();
  }, [initialRecordings]);

  // Apply filters and sorting whenever dependencies change
  useEffect(() => {
    applyFiltersAndSort();
  }, [searchQuery.value, sortBy.value, sortOrder.value]);

  const applyFiltersAndSort = () => {
    let filtered = [...recordings.value];

    // Apply search filter
    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase();
      filtered = filtered.filter(
        (recording) =>
          recording.roomName.toLowerCase().includes(query) ||
          recording.participants.some((p) => p.toLowerCase().includes(query)) ||
          recording.metadata?.hostName?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;

      if (sortBy.value === "name") {
        comparison = a.roomName.localeCompare(b.roomName);
      } else if (sortBy.value === "date") {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      }

      return sortOrder.value === "desc" ? -comparison : comparison;
    });

    filteredRecordings.value = filtered;
    
    // Reset to first page if current page is out of bounds
    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    if (currentPage.value > totalPages && totalPages > 0) {
      currentPage.value = 1;
    }
  };

  const getPaginatedRecordings = (): Recording[] => {
    const startIndex = (currentPage.value - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredRecordings.value.slice(startIndex, endIndex);
  };

  const getTotalPages = (): number => {
    return Math.ceil(filteredRecordings.value.length / ITEMS_PER_PAGE);
  };

  const handleSearch = (query: string) => {
    searchQuery.value = query;
    currentPage.value = 1; // Reset to first page on search
  };

  const handleSort = (field: "name" | "date", order: "asc" | "desc") => {
    sortBy.value = field;
    sortOrder.value = order;
    currentPage.value = 1; // Reset to first page on sort
  };

  const handlePageChange = (page: number) => {
    const totalPages = getTotalPages();
    if (page >= 1 && page <= totalPages) {
      currentPage.value = page;
    }
  };

  const handleSelectRecording = (recording: Recording | null) => {
    selectedRecording.value = recording;
  };

  const handleDeleteRecording = (recordingId: string) => {
    setRecordingToDelete(recordingId);
    setShowDeleteDialog(true);
  };

  const confirmDeleteRecording = async () => {
    if (!recordingToDelete) return;

    isLoading.value = true;
    error.value = null;

    try {
      // TODO: Implement actual API call to delete recording
      const response = await fetch(`/api/recordings/${recordingToDelete}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(getCopy("errors.generic"));
      }

      // Remove from local state
      recordings.value = recordings.value.filter(
        (r) => r.id !== recordingToDelete
      );

      // Close sidebar if deleted recording was selected
      if (selectedRecording.value?.id === recordingToDelete) {
        selectedRecording.value = null;
      }

      console.log("Recording deleted successfully:", recordingToDelete);
    } catch (err) {
      console.error("Failed to delete recording:", err);
      error.value = getCopy("errors.generic");
    } finally {
      isLoading.value = false;
      setShowDeleteDialog(false);
      setRecordingToDelete(null);
    }
  };

  const loadRecordings = async () => {
    isLoading.value = true;
    error.value = null;

    try {
      // TODO: Implement actual API call to fetch recordings
      const response = await fetch("/api/recordings", {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(getCopy("errors.generic"));
      }

      const data = await response.json();
      recordings.value = data.recordings || [];
    } catch (err) {
      console.error("Failed to load recordings:", err);
      error.value = getCopy("errors.generic");
    } finally {
      isLoading.value = false;
    }
  };

  // Load recordings on mount if no initial data
  useEffect(() => {
    if (initialRecordings.length === 0) {
      loadRecordings();
    }
  }, []);

  return (
    <div class="archive-manager">
      <ArchiveList
        recordings={getPaginatedRecordings()}
        searchQuery={searchQuery.value}
        sortBy={sortBy.value}
        sortOrder={sortOrder.value}
        currentPage={currentPage.value}
        totalPages={getTotalPages()}
        selectedRecording={selectedRecording.value}
        onSearch={handleSearch}
        onSort={handleSort}
        onPageChange={handlePageChange}
        onSelectRecording={handleSelectRecording}
        onDeleteRecording={handleDeleteRecording}
        isHost={isHost}
        isAdmin={isAdmin}
      />

      {/* Loading Overlay */}
      {isLoading.value && (
        <div class="loading-overlay">
          <div class="loading-content">
            <div class="loading-spinner"></div>
            <p>{getCopy("dialogs.loadingRecordings")}</p>
          </div>
        </div>
      )}

      {/* Error Dialog */}
      <ErrorDialog
        isOpen={!!error.value}
        message={error.value || ""}
        onClose={() => error.value = null}
      />

      {/* Delete Confirmation Dialog */}
      <dialog
        class="delete-dialog"
        open={showDeleteDialog}
      >
        <div class="delete-content">
          <div class="delete-header">
            <h3>{getCopy("archive.deleteRecording")}</h3>
          </div>
          <div class="delete-body">
            <p>
              {getCopy("archive.deleteRecordingConfirm")}
            </p>
          </div>
          <div class="delete-actions">
            <button
              type="button"
              onClick={() => setShowDeleteDialog(false)}
              class="cancel-btn"
            >
              {getCopy("common.cancel")}
            </button>
            <button
              type="button"
              onClick={confirmDeleteRecording}
              class="confirm-delete-btn"
              disabled={isLoading.value}
            >
              {isLoading.value ? getCopy("dialogs.deleting") : getCopy("common.delete")}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}