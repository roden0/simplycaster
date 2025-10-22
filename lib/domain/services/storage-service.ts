// ============================================================================
// Storage Service Interface
// ============================================================================

import { Result } from '../types/common.ts';

/**
 * File metadata interface
 */
export interface FileMetadata {
  fileName: string;
  filePath: string;
  sizeBytes: number;
  mimeType: string;
  checksumSha256?: string;
  createdAt: Date;
}

/**
 * Storage service interface for file operations
 */
export interface StorageService {
  /**
   * Save a recording file to storage
   */
  saveRecordingFile(folderName: string, fileName: string, data: Uint8Array): Promise<Result<FileMetadata>>;

  /**
   * Get a recording file from storage
   */
  getRecordingFile(folderName: string, fileName: string): Promise<Result<Uint8Array>>;

  /**
   * Delete a recording file from storage
   */
  deleteRecordingFile(folderName: string, fileName: string): Promise<Result<void>>;

  /**
   * Create a recording folder
   */
  createRecordingFolder(folderName: string): Promise<Result<string>>;

  /**
   * Delete an entire recording folder
   */
  deleteRecordingFolder(folderName: string): Promise<Result<void>>;

  /**
   * List files in a recording folder
   */
  listRecordingFiles(folderName: string): Promise<Result<FileMetadata[]>>;

  /**
   * Check if recording file exists
   */
  recordingFileExists(folderName: string, fileName: string): Promise<Result<boolean>>;

  /**
   * Get file metadata without reading content
   */
  getFileMetadata(folderName: string, fileName: string): Promise<Result<FileMetadata>>;

  /**
   * Save a feed episode file to storage
   */
  saveFeedFile(fileName: string, data: Uint8Array): Promise<Result<FileMetadata>>;

  /**
   * Get a feed episode file from storage
   */
  getFeedFile(fileName: string): Promise<Result<Uint8Array>>;

  /**
   * Delete a feed episode file from storage
   */
  deleteFeedFile(fileName: string): Promise<Result<void>>;

  /**
   * List all feed files
   */
  listFeedFiles(): Promise<Result<FileMetadata[]>>;

  /**
   * Calculate checksum for file data
   */
  calculateChecksum(data: Uint8Array): Promise<Result<string>>;

  /**
   * Verify file integrity using checksum
   */
  verifyFileIntegrity(folderName: string, fileName: string, expectedChecksum: string): Promise<Result<boolean>>;
}