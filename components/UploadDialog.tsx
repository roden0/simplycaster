// Upload dialog component for adding new podcast episodes
import { useEffect, useRef, useState } from "preact/hooks";
import { getCopy } from "../lib/copy.ts";

export interface UploadFormData {
  file: File | null;
  title: string;
  description: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: number;
}

export interface UploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (formData: UploadFormData) => Promise<void>;
  isUploading: boolean;
}

export function UploadDialog({
  isOpen,
  onClose,
  onUpload,
  isUploading,
}: UploadDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState<UploadFormData>({
    file: null,
    title: "",
    description: "",
    artist: "",
    album: "",
    genre: "",
    year: undefined,
  });
  
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      dialog.showModal();
    } else {
      dialog.close();
      // Reset form when dialog closes
      setFormData({
        file: null,
        title: "",
        description: "",
        artist: "",
        album: "",
        genre: "",
        year: undefined,
      });
      setFileError(null);
    }
  }, [isOpen]);

  const validateFile = (file: File): string | null => {
    const allowedTypes = ["audio/mpeg", "audio/ogg", "audio/webm"];
    const maxSize = 100 * 1024 * 1024; // 100MB

    if (!allowedTypes.includes(file.type)) {
      return "Please upload an MP3, OGG, or WebM audio file.";
    }

    if (file.size > maxSize) {
      return "File size must be less than 100MB.";
    }

    return null;
  };

  const handleFileSelect = (file: File) => {
    const error = validateFile(file);
    if (error) {
      setFileError(error);
      return;
    }

    setFileError(null);
    setFormData(prev => ({
      ...prev,
      file,
      title: prev.title || file.name.replace(/\.[^/.]+$/, ""), // Use filename as default title
    }));
  };

  const handleFileInput = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    
    if (!formData.file || !formData.title.trim()) {
      return;
    }

    try {
      await onUpload(formData);
      onClose();
    } catch (error) {
      console.error("Upload failed:", error);
    }
  };

  const handleClose = (event: Event) => {
    const dialog = event.target as HTMLDialogElement;
    if (event.type === "close" || dialog === event.target) {
      onClose();
    }
  };

  return (
    <dialog ref={dialogRef} class="upload-dialog" onClose={handleClose}>
      <div class="upload-content">
        <div class="upload-header">
          <h3>{getCopy("feed.uploadDialog.title")}</h3>
          <button
            type="button"
            onClick={onClose}
            class="dialog-close-btn"
            aria-label="Close dialog"
            disabled={isUploading}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} class="upload-form">
          <div class="upload-body">
            {/* File Upload Area */}
            <div class="file-upload-section">
              <div
                class={`file-drop-zone ${dragOver ? "drag-over" : ""} ${
                  formData.file ? "has-file" : ""
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/mpeg,audio/ogg,audio/webm,.mp3,.ogg,.webm"
                  onChange={handleFileInput}
                  class="file-input"
                  disabled={isUploading}
                />
                
                {formData.file ? (
                  <div class="file-selected">
                    <div class="file-icon">🎵</div>
                    <div class="file-info">
                      <div class="file-name">{formData.file.name}</div>
                      <div class="file-size">
                        {(formData.file.size / (1024 * 1024)).toFixed(1)} MB
                      </div>
                    </div>
                  </div>
                ) : (
                  <div class="file-prompt">
                    <div class="upload-icon">⬆️</div>
                    <p>
                      <strong>Click to upload</strong> or drag and drop
                    </p>
                    <p class="file-types">MP3, OGG, or WebM (max 100MB)</p>
                  </div>
                )}
              </div>
              
              {fileError && (
                <div class="file-error">{fileError}</div>
              )}
            </div>

            {/* Episode Information */}
            <div class="episode-info-section">
              <div class="form-group">
                <label for="episode-title" class="form-label">
                  Title *
                </label>
                <input
                  id="episode-title"
                  type="text"
                  value={formData.title}
                  onInput={(e) =>
                    setFormData(prev => ({
                      ...prev,
                      title: (e.target as HTMLInputElement).value,
                    }))
                  }
                  class="form-input"
                  placeholder="Episode title"
                  required
                  disabled={isUploading}
                />
              </div>

              <div class="form-group">
                <label for="episode-description" class="form-label">
                  Description
                </label>
                <textarea
                  id="episode-description"
                  value={formData.description}
                  onInput={(e) =>
                    setFormData(prev => ({
                      ...prev,
                      description: (e.target as HTMLTextAreaElement).value,
                    }))
                  }
                  class="form-textarea"
                  placeholder="Episode description"
                  rows={3}
                  disabled={isUploading}
                />
              </div>

              {/* Metadata Fields */}
              <div class="metadata-section">
                <h4>Metadata (Optional)</h4>
                
                <div class="form-row">
                  <div class="form-group">
                    <label for="episode-artist" class="form-label">
                      Artist
                    </label>
                    <input
                      id="episode-artist"
                      type="text"
                      value={formData.artist || ""}
                      onInput={(e) =>
                        setFormData(prev => ({
                          ...prev,
                          artist: (e.target as HTMLInputElement).value,
                        }))
                      }
                      class="form-input"
                      placeholder="Artist name"
                      disabled={isUploading}
                    />
                  </div>

                  <div class="form-group">
                    <label for="episode-album" class="form-label">
                      Album
                    </label>
                    <input
                      id="episode-album"
                      type="text"
                      value={formData.album || ""}
                      onInput={(e) =>
                        setFormData(prev => ({
                          ...prev,
                          album: (e.target as HTMLInputElement).value,
                        }))
                      }
                      class="form-input"
                      placeholder="Album name"
                      disabled={isUploading}
                    />
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label for="episode-genre" class="form-label">
                      Genre
                    </label>
                    <input
                      id="episode-genre"
                      type="text"
                      value={formData.genre || ""}
                      onInput={(e) =>
                        setFormData(prev => ({
                          ...prev,
                          genre: (e.target as HTMLInputElement).value,
                        }))
                      }
                      class="form-input"
                      placeholder="Genre"
                      disabled={isUploading}
                    />
                  </div>

                  <div class="form-group">
                    <label for="episode-year" class="form-label">
                      Year
                    </label>
                    <input
                      id="episode-year"
                      type="number"
                      value={formData.year || ""}
                      onInput={(e) =>
                        setFormData(prev => ({
                          ...prev,
                          year: parseInt((e.target as HTMLInputElement).value) || undefined,
                        }))
                      }
                      class="form-input"
                      placeholder="2024"
                      min="1900"
                      max="2100"
                      disabled={isUploading}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="upload-actions">
            <button
              type="button"
              onClick={onClose}
              class="cancel-btn"
              disabled={isUploading}
            >
              {getCopy("common.cancel")}
            </button>
            <button
              type="submit"
              class="upload-submit-btn"
              disabled={!formData.file || !formData.title.trim() || isUploading}
            >
              {isUploading ? getCopy("feed.uploadDialog.uploading") : getCopy("feed.uploadDialog.uploadEpisode")}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}