/**
 * Drizzle Recording Repository Implementation
 * 
 * Implements RecordingRepository interface using Drizzle ORM
 * for PostgreSQL database operations.
 */

import { eq, and, isNull, count, desc, asc, gte, lt, inArray } from 'drizzle-orm';
import { Database, recordings, recordingFiles } from '../../../database/connection.ts';
import { RecordingRepository } from '../../domain/repositories/recording-repository.ts';
import { Recording, CreateRecordingData, UpdateRecordingData, RecordingFile, CreateRecordingFileData } from '../../domain/entities/recording.ts';
import { RecordingStatus, Result, PaginatedResult, PaginationParams, Ok, Err } from '../../domain/types/common.ts';
import { ValidationError, EntityNotFoundError, ConflictError } from '../../domain/errors/index.ts';

/**
 * Drizzle implementation of RecordingRepository
 */
export class DrizzleRecordingRepository implements RecordingRepository {
  constructor(private db: Database) {}

  /**
   * Find recording by ID
   */
  async findById(id: string): Promise<Result<Recording | null>> {
    try {
      const result = await this.db
        .select()
        .from(recordings)
        .where(and(eq(recordings.id, id), isNull(recordings.deletedAt)))
        .limit(1);

      const recording = result[0] ? this.mapToEntity(result[0]) : null;
      return Ok(recording);
    } catch (error) {
      return Err(new Error(`Failed to find recording by ID: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find recording by folder name
   */
  async findByFolderName(folderName: string): Promise<Result<Recording | null>> {
    try {
      const result = await this.db
        .select()
        .from(recordings)
        .where(and(eq(recordings.folderName, folderName), isNull(recordings.deletedAt)))
        .limit(1);

      const recording = result[0] ? this.mapToEntity(result[0]) : null;
      return Ok(recording);
    } catch (error) {
      return Err(new Error(`Failed to find recording by folder name: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find recordings by room ID with pagination
   */
  async findByRoomId(roomId: string, params?: PaginationParams): Promise<Result<PaginatedResult<Recording>>> {
    try {
      const { page = 1, limit = 10, sortBy = 'startedAt', sortOrder = 'desc' } = params || {};
      const offset = (page - 1) * limit;

      // Build sort condition
      const sortColumn = recordings[sortBy as keyof typeof recordings] || recordings.startedAt;
      const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

      // Get total count
      const totalResult = await this.db
        .select({ count: count() })
        .from(recordings)
        .where(and(eq(recordings.roomId, roomId), isNull(recordings.deletedAt)));

      const total = totalResult[0]?.count || 0;

      // Get paginated results
      const result = await this.db
        .select()
        .from(recordings)
        .where(and(eq(recordings.roomId, roomId), isNull(recordings.deletedAt)))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      const items = result.map(row => this.mapToEntity(row));
      const totalPages = Math.ceil(total / limit);

      return Ok({
        items,
        total,
        page,
        limit,
        totalPages
      });
    } catch (error) {
      return Err(new Error(`Failed to find recordings by room ID: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find recordings by status with pagination
   */
  async findByStatus(status: RecordingStatus, params?: PaginationParams): Promise<Result<PaginatedResult<Recording>>> {
    try {
      const { page = 1, limit = 10, sortBy = 'startedAt', sortOrder = 'desc' } = params || {};
      const offset = (page - 1) * limit;

      // Build sort condition
      const sortColumn = recordings[sortBy as keyof typeof recordings] || recordings.startedAt;
      const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

      // Get total count
      const totalResult = await this.db
        .select({ count: count() })
        .from(recordings)
        .where(and(eq(recordings.status, status), isNull(recordings.deletedAt)));

      const total = totalResult[0]?.count || 0;

      // Get paginated results
      const result = await this.db
        .select()
        .from(recordings)
        .where(and(eq(recordings.status, status), isNull(recordings.deletedAt)))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      const items = result.map(row => this.mapToEntity(row));
      const totalPages = Math.ceil(total / limit);

      return Ok({
        items,
        total,
        page,
        limit,
        totalPages
      });
    } catch (error) {
      return Err(new Error(`Failed to find recordings by status: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find recordings by creator with pagination
   */
  async findByCreator(createdBy: string, params?: PaginationParams): Promise<Result<PaginatedResult<Recording>>> {
    try {
      const { page = 1, limit = 10, sortBy = 'startedAt', sortOrder = 'desc' } = params || {};
      const offset = (page - 1) * limit;

      // Build sort condition
      const sortColumn = recordings[sortBy as keyof typeof recordings] || recordings.startedAt;
      const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

      // Get total count
      const totalResult = await this.db
        .select({ count: count() })
        .from(recordings)
        .where(and(eq(recordings.createdBy, createdBy), isNull(recordings.deletedAt)));

      const total = totalResult[0]?.count || 0;

      // Get paginated results
      const result = await this.db
        .select()
        .from(recordings)
        .where(and(eq(recordings.createdBy, createdBy), isNull(recordings.deletedAt)))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      const items = result.map(row => this.mapToEntity(row));
      const totalPages = Math.ceil(total / limit);

      return Ok({
        items,
        total,
        page,
        limit,
        totalPages
      });
    } catch (error) {
      return Err(new Error(`Failed to find recordings by creator: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find active recordings (currently recording or processing)
   */
  async findActiveRecordings(): Promise<Result<Recording[]>> {
    try {
      const activeStatuses = ['recording', 'uploading', 'processing'];
      const result = await this.db
        .select()
        .from(recordings)
        .where(and(
          inArray(recordings.status, activeStatuses),
          isNull(recordings.deletedAt)
        ))
        .orderBy(desc(recordings.startedAt));

      const recordingList = result.map(row => this.mapToEntity(row));
      return Ok(recordingList);
    } catch (error) {
      return Err(new Error(`Failed to find active recordings: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Create a new recording
   */
  async create(data: CreateRecordingData): Promise<Result<Recording>> {
    try {
      // Check if folder name already exists
      const folderExistsResult = await this.folderNameExists(data.folderName);
      if (!folderExistsResult.success) {
        return Err(folderExistsResult.error);
      }
      if (folderExistsResult.data) {
        return Err(new ConflictError('Folder name already exists', 'folderName'));
      }

      const now = new Date();
      const result = await this.db
        .insert(recordings)
        .values({
          roomId: data.roomId,
          folderName: data.folderName,
          participantCount: data.participantCount ?? 0,
          status: 'recording',
          startedAt: data.startedAt ?? now,
          createdBy: data.createdBy,
          createdAt: now,
          updatedAt: now
        })
        .returning();

      if (!result[0]) {
        return Err(new Error('Failed to create recording'));
      }

      return Ok(this.mapToEntity(result[0]));
    } catch (error) {
      return Err(new Error(`Failed to create recording: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Update an existing recording
   */
  async update(id: string, data: UpdateRecordingData): Promise<Result<Recording>> {
    try {
      // Check if recording exists
      const existingResult = await this.findById(id);
      if (!existingResult.success) {
        return Err(existingResult.error);
      }
      if (!existingResult.data) {
        return Err(new NotFoundError('Recording not found'));
      }

      const updateData: any = {
        updatedAt: new Date()
      };

      // Only include fields that are provided
      if (data.durationSeconds !== undefined) updateData.durationSeconds = data.durationSeconds;
      if (data.totalSizeBytes !== undefined) updateData.totalSizeBytes = data.totalSizeBytes;
      if (data.participantCount !== undefined) updateData.participantCount = data.participantCount;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.stoppedAt !== undefined) updateData.stoppedAt = data.stoppedAt;
      if (data.completedAt !== undefined) updateData.completedAt = data.completedAt;

      const result = await this.db
        .update(recordings)
        .set(updateData)
        .where(and(eq(recordings.id, id), isNull(recordings.deletedAt)))
        .returning();

      if (!result[0]) {
        return Err(new NotFoundError('Recording not found'));
      }

      return Ok(this.mapToEntity(result[0]));
    } catch (error) {
      return Err(new Error(`Failed to update recording: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Soft delete a recording
   */
  async delete(id: string): Promise<Result<void>> {
    try {
      const result = await this.db
        .update(recordings)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date()
        })
        .where(and(eq(recordings.id, id), isNull(recordings.deletedAt)))
        .returning({ id: recordings.id });

      if (!result[0]) {
        return Err(new NotFoundError('Recording not found'));
      }

      return Ok(undefined);
    } catch (error) {
      return Err(new Error(`Failed to delete recording: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Check if folder name exists (for uniqueness validation)
   */
  async folderNameExists(folderName: string, excludeId?: string): Promise<Result<boolean>> {
    try {
      const conditions = [
        eq(recordings.folderName, folderName),
        isNull(recordings.deletedAt)
      ];

      let query = this.db
        .select({ id: recordings.id })
        .from(recordings)
        .where(and(...conditions));

      if (excludeId) {
        query = query.where(and(...conditions, eq(recordings.id, excludeId)));
      }

      const result = await query.limit(1);
      return Ok(result.length > 0);
    } catch (error) {
      return Err(new Error(`Failed to check folder name existence: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Count recordings by status
   */
  async countByStatus(status: RecordingStatus): Promise<Result<number>> {
    try {
      const result = await this.db
        .select({ count: count() })
        .from(recordings)
        .where(and(eq(recordings.status, status), isNull(recordings.deletedAt)));

      return Ok(result[0]?.count || 0);
    } catch (error) {
      return Err(new Error(`Failed to count recordings by status: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find recordings that need cleanup (completed/failed for more than X days)
   */
  async findForCleanup(daysOld: number): Promise<Result<Recording[]>> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const cleanupStatuses = ['completed', 'failed'];
      const result = await this.db
        .select()
        .from(recordings)
        .where(and(
          inArray(recordings.status, cleanupStatuses),
          lt(recordings.completedAt, cutoffDate),
          isNull(recordings.deletedAt)
        ))
        .orderBy(asc(recordings.completedAt));

      const recordingList = result.map(row => this.mapToEntity(row));
      return Ok(recordingList);
    } catch (error) {
      return Err(new Error(`Failed to find recordings for cleanup: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Get recording files for a recording
   */
  async getRecordingFiles(recordingId: string): Promise<Result<RecordingFile[]>> {
    try {
      const result = await this.db
        .select()
        .from(recordingFiles)
        .where(and(eq(recordingFiles.recordingId, recordingId), isNull(recordingFiles.deletedAt)))
        .orderBy(asc(recordingFiles.uploadedAt));

      const files = result.map(row => this.mapToFileEntity(row));
      return Ok(files);
    } catch (error) {
      return Err(new Error(`Failed to get recording files: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Add recording file
   */
  async addRecordingFile(data: CreateRecordingFileData): Promise<Result<RecordingFile>> {
    try {
      const now = new Date();
      const result = await this.db
        .insert(recordingFiles)
        .values({
          recordingId: data.recordingId,
          fileName: data.fileName,
          filePath: data.filePath,
          mimeType: data.mimeType ?? 'audio/webm',
          participantId: data.participantId,
          participantName: data.participantName,
          participantType: data.participantType,
          sizeBytes: data.sizeBytes,
          durationSeconds: data.durationSeconds,
          checksumSha256: data.checksumSha256,
          uploadedAt: now,
          createdAt: now
        })
        .returning();

      if (!result[0]) {
        return Err(new Error('Failed to add recording file'));
      }

      return Ok(this.mapToFileEntity(result[0]));
    } catch (error) {
      return Err(new Error(`Failed to add recording file: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Delete recording file
   */
  async deleteRecordingFile(fileId: string): Promise<Result<void>> {
    try {
      const result = await this.db
        .update(recordingFiles)
        .set({
          deletedAt: new Date()
        })
        .where(and(eq(recordingFiles.id, fileId), isNull(recordingFiles.deletedAt)))
        .returning({ id: recordingFiles.id });

      if (!result[0]) {
        return Err(new NotFoundError('Recording file not found'));
      }

      return Ok(undefined);
    } catch (error) {
      return Err(new Error(`Failed to delete recording file: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Map database row to domain entity
   */
  private mapToEntity(row: any): Recording {
    return {
      id: row.id,
      roomId: row.roomId,
      folderName: row.folderName,
      durationSeconds: row.durationSeconds,
      totalSizeBytes: row.totalSizeBytes,
      participantCount: row.participantCount,
      status: row.status as RecordingStatus,
      startedAt: row.startedAt,
      stoppedAt: row.stoppedAt,
      completedAt: row.completedAt,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  /**
   * Map database row to file entity
   */
  private mapToFileEntity(row: any): RecordingFile {
    return {
      id: row.id,
      recordingId: row.recordingId,
      fileName: row.fileName,
      filePath: row.filePath,
      mimeType: row.mimeType,
      participantId: row.participantId,
      participantName: row.participantName,
      participantType: row.participantType,
      sizeBytes: row.sizeBytes,
      durationSeconds: row.durationSeconds,
      checksumSha256: row.checksumSha256,
      uploadedAt: row.uploadedAt,
      createdAt: row.createdAt
    };
  }
}