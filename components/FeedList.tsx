// Feed list component for displaying uploaded podcast files
import { getCopy } from "../lib/copy.ts";

export interface FeedItem {
  id: string;
  fileName: string;
  title: string;
  description?: string;
  uploadDate: string;
  fileSize: number; // in bytes
  duration: number; // in seconds
  format: string; // mp3, ogg, webm
  downloadUrl: string;
  feedUrl: string;
  metadata: {
    artist?: string;
    album?: string;
    genre?: string;
    year?: number;
    trackNumber?: number;
    coverArt?: string;
  };
  uploader: {
    id: string;
    name: string;
    role: "admin" | "host";
  };
}

export interface FeedListProps {
  feedItems: FeedItem[];
  searchQuery: string;
  sortBy: "title" | "date";
  sortOrder: "asc" | "desc";
  currentPage: number;
  totalPages: number;
  onSearch: (query: string) => void;
  onSort: (sortBy: "title" | "date", order: "asc" | "desc") => void;
  onPageChange: (page: number) => void;
  onDeleteItem: (itemId: string) => void;
  onUpload: () => void;
  isHost: boolean;
  isAdmin: boolean;
  rssUrl: string;
}

export function FeedList({
  feedItems,
  searchQuery,
  sortBy,
  sortOrder,
  currentPage,
  totalPages,
  onSearch,
  onSort,
  onPageChange,
  onDeleteItem,
  onUpload,
  isHost,
  isAdmin,
  rssUrl,
}: FeedListProps) {
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

  const canDeleteItem = (item: FeedItem): boolean => {
    return isAdmin || (isHost && item.uploader.role === "host");
  };

  const copyRssUrl = async () => {
    try {
      await globalThis.navigator.clipboard.writeText(rssUrl);
      // TODO: Show success notification
      console.log("RSS URL copied to clipboard");
    } catch (err) {
      console.error("Failed to copy RSS URL:", err);
    }
  };

  return (
    <div class="feed-container">
      {/* Feed Header */}
      <div class="feed-header">
        <div class="feed-title">
          <h1>Podcast Feed</h1>
          <p class="feed-subtitle">
            Manage your podcast episodes and RSS feed
          </p>
        </div>

        <div class="feed-actions">
          <div class="rss-info">
            <label class="rss-label">RSS Feed URL:</label>
            <div class="rss-url-container">
              <input
                type="text"
                value={rssUrl}
                readonly
                class="rss-url-input"
                aria-label="RSS feed URL"
              />
              <button
                type="button"
                onClick={copyRssUrl}
                class="copy-rss-btn"
                aria-label="Copy RSS URL"
              >
                📋 Copy
              </button>
            </div>
          </div>

          {(isHost || isAdmin) && (
            <button
              type="button"
              onClick={onUpload}
              class="upload-btn"
              aria-label="Upload new episode"
            >
              ⬆️ {getCopy("feed.uploadEpisode")}
            </button>
          )}
        </div>
      </div>

      {/* Search and Controls */}
      <div class="feed-controls">
        <div class="search-container">
          <input
            type="text"
            placeholder="Search episodes..."
            value={searchQuery}
            onInput={(e) => onSearch((e.target as HTMLInputElement).value)}
            class="search-input"
            aria-label="Search episodes"
          />
          <span class="search-icon">🔍</span>
        </div>

        <div class="sort-controls">
          <label class="sort-label">Sort by:</label>
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = (e.target as HTMLSelectElement).value.split("-");
              onSort(field as "title" | "date", order as "asc" | "desc");
            }}
            class="sort-select"
            aria-label="Sort episodes"
          >
            <option value="date-desc">Date (Newest)</option>
            <option value="date-asc">Date (Oldest)</option>
            <option value="title-asc">Title (A-Z)</option>
            <option value="title-desc">Title (Z-A)</option>
          </select>
        </div>
      </div>

      {/* Feed Items List */}
      <div class="feed-items">
        {feedItems.length === 0 ? (
          <div class="empty-state">
            <div class="empty-icon">🎙️</div>
            <h3>No episodes found</h3>
            <p>
              {searchQuery
                ? "Try adjusting your search terms"
                : "Upload your first episode to get started"}
            </p>
            {(isHost || isAdmin) && (
              <button
                type="button"
                onClick={onUpload}
                class="upload-btn-secondary"
              >
                {getCopy("feed.uploadEpisode")}
              </button>
            )}
          </div>
        ) : (
          <>
            {feedItems.map((item) => (
              <div key={item.id} class="feed-item">
                <div class="item-artwork">
                  {item.metadata.coverArt ? (
                    <img
                      src={item.metadata.coverArt}
                      alt={`${item.title} cover art`}
                      class="cover-image"
                    />
                  ) : (
                    <div class="cover-placeholder">
                      🎵
                    </div>
                  )}
                </div>

                <div class="item-info">
                  <div class="item-header">
                    <h3 class="item-title">{item.title}</h3>
                    <div class="item-meta">
                      <span class="item-date">
                        {formatDate(item.uploadDate)}
                      </span>
                      <span class="item-duration">
                        {formatDuration(item.duration)}
                      </span>
                      <span class="item-size">
                        {formatFileSize(item.fileSize)}
                      </span>
                      <span class="item-format">
                        {item.format.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {item.description && (
                    <p class="item-description">{item.description}</p>
                  )}

                  <div class="item-metadata">
                    {item.metadata.artist && (
                      <span class="metadata-tag">
                        Artist: {item.metadata.artist}
                      </span>
                    )}
                    {item.metadata.album && (
                      <span class="metadata-tag">
                        Album: {item.metadata.album}
                      </span>
                    )}
                    {item.metadata.genre && (
                      <span class="metadata-tag">
                        Genre: {item.metadata.genre}
                      </span>
                    )}
                  </div>

                  <div class="item-uploader">
                    <span class="uploader-label">Uploaded by:</span>
                    <span class="uploader-name">{item.uploader.name}</span>
                    <span class={`uploader-role ${item.uploader.role}`}>
                      {item.uploader.role}
                    </span>
                  </div>
                </div>

                <div class="item-actions">
                  <a
                    href={item.downloadUrl}
                    download={item.fileName}
                    class="download-btn"
                    aria-label={`Download ${item.title}`}
                  >
                    ⬇️
                  </a>

                  <a
                    href={item.feedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="feed-link-btn"
                    aria-label={`View ${item.title} in feed`}
                  >
                    🔗
                  </a>

                  {canDeleteItem(item) && (
                    <button
                      type="button"
                      onClick={() => onDeleteItem(item.id)}
                      class="delete-btn"
                      aria-label={`Delete ${item.title}`}
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
    </div>
  );
}