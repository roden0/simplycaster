// ============================================================================
// Recording Domain Entity
// ============================================================================

import { BaseEntity, RecordingStatus, SoftDeletableEntity } from '../types/common.ts';
import { ValidationError, InvalidRecordingStatusError } from '../errors/index.ts';

/**
 * Recording domain entity
 */
export interface Recording extends SoftDeletableEntity {
  roomId: string;
  folderName: string;
  durationSeconds?: number;
  totalSizeBytes?: number;
  participantCount: number;
  status: RecordingStatus;
  startedAt: Date;
  stoppedAt?: Date;
  completedAt?: Date;
  createdBy: string;
}

/**
 * Recording file domain entity
 */
export interface RecordingFile extends SoftDeletableEntity {
  recordingId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  participantId?: string;
  participantName: string;
  participantType: 'guest' | 'host';
  sizeBytes: number;
  durationSeconds?: number;
  uploadedAt: Date;
  checksumSha256?: string;
}

/**
 * Data for creating a new recording
 */
export interface CreateRecordingData {
  roomId: string;
  folderName: string;
  participantCount: number;
  startedAt: Date;
  createdBy: string;
}

/**
 * Data for updating a recording
 */
export interface UpdateRecordingData {
  durationSeconds?: number;
  totalSizeBytes?: number;
  participantCount?: number;
  status?: RecordingStatus;
  stoppedAt?: Date;
  completedAt?: Date;
}

/**
 * Data for creating a recording file
 */
export interface CreateRecordingFileData {
  recordingId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  participantId?: string;
  participantName: string;
  participantType: 'guest' | 'host';
  sizeBytes: number;
  durationSeconds?: number;
  checksumSha256?: string;
}

/**
 * Recording domain service functions
 */
export class RecordingDomain {
  /**
   * Validates recording folder name
   */
  static validateFolderName(folderName: string): void {
    if (!folderName || folderName.trim().length === 0) {
      throw new ValidationError('Folder name cannot be empty', 'folderName');
    }
    
    // Check for invalid characters
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(folderName)) {
      throw new ValidationError('Folder name contains invalid characters', 'folderName');
    }
  }

  /**
   * Validates participant count
   */
  static validateParticipantCount(count: number): void {
    if (count < 0) {
      throw new ValidationError('Participant count cannot be negative', 'participantCount');
    }
  }

  /**
   * Validates file size
   */
  static validateFileSize(sizeBytes: number): void {
    if (sizeBytes <= 0) {
      throw new ValidationError('File size must be greater than 0', 'sizeBytes');
    }
  }

  /**
   * Validates participant type
   */
  static validateParticipantType(type: string): void {
    if (type !== 'guest' && type !== 'host') {
      throw new ValidationError('Participant type must be either "guest" or "host"', 'participantType');
    }
  }

  /**
   * Checks if recording can transition to new status
   */
  static canTransitionTo(currentStatus: RecordingStatus, targetStatus: RecordingStatus): boolean {
    const validTransitions: Record<RecordingStatus, RecordingStatus[]> = {
      [RecordingStatus.RECORDING]: [RecordingStatus.UPLOADING, RecordingStatus.FAILED],
      [RecordingStatus.UPLOADING]: [RecordingStatus.PROCESSING, RecordingStatus.FAILED],
      [RecordingStatus.PROCESSING]: [RecordingStatus.COMPLETED, RecordingStatus.FAILED],
      [RecordingStatus.COMPLETED]: [], // No transitions from completed
      [RecordingStatus.FAILED]: [RecordingStatus.UPLOADING] // Can retry from failed
    };

    return validTransitions[currentStatus].includes(targetStatus);
  }

  /**
   * Validates recording status transition
   */
  static validateStatusTransition(currentStatus: RecordingStatus, targetStatus: RecordingStatus): void {
    if (!this.canTransitionTo(currentStatus, targetStatus)) {
      throw new InvalidRecordingStatusError(currentStatus, targetStatus);
    }
  }

  /**
   * Checks if recording is in progress
   */
  static isInProgress(recording: Recording): boolean {
    return recording.status === RecordingStatus.RECORDING;
  }

  /**
   * Checks if recording is completed
   */
  static isCompleted(recording: Recording): boolean {
    return recording.status === RecordingStatus.COMPLETED;
  }

  /**
   * Checks if recording has failed
   */
  static hasFailed(recording: Recording): boolean {
    return recording.status === RecordingStatus.FAILED;
  }

  /**
   * Generates folder name from room name and timestamp
   */
  static generateFolderName(roomName: string, startedAt: Date): string {
    const timestamp = startedAt.toISOString().replace(/[:.]/g, '-');
    const sanitizedRoomName = roomName
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
    
    return `${sanitizedRoomName}_${timestamp}`;
  }

  /**
   * Creates update data for stopping recording
   */
  static stopRecording(): UpdateRecordingData {
    return {
      status: RecordingStatus.UPLOADING,
      stoppedAt: new Date()
    };
  }

  /**
   * Creates update data for completing recording
   */
  static completeRecording(durationSeconds: number, totalSizeBytes: number): UpdateRecordingData {
    return {
      status: RecordingStatus.COMPLETED,
      completedAt: new Date(),
      durationSeconds,
      totalSizeBytes
    };
  }

  /**
   * Creates update data for marking recording as failed
   */
  static failRecording(): UpdateRecordingData {
    return {
      status: RecordingStatus.FAILED
    };
  }

  /**
   * Calculates total duration from recording files
   */
  static calculateTotalDuration(files: RecordingFile[]): number {
    return Math.max(...files.map(f => f.durationSeconds || 0));
  }

  /**
   * Calculates total size from recording files
   */
  static calculateTotalSize(files: RecordingFile[]): number {
    return files.reduce((total, file) => total + file.sizeBytes, 0);
  }
}