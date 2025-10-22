/**
 * Complete Recording Use Case
 * 
 * Handles recording completion with metadata finalization and event publishing.
 */

import { RecordingRepository } from '../../../domain/repositories/recording-repository.ts';
import { Recording, RecordingDomain } from '../../../domain/entities/recording.ts';
import { RecordingStatus, Result, Ok, Err } from '../../../domain/types/common.ts';
import { ValidationError, EntityNotFoundError, BusinessRuleError } from '../../../domain/errors/index.ts';
import { EventPublisher } from '../../../domain/types/events.ts';
import { createBaseEvent, generateCorrelationId } from '../../../domain/services/event-utils.ts';
import { EventType, RecordingEventData } from '../../../domain/types/events.ts';

/**
 * Input data for completing a recording
 */
export interface CompleteRecordingInput {
  recordingId: string;
  totalSizeBytes?: number;
  finalParticipantCount?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Output data from recording completion
 */
export interface CompleteRecordingOutput {
  recording: Recording;
  message: string;
}

/**
 * Complete Recording Use Case implementation
 */
export class CompleteRecordingUseCase {
  constructor(
    private recordingRepository: RecordingRepository,
    private eventPublisher?: EventPublisher
  ) {}

  /**
   * Execute the complete recording use case
   */
  async execute(input: CompleteRecordingInput): Promise<Result<CompleteRecordingOutput>> {
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

      // 3. Calculate final metadata
      const now = new Date();
      const durationSeconds = recording.stoppedAt 
        ? Math.floor((recording.stoppedAt.getTime() - recording.startedAt.getTime()) / 1000)
        : Math.floor((now.getTime() - recording.startedAt.getTime()) / 1000);

      // 4. Update recording to completed status
      const updateData = {
        status: RecordingStatus.COMPLETED,
        completedAt: now,
        durationSeconds: durationSeconds,
        totalSizeBytes: input.totalSizeBytes || recording.totalSizeBytes,
        participantCount: input.finalParticipantCount || recording.participantCount
      };

      const updateResult = await this.recordingRepository.update(input.recordingId, updateData);
      if (!updateResult.success) {
        return Err(updateResult.error);
      }

      // 5. Publish recording completed event
      if (this.eventPublisher) {
        try {
          const correlationId = generateCorrelationId();
          const recordingEventData: RecordingEventData = {
            recordingId: input.recordingId,
            roomId: recording.roomId,
            folderName: recording.folderName,
            participantCount: updateData.participantCount,
            durationSeconds: updateData.durationSeconds,
            totalSizeBytes: updateData.totalSizeBytes
          };

          const recordingCompletedEvent = createBaseEvent(
            EventType.RECORDING_COMPLETED,
            recordingEventData,
            {
              correlationId,
              userId: recording.createdBy,
              priority: 'normal',
              source: 'recording-service'
            }
          );

          await this.eventPublisher.publish(recordingCompletedEvent);
        } catch (error) {
          // Log event publishing error but don't fail the completion
          console.error('Failed to publish recording completed event:', error);
        }
      }

      // 6. Prepare success response
      const output: CompleteRecordingOutput = {
        recording: updateResult.data,
        message: `Recording "${recording.folderName}" completed successfully`
      };

      return Ok(output);

    } catch (error) {
      return Err(new Error(`Failed to complete recording: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Validate input data
   */
  private validateInput(input: CompleteRecordingInput): Result<void> {
    const errors: string[] = [];

    // Recording ID validation
    if (!input.recordingId || input.recordingId.trim().length === 0) {
      errors.push('Recording ID is required');
    }

    // Total size validation (if provided)
    if (input.totalSizeBytes !== undefined && input.totalSizeBytes < 0) {
      errors.push('Total size bytes must be non-negative');
    }

    // Participant count validation (if provided)
    if (input.finalParticipantCount !== undefined && input.finalParticipantCount < 0) {
      errors.push('Final participant count must be non-negative');
    }

    if (errors.length > 0) {
      return Err(new ValidationError(errors.join('; ')));
    }

    return Ok(undefined);
  }

  /**
   * Validate recording exists and can be completed
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

    // Check if recording is in a state that can be completed
    if (recording.status === RecordingStatus.COMPLETED) {
      return Err(new BusinessRuleError('Recording is already completed'));
    }

    if (recording.status === RecordingStatus.FAILED) {
      return Err(new BusinessRuleError('Cannot complete a failed recording'));
    }

    // Recording should be stopped before completion
    if (recording.status === RecordingStatus.RECORDING) {
      return Err(new BusinessRuleError('Recording must be stopped before completion'));
    }

    return Ok(recording);
  }
}