/**
 * Fail Recording Use Case
 * 
 * Handles recording failure with error logging and event publishing.
 */

import { RecordingRepository } from '../../../domain/repositories/recording-repository.ts';
import { Recording } from '../../../domain/entities/recording.ts';
import { RecordingStatus, Result, Ok, Err } from '../../../domain/types/common.ts';
import { ValidationError, EntityNotFoundError, BusinessRuleError } from '../../../domain/errors/index.ts';
import { EventPublisher } from '../../../domain/types/events.ts';
import { createBaseEvent, generateCorrelationId } from '../../../domain/services/event-utils.ts';
import { EventType, RecordingEventData } from '../../../domain/types/events.ts';

/**
 * Input data for failing a recording
 */
export interface FailRecordingInput {
  recordingId: string;
  errorMessage: string;
  errorCode?: string;
  failureReason?: 'storage_error' | 'processing_error' | 'network_error' | 'user_error' | 'system_error';
  metadata?: Record<string, unknown>;
}

/**
 * Output data from recording failure
 */
export interface FailRecordingOutput {
  recording: Recording;
  message: string;
}

/**
 * Fail Recording Use Case implementation
 */
export class FailRecordingUseCase {
  constructor(
    private recordingRepository: RecordingRepository,
    private eventPublisher?: EventPublisher
  ) {}

  /**
   * Execute the fail recording use case
   */
  async execute(input: FailRecordingInput): Promise<Result<FailRecordingOutput>> {
    try {
      // 1. Validate input data
      const validationResult = this.validateInput(input);
      if (!validationResult.success) {
        return Err(validationResult.error);
      }

      // 2. Find and validate recording
      const recordingValidationResult = await this.validateRecording(input.recordingId);
      if (!recordingValidationResult.success) {
        return Err(recordingValidationResult.error);
      }

      const recording = recordingValidationResult.data;

      // 3. Calculate partial duration if recording was in progress
      const now = new Date();
      const durationSeconds = recording.stoppedAt 
        ? Math.floor((recording.stoppedAt.getTime() - recording.startedAt.getTime()) / 1000)
        : Math.floor((now.getTime() - recording.startedAt.getTime()) / 1000);

      // 4. Update recording to failed status
      const updateData = {
        status: RecordingStatus.FAILED,
        stoppedAt: recording.stoppedAt || now,
        durationSeconds: durationSeconds,
        // Store failure information in a metadata field if the recording entity supports it
        // For now, we'll just update the status
      };

      const updateResult = await this.recordingRepository.update(input.recordingId, updateData);
      if (!updateResult.success) {
        return Err(updateResult.error);
      }

      // 5. Publish recording failed event
      if (this.eventPublisher) {
        try {
          const correlationId = generateCorrelationId();
          const recordingEventData: RecordingEventData = {
            recordingId: input.recordingId,
            roomId: recording.roomId,
            folderName: recording.folderName,
            participantCount: recording.participantCount,
            durationSeconds: updateData.durationSeconds,
            totalSizeBytes: recording.totalSizeBytes
          };

          // Add failure information to event metadata
          const eventMetadata = {
            errorMessage: input.errorMessage,
            errorCode: input.errorCode,
            failureReason: input.failureReason || 'system_error',
            ...input.metadata
          };

          const recordingFailedEvent = createBaseEvent(
            EventType.RECORDING_FAILED,
            recordingEventData,
            {
              correlationId,
              userId: recording.createdBy,
              priority: 'high', // High priority for failure events
              source: 'recording-service'
            }
          );

          // Add failure metadata to the event
          recordingFailedEvent.metadata = {
            ...recordingFailedEvent.metadata,
            ...eventMetadata
          };

          await this.eventPublisher.publish(recordingFailedEvent);
        } catch (error) {
          // Log event publishing error but don't fail the failure operation
          console.error('Failed to publish recording failed event:', error);
        }
      }

      // 6. Prepare success response
      const output: FailRecordingOutput = {
        recording: updateResult.data,
        message: `Recording "${recording.folderName}" marked as failed: ${input.errorMessage}`
      };

      return Ok(output);

    } catch (error) {
      return Err(new Error(`Failed to mark recording as failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Validate input data
   */
  private validateInput(input: FailRecordingInput): Result<void> {
    const errors: string[] = [];

    // Recording ID validation
    if (!input.recordingId || input.recordingId.trim().length === 0) {
      errors.push('Recording ID is required');
    }

    // Error message validation
    if (!input.errorMessage || input.errorMessage.trim().length === 0) {
      errors.push('Error message is required');
    }

    // Failure reason validation (if provided)
    if (input.failureReason) {
      const validReasons = ['storage_error', 'processing_error', 'network_error', 'user_error', 'system_error'];
      if (!validReasons.includes(input.failureReason)) {
        errors.push(`Invalid failure reason. Must be one of: ${validReasons.join(', ')}`);
      }
    }

    if (errors.length > 0) {
      return Err(new ValidationError(errors.join('; ')));
    }

    return Ok(undefined);
  }

  /**
   * Validate recording exists and can be failed
   */
  private async validateRecording(recordingId: string): Promise<Result<Recording>> {
    const recordingResult = await this.recordingRepository.findById(recordingId);
    if (!recordingResult.success) {
      return Err(recordingResult.error);
    }

    if (!recordingResult.data) {
      return Err(new EntityNotFoundError('Recording', recordingId));
    }

    const recording = recordingResult.data;

    // Check if recording is already in a final state
    if (recording.status === RecordingStatus.COMPLETED) {
      return Err(new BusinessRuleError('Cannot fail a completed recording'));
    }

    if (recording.status === RecordingStatus.FAILED) {
      return Err(new BusinessRuleError('Recording is already marked as failed'));
    }

    return Ok(recording);
  }
}