/**
 * Stop Recording Use Case
 * 
 * Handles recording stop logic with room state validation,
 * recording finalization, and real-time event broadcasting.
 */

import { RoomRepository } from '../../../domain/repositories/room-repository.ts';
import { RecordingRepository } from '../../../domain/repositories/recording-repository.ts';
import { UserRepository } from '../../../domain/repositories/user-repository.ts';
import { RealtimeService } from '../../../domain/services/realtime-service.ts';
import { Room, RoomDomain } from '../../../domain/entities/room.ts';
import { Recording, RecordingDomain } from '../../../domain/entities/recording.ts';
import { RoomStatus, RecordingStatus, UserRole, Result, Ok, Err } from '../../../domain/types/common.ts';
import { ValidationError, BusinessRuleError, EntityNotFoundError, ConflictError } from '../../../domain/errors/index.ts';

/**
 * Input data for stopping a recording
 */
export interface StopRecordingInput {
  roomId: string;
  hostId: string;
  recordingId?: string; // Optional - will find active recording if not provided
}

/**
 * Output data from stopping recording
 */
export interface StopRecordingOutput {
  recording: Recording;
  room: Room;
  message: string;
}

/**
 * Stop Recording Use Case implementation
 */
export class StopRecordingUseCase {
  constructor(
    private roomRepository: RoomRepository,
    private recordingRepository: RecordingRepository,
    private userRepository: UserRepository,
    private realtimeService?: RealtimeService
  ) {}

  /**
   * Execute the stop recording use case
   */
  async execute(input: StopRecordingInput): Promise<Result<StopRecordingOutput>> {
    try {
      // 1. Validate input data
      const validationResult = this.validateInput(input);
      if (!validationResult.success) {
        return Err(validationResult.error);
      }

      // 2. Validate host permissions
      const hostValidationResult = await this.validateHost(input.hostId);
      if (!hostValidationResult.success) {
        return Err(hostValidationResult.error);
      }

      // 3. Find and validate room
      const roomValidationResult = await this.validateRoom(input.roomId, input.hostId);
      if (!roomValidationResult.success) {
        return Err(roomValidationResult.error);
      }

      const room = roomValidationResult.data;

      // 4. Validate room state for stopping recording
      const stateValidationResult = this.validateRoomStateForStoppingRecording(room);
      if (!stateValidationResult.success) {
        return Err(stateValidationResult.error);
      }

      // 5. Find active recording
      const recordingResult = await this.findActiveRecording(input.roomId, input.recordingId);
      if (!recordingResult.success) {
        return Err(recordingResult.error);
      }

      const recording = recordingResult.data;

      // 6. Stop the recording
      const stopRecordingResult = await this.recordingRepository.update(
        recording.id,
        RecordingDomain.stopRecording()
      );

      if (!stopRecordingResult.success) {
        return Err(stopRecordingResult.error);
      }

      // 7. Update room status to active (no longer recording)
      const roomUpdateResult = await this.roomRepository.update(
        input.roomId,
        RoomDomain.stopRecording()
      );

      if (!roomUpdateResult.success) {
        // Try to revert recording status if room update fails
        try {
          await this.recordingRepository.update(
            recording.id,
            { status: RecordingStatus.RECORDING }
          );
        } catch (revertError) {
          console.error('Failed to revert recording status:', revertError);
        }
        return Err(roomUpdateResult.error);
      }

      // 8. Broadcast recording stopped event
      if (this.realtimeService) {
        try {
          await this.realtimeService.broadcastRecordingStopped(
            input.roomId,
            recording.id
          );
        } catch (error) {
          console.error('Failed to broadcast recording stopped event:', error);
          // Don't fail the entire operation for broadcast errors
        }
      }

      // 9. Prepare success response
      const output: StopRecordingOutput = {
        recording: stopRecordingResult.data,
        room: roomUpdateResult.data,
        message: `Recording stopped for room "${room.name || room.id}"`
      };

      return Ok(output);

    } catch (error) {
      return Err(new Error(`Failed to stop recording: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Validate input data
   */
  private validateInput(input: StopRecordingInput): Result<void> {
    const errors: string[] = [];

    // Room ID validation
    if (!input.roomId || input.roomId.trim().length === 0) {
      errors.push('Room ID is required');
    }

    // Host ID validation
    if (!input.hostId || input.hostId.trim().length === 0) {
      errors.push('Host ID is required');
    }

    if (errors.length > 0) {
      return Err(new ValidationError(errors.join('; ')));
    }

    return Ok(undefined);
  }

  /**
   * Validate host exists and has proper permissions
   */
  private async validateHost(hostId: string): Promise<Result<any>> {
    const hostResult = await this.userRepository.findById(hostId);
    if (!hostResult.success) {
      return Err(hostResult.error);
    }

    if (!hostResult.data) {
      return Err(new EntityNotFoundError('User', hostId));
    }

    const host = hostResult.data;

    // Check if user is active
    if (!host.isActive) {
      return Err(new BusinessRuleError('Host account is deactivated'));
    }

    // Check if user has host or admin role
    if (host.role !== UserRole.HOST && host.role !== UserRole.ADMIN) {
      return Err(new BusinessRuleError('User does not have permission to stop recordings'));
    }

    return Ok(host);
  }

  /**
   * Validate room exists and host has permission
   */
  private async validateRoom(roomId: string, hostId: string): Promise<Result<Room>> {
    const roomResult = await this.roomRepository.findById(roomId);
    if (!roomResult.success) {
      return Err(roomResult.error);
    }

    if (!roomResult.data) {
      return Err(new EntityNotFoundError('Room', roomId));
    }

    const room = roomResult.data;

    // Check if host owns the room
    if (room.hostId !== hostId) {
      return Err(new BusinessRuleError('Only the room host can stop recordings'));
    }

    return Ok(room);
  }

  /**
   * Validate room state for stopping recording
   */
  private validateRoomStateForStoppingRecording(room: Room): Result<void> {
    // Check if room is active
    if (!RoomDomain.isActive(room)) {
      return Err(new BusinessRuleError('Cannot stop recording in a closed room'));
    }

    // Check if room is currently recording
    if (!RoomDomain.isRecording(room)) {
      return Err(new ConflictError('Room is not currently recording'));
    }

    return Ok(undefined);
  }

  /**
   * Find active recording in the room
   */
  private async findActiveRecording(roomId: string, recordingId?: string): Promise<Result<Recording>> {
    if (recordingId) {
      // Find specific recording
      const recordingResult = await this.recordingRepository.findById(recordingId);
      if (!recordingResult.success) {
        return Err(recordingResult.error);
      }

      if (!recordingResult.data) {
        return Err(new EntityNotFoundError('Recording', recordingId));
      }

      const recording = recordingResult.data;

      // Validate recording belongs to the room
      if (recording.roomId !== roomId) {
        return Err(new BusinessRuleError('Recording does not belong to the specified room'));
      }

      // Validate recording is in progress
      if (!RecordingDomain.isInProgress(recording)) {
        return Err(new ConflictError('Recording is not currently in progress'));
      }

      return Ok(recording);
    } else {
      // Find active recording in the room
      const recordingsResult = await this.recordingRepository.findByRoomId(roomId, { page: 1, limit: 10 });
      if (!recordingsResult.success) {
        return Err(recordingsResult.error);
      }

      // Find the active recording
      const activeRecording = recordingsResult.data.items.find(recording => 
        RecordingDomain.isInProgress(recording)
      );

      if (!activeRecording) {
        return Err(new EntityNotFoundError('Active recording not found in room'));
      }

      return Ok(activeRecording);
    }
  }

  /**
   * Calculate recording duration and update metadata
   */
  private async finalizeRecordingMetadata(recording: Recording): Promise<Result<Recording>> {
    try {
      const now = new Date();
      const durationSeconds = Math.floor((now.getTime() - recording.startedAt.getTime()) / 1000);

      const updateData = {
        stoppedAt: now,
        durationSeconds: durationSeconds,
        status: RecordingStatus.COMPLETED
      };

      const updateResult = await this.recordingRepository.update(recording.id, updateData);
      if (!updateResult.success) {
        return Err(updateResult.error);
      }

      return Ok(updateResult.data);
    } catch (error) {
      return Err(new Error(`Failed to finalize recording metadata: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
}