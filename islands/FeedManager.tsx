// Feed manager island for interactive feed functionality
import { signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import { FeedList, type FeedItem } from "../components/FeedList.tsx";
import { UploadDialog, type UploadFormData } from "../components/UploadDialog.tsx";
import { ErrorDialog } from "../components/ErrorDialog.tsx";
import { getCopy } from "../lib/copy.ts";

export interface FeedManagerProps {
  userId: string;
  isHost: boolean;
  isAdmin: boolean;
  initialFeedItems?: FeedItem[];
  rssUrl: string;
}

// Signals for feed state
const feedItems = signal<FeedItem[]>([]);
const filteredFeedItems = signal<FeedItem[]>([]);
const searchQuery = signal("");
const sortBy = signal<"title" | "date">("date");
const sortOrder = signal<"asc" | "desc">("desc");
const currentPage = signal(1);
const isLoading = signal(false);
const error = signal<string | null>(null);

const ITEMS_PER_PAGE = 10;

export default function FeedManager({
  userId,
  isHost,
  isAdmin,
  initialFeedItems = [],
  rssUrl,
}: FeedManagerProps) {
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Initialize feed items
  useEffect(() => {
    feedItems.value = initialFeedItems;
    applyFiltersAndSort();
  }, [initialFeedItems]);

  // Apply filters and sorting whenever dependencies change
  useEffect(() => {
    applyFiltersAndSort();
  }, [searchQuery.value, sortBy.value, sortOrder.value]);

  const applyFiltersAndSort = () => {
    let filtered = [...feedItems.value];

    // Apply search filter
    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query) ||
          item.metadata.artist?.toLowerCase().includes(query) ||
          item.metadata.album?.toLowerCase().includes(query) ||
          item.uploader.name.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;

      if (sortBy.value === "title") {
        comparison = a.title.localeCompare(b.title);
      } else if (sortBy.value === "date") {
        comparison = new Date(a.uploadDate).getTime() - new Date(b.uploadDate).getTime();
      }

      return sortOrder.value === "desc" ? -comparison : comparison;
    });

    filteredFeedItems.value = filtered;
    
    // Reset to first page if current page is out of bounds
    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    if (currentPage.value > totalPages && totalPages > 0) {
      currentPage.value = 1;
    }
  };

  const getPaginatedFeedItems = (): FeedItem[] => {
    const startIndex = (currentPage.value - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredFeedItems.value.slice(startIndex, endIndex);
  };

  const getTotalPages = (): number => {
    return Math.ceil(filteredFeedItems.value.length / ITEMS_PER_PAGE);
  };

  const handleSearch = (query: string) => {
    searchQuery.value = query;
    currentPage.value = 1; // Reset to first page on search
  };

  const handleSort = (field: "title" | "date", order: "asc" | "desc") => {
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

  const handleUpload = () => {
    setShowUploadDialog(true);
  };

  const handleUploadSubmit = async (formData: UploadFormData) => {
    if (!formData.file) return;

    setIsUploading(true);
    error.value = null;

    try {
      // TODO: Implement actual file upload API
      const uploadFormData = new FormData();
      uploadFormData.append("file", formData.file);
      uploadFormData.append("title", formData.title);
      uploadFormData.append("description", formData.description);
      
      if (formData.artist) uploadFormData.append("artist", formData.artist);
      if (formData.album) uploadFormData.append("album", formData.album);
      if (formData.genre) uploadFormData.append("genre", formData.genre);
      if (formData.year) uploadFormData.append("year", formData.year.toString());

      const response = await fetch("/api/feed/upload", {
        method: "POST",
        body: uploadFormData,
      });

      if (!response.ok) {
        throw new Error(getCopy("errors.fileUploadError"));
      }

      const newItem = await response.json();
      
      // Add to local state
      feedItems.value = [newItem, ...feedItems.value];
      
      console.log("Episode uploaded successfully:", newItem.id);
      
      // Close dialog
      setShowUploadDialog(false);
    } catch (err) {
      console.error("Failed to upload episode:", err);
      error.value = getCopy("errors.fileUploadError");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteItem = (itemId: string) => {
    setItemToDelete(itemId);
    setShowDeleteDialog(true);
  };

  const confirmDeleteItem = async () => {
    if (!itemToDelete) return;

    isLoading.value = true;
    error.value = null;

    try {
      // TODO: Implement actual API call to delete feed item
      const response = await fetch(`/api/feed/${itemToDelete}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(getCopy("errors.generic"));
      }

      // Remove from local state
      feedItems.value = feedItems.value.filter(
        (item) => item.id !== itemToDelete
      );

      console.log("Episode deleted successfully:", itemToDelete);
    } catch (err) {
      console.error("Failed to delete episode:", err);
      error.value = getCopy("errors.generic");
    } finally {
      isLoading.value = false;
      setShowDeleteDialog(false);
      setItemToDelete(null);
    }
  };

  const loadFeedItems = async () => {
    isLoading.value = true;
    error.value = null;

    try {
      // TODO: Implement actual API call to fetch feed items
      const response = await fetch("/api/feed", {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(getCopy("errors.generic"));
      }

      const data = await response.json();
      feedItems.value = data.items || [];
    } catch (err) {
      console.error("Failed to load feed items:", err);
      error.value = getCopy("errors.generic");
    } finally {
      isLoading.value = false;
    }
  };

  // Load feed items on mount if no initial data
  useEffect(() => {
    if (initialFeedItems.length === 0) {
      loadFeedItems();
    }
  }, []);

  return (
    <div class="feed-manager">
      <FeedList
        feedItems={getPaginatedFeedItems()}
        searchQuery={searchQuery.value}
        sortBy={sortBy.value}
        sortOrder={sortOrder.value}
        currentPage={currentPage.value}
        totalPages={getTotalPages()}
        onSearch={handleSearch}
        onSort={handleSort}
        onPageChange={handlePageChange}
        onDeleteItem={handleDeleteItem}
        onUpload={handleUpload}
        isHost={isHost}
        isAdmin={isAdmin}
        rssUrl={rssUrl}
      />

      {/* Upload Dialog */}
      <UploadDialog
        isOpen={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        onUpload={handleUploadSubmit}
        isUploading={isUploading}
      />

      {/* Loading Overlay */}
      {isLoading.value && (
        <div class="loading-overlay">
          <div class="loading-content">
            <div class="loading-spinner"></div>
            <p>{getCopy("dialogs.loadingEpisodes")}</p>
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
            <h3>{getCopy("feed.deleteEpisode")}</h3>
          </div>
          <div class="delete-body">
            <p>
              {getCopy("feed.deleteEpisodeConfirm")}
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
              onClick={confirmDeleteItem}
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