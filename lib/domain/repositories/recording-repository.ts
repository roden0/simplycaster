// ============================================================================
// Recording Repository Interface
// ============================================================================

import { Recording, RecordingFile, CreateRecordingData, UpdateRecordingData, CreateRecordingFileData } from '../entities/recording.ts';
import { RecordingStatus, Result, PaginatedResult, PaginationParams } from '../types/common.ts';

/**
 * Recording repository interface for data access abstraction
 */
export interface RecordingRepository {
  /**
   * Find recording by ID
   */
  findById(id: string): Promise<Result<Recording | null>>;

  /**
   * Find recording by folder name
   */
  findByFolderName(folderName: string): Promise<Result<Recording | null>>;

  /**
   * Find recordings by room ID with pagination
   */
  findByRoomId(roomId: string, params?: PaginationParams): Promise<Result<PaginatedResult<Recording>>>;

  /**
   * Find recordings by creator with pagination
   */
  findByCreator(createdBy: string, params?: PaginationParams): Promise<Result<PaginatedResult<Recording>>>;

  /**
   * Find recordings by status with pagination
   */
  findByStatus(status: RecordingStatus, params?: PaginationParams): Promise<Result<PaginatedResult<Recording>>>;

  /**
   * Create a new recording
   */
  create(data: CreateRecordingData): Promise<Result<Recording>>;

  /**
   * Update an existing recording
   */
  update(id: string, data: UpdateRecordingData): Promise<Result<Recording>>;

  /**
   * Soft delete a recording
   */
  delete(id: string): Promise<Result<void>>;

  /**
   * Check if folder name exists (for uniqueness validation)
   */
  folderNameExists(folderName: string, excludeId?: string): Promise<Result<boolean>>;

  /**
   * Count recordings by creator
   */
  countByCreator(createdBy: string): Promise<Result<number>>;

  /**
   * Count recordings by status
   */
  countByStatus(status: RecordingStatus): Promise<Result<number>>;

  /**
   * Find recordings that need cleanup (old failed recordings)
   */
  findForCleanup(daysOld: number): Promise<Result<Recording[]>>;
}

/**
 * Recording file repository interface for data access abstraction
 */
export interface RecordingFileRepository {
  /**
   * Find recording file by ID
   */
  findById(id: string): Promise<Result<RecordingFile | null>>;

  /**
   * Find files by recording ID
   */
  findByRecordingId(recordingId: string): Promise<Result<RecordingFile[]>>;

  /**
   * Find files by participant
   */
  findByParticipant(participantId: string, participantType: 'guest' | 'host'): Promise<Result<RecordingFile[]>>;

  /**
   * Create a new recording file
   */
  create(data: CreateRecordingFileData): Promise<Result<RecordingFile>>;

  /**
   * Update an existing recording file
   */
  update(id: string, data: Partial<CreateRecordingFileData>): Promise<Result<RecordingFile>>;

  /**
   * Soft delete a recording file
   */
  delete(id: string): Promise<Result<void>>;

  /**
   * Check if file path exists for recording (for uniqueness validation)
   */
  filePathExists(recordingId: string, filePath: string, excludeId?: string): Promise<Result<boolean>>;

  /**
   * Calculate total size for recording
   */
  calculateTotalSize(recordingId: string): Promise<Result<number>>;

  /**
   * Find files that need cleanup (orphaned files)
   */
  findOrphanedFiles(): Promise<Result<RecordingFile[]>>;
}