/**
 * Drizzle Recording File Repository Implementation
 * 
 * Implements RecordingFileRepository interface using Drizzle ORM
 * for PostgreSQL database operations on recording files.
 */

import { eq, and, isNull, count, desc, asc, sum } from 'drizzle-orm';
import { Database, recordingFiles } from '../../../database/connection.ts';
import { RecordingFileRepository } from '../../domain/repositories/recording-repository.ts';
import { RecordingFile, CreateRecordingFileData } from '../../domain/entities/recording.ts';
import { Result, Ok, Err } from '../../domain/types/common.ts';
import { ValidationError, EntityNotFoundError, ConflictError } from '../../domain/errors/index.ts';

/**
 * Drizzle implementation of RecordingFileRepository
 */
export class DrizzleRecordingFileRepository implements RecordingFileRepository {
  constructor(private db: Database) {}

  /**
   * Find recording file by ID
   */
  async findById(id: string): Promise<Result<RecordingFile | null>> {
    try {
      const result = await this.db
        .select()
        .from(recordingFiles)
        .where(and(eq(recordingFiles.id, id), isNull(recordingFiles.deletedAt)))
        .limit(1);

      const file = result[0] ? this.mapToEntity(result[0]) : null;
      return Ok(file);
    } catch (error) {
      return Err(new Error(`Failed to find recording file by ID: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find files by recording ID
   */
  async findByRecordingId(recordingId: string): Promise<Result<RecordingFile[]>> {
    try {
      const result = await this.db
        .select()
        .from(recordingFiles)
        .where(and(eq(recordingFiles.recordingId, recordingId), isNull(recordingFiles.deletedAt)))
        .orderBy(asc(recordingFiles.uploadedAt));

      const files = result.map(row => this.mapToEntity(row));
      return Ok(files);
    } catch (error) {
      return Err(new Error(`Failed to find files by recording ID: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find files by participant
   */
  async findByParticipant(participantId: string, participantType: 'guest' | 'host'): Promise<Result<RecordingFile[]>> {
    try {
      const result = await this.db
        .select()
        .from(recordingFiles)
        .where(and(
          eq(recordingFiles.participantId, participantId),
          eq(recordingFiles.participantType, participantType),
          isNull(recordingFiles.deletedAt)
        ))
        .orderBy(desc(recordingFiles.uploadedAt));

      const files = result.map(row => this.mapToEntity(row));
      return Ok(files);
    } catch (error) {
      return Err(new Error(`Failed to find files by participant: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Create a new recording file
   */
  async create(data: CreateRecordingFileData): Promise<Result<RecordingFile>> {
    try {
      // Check if file path already exists for this recording
      const pathExistsResult = await this.filePathExists(data.recordingId, data.filePath);
      if (!pathExistsResult.success) {
        return Err(pathExistsResult.error);
      }
      if (pathExistsResult.data) {
        return Err(new ConflictError('File path already exists for this recording', 'filePath'));
      }

      const now = new Date();
      const result = await this.db
        .insert(recordingFiles)
        .values({
          recordingId: data.recordingId,
          fileName: data.fileName,
          filePath: data.filePath,
          mimeType: data.mimeType || 'audio/webm',
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
        return Err(new Error('Failed to create recording file'));
      }

      return Ok(this.mapToEntity(result[0]));
    } catch (error) {
      return Err(new Error(`Failed to create recording file: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Update an existing recording file
   */
  async update(id: string, data: Partial<CreateRecordingFileData>): Promise<Result<RecordingFile>> {
    try {
      // Check if recording file exists
      const existingResult = await this.findById(id);
      if (!existingResult.success) {
        return Err(existingResult.error);
      }
      if (!existingResult.data) {
        return Err(new EntityNotFoundError('Recording file not found'));
      }

      const updateData: any = {};

      // Only include fields that are provided
      if (data.fileName !== undefined) updateData.fileName = data.fileName;
      if (data.filePath !== undefined) updateData.filePath = data.filePath;
      if (data.mimeType !== undefined) updateData.mimeType = data.mimeType;
      if (data.participantId !== undefined) updateData.participantId = data.participantId;
      if (data.participantName !== undefined) updateData.participantName = data.participantName;
      if (data.participantType !== undefined) updateData.participantType = data.participantType;
      if (data.sizeBytes !== undefined) updateData.sizeBytes = data.sizeBytes;
      if (data.durationSeconds !== undefined) updateData.durationSeconds = data.durationSeconds;
      if (data.checksumSha256 !== undefined) updateData.checksumSha256 = data.checksumSha256;

      const result = await this.db
        .update(recordingFiles)
        .set(updateData)
        .where(and(eq(recordingFiles.id, id), isNull(recordingFiles.deletedAt)))
        .returning();

      if (!result[0]) {
        return Err(new EntityNotFoundError('Recording file not found'));
      }

      return Ok(this.mapToEntity(result[0]));
    } catch (error) {
      return Err(new Error(`Failed to update recording file: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Soft delete a recording file
   */
  async delete(id: string): Promise<Result<void>> {
    try {
      const result = await this.db
        .update(recordingFiles)
        .set({
          deletedAt: new Date()
        })
        .where(and(eq(recordingFiles.id, id), isNull(recordingFiles.deletedAt)))
        .returning({ id: recordingFiles.id });

      if (!result[0]) {
        return Err(new EntityNotFoundError('Recording file not found'));
      }

      return Ok(undefined);
    } catch (error) {
      return Err(new Error(`Failed to delete recording file: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Check if file path exists for recording (for uniqueness validation)
   */
  async filePathExists(recordingId: string, filePath: string, excludeId?: string): Promise<Result<boolean>> {
    try {
      const conditions = [
        eq(recordingFiles.recordingId, recordingId),
        eq(recordingFiles.filePath, filePath),
        isNull(recordingFiles.deletedAt)
      ];

      if (excludeId) {
        conditions.push(eq(recordingFiles.id, excludeId));
      }

      const result = await this.db
        .select({ id: recordingFiles.id })
        .from(recordingFiles)
        .where(and(...conditions))
        .limit(1);

      return Ok(result.length > 0);
    } catch (error) {
      return Err(new Error(`Failed to check file path existence: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Calculate total size for recording
   */
  async calculateTotalSize(recordingId: string): Promise<Result<number>> {
    try {
      const result = await this.db
        .select({ totalSize: sum(recordingFiles.sizeBytes) })
        .from(recordingFiles)
        .where(and(eq(recordingFiles.recordingId, recordingId), isNull(recordingFiles.deletedAt)));

      const totalSize = result[0]?.totalSize || 0;
      return Ok(Number(totalSize));
    } catch (error) {
      return Err(new Error(`Failed to calculate total size: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find files that need cleanup (orphaned files)
   */
  async findOrphanedFiles(): Promise<Result<RecordingFile[]>> {
    try {
      // This would require a more complex query with LEFT JOIN to find files
      // whose recording has been deleted. For now, return empty array.
      // In a real implementation, you'd join with recordings table and find
      // files where recording.deletedAt IS NOT NULL
      
      const result: RecordingFile[] = [];
      return Ok(result);
    } catch (error) {
      return Err(new Error(`Failed to find orphaned files: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Map database row to domain entity
   */
  private mapToEntity(row: any): RecordingFile {
    return {
      id: row.id,
      recordingId: row.recordingId,
      fileName: row.fileName,
      filePath: row.filePath,
      mimeType: row.mimeType,
      participantId: row.participantId,
      participantName: row.participantName,
      participantType: row.participantType as 'guest' | 'host',
      sizeBytes: row.sizeBytes,
      durationSeconds: row.durationSeconds,
      uploadedAt: row.uploadedAt,
      checksumSha256: row.checksumSha256,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    };
  }
}