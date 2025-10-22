/**
 * Start Recording Use Case
 * 
 * Handles recording start logic with room state validation,
 * recording initialization, storage setup, and participant tracking.
 */

import { RoomRepository } from '../../../domain/repositories/room-repository.ts';
import { RecordingRepository } from '../../../domain/repositories/recording-repository.ts';
import { UserRepository } from '../../../domain/repositories/user-repository.ts';
import { StorageService } from '../../../domain/services/storage-service.ts';
import { RealtimeService } from '../../../domain/services/realtime-service.ts';
import { Room, RoomDomain } from '../../../domain/entities/room.ts';
import { Recording, CreateRecordingData, RecordingDomain } from '../../../domain/entities/recording.ts';
import { RoomStatus, RecordingStatus, UserRole, Result, Ok, Err } from '../../../domain/types/common.ts';
import { ValidationError, BusinessRuleError, EntityNotFoundError, ConflictError } from '../../../domain/errors/index.ts';

/**
 * Input data for starting a recording
 */
export interface StartRecordingInput {
  roomId: string;
  hostId: string;
  participantCount?: number;
}

/**
 * Output data from starting recording
 */
export interface StartRecordingOutput {
  recording: Recording;
  room: Room;
  storageInfo: {
    folderPath: string;
    folderName: string;
  };
  message: string;
}

/**
 * Start Recording Use Case implementation
 */
export class StartRecordingUseCase {
  constructor(
    private roomRepository: RoomRepository,
    private recordingRepository: RecordingRepository,
    private userRepository: UserRepository,
    private storageService: StorageService,
    private realtimeService?: RealtimeService
  ) {}

  /**
   * Execute the start recording use case
   */
  async execute(input: StartRecordingInput): Promise<Result<StartRecordingOutput>> {
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

      // 4. Validate room state for recording
      const stateValidationResult = this.validateRoomStateForRecording(room);
      if (!stateValidationResult.success) {
        return Err(stateValidationResult.error);
      }

      // 5. Check for existing active recording
      const existingRecordingResult = await this.checkExistingRecording(input.roomId);
      if (!existingRecordingResult.success) {
        return Err(existingRecordingResult.error);
      }

      // 6. Generate recording folder name
      const folderName = RecordingDomain.generateFolderName(
        room.name || `Room-${room.id}`,
        new Date()
      );

      // 7. Validate folder name uniqueness
      const folderValidationResult = await this.validateFolderName(folderName);
      if (!folderValidationResult.success) {
        return Err(folderValidationResult.error);
      }

      // 8. Initialize storage for recording
      const storageResult = await this.initializeRecordingStorage(folderName);
      if (!storageResult.success) {
        return Err(storageResult.error);
      }

      // 9. Create recording record
      const recordingData: CreateRecordingData = {
        roomId: input.roomId,
        folderName: folderName,
        participantCount: input.participantCount || 0,
        startedAt: new Date(),
        createdBy: input.hostId
      };

      const createRecordingResult = await this.recordingRepository.create(recordingData);
      if (!createRecordingResult.success) {
        // Clean up storage if recording creation fails
        await this.storageService.deleteRecordingFolder(folderName);
        return Err(createRecordingResult.error);
      }

      // 10. Update room status to recording
      const roomUpdateResult = await this.roomRepository.update(
        input.roomId,
        RoomDomain.startRecording()
      );

      if (!roomUpdateResult.success) {
        // Clean up recording and storage if room update fails
        await this.recordingRepository.delete(createRecordingResult.data.id);
        await this.storageService.deleteRecordingFolder(folderName);
        return Err(roomUpdateResult.error);
      }

      // 11. Broadcast recording started event
      if (this.realtimeService) {
        try {
          await this.realtimeService.broadcastRecordingStarted(
            input.roomId,
            createRecordingResult.data.id
          );
        } catch (error) {
          console.error('Failed to broadcast recording started event:', error);
          // Don't fail the entire operation for broadcast errors
        }
      }

      // 12. Prepare success response
      const output: StartRecordingOutput = {
        recording: createRecordingResult.data,
        room: roomUpdateResult.data,
        storageInfo: {
          folderPath: storageResult.data.folderPath,
          folderName: folderName
        },
        message: `Recording started for room "${room.name || room.id}"`
      };

      return Ok(output);

    } catch (error) {
      return Err(new Error(`Failed to start recording: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Validate input data
   */
  private validateInput(input: StartRecordingInput): Result<void> {
    const errors: string[] = [];

    // Room ID validation
    if (!input.roomId || input.roomId.trim().length === 0) {
      errors.push('Room ID is required');
    }

    // Host ID validation
    if (!input.hostId || input.hostId.trim().length === 0) {
      errors.push('Host ID is required');
    }

    // Participant count validation (if provided)
    if (input.participantCount !== undefined) {
      try {
        RecordingDomain.validateParticipantCount(input.participantCount);
      } catch (error) {
        errors.push((error as ValidationError).message);
      }
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
      return Err(new BusinessRuleError('User does not have permission to start recordings'));
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
      return Err(new BusinessRuleError('Only the room host can start recordings'));
    }

    return Ok(room);
  }

  /**
   * Validate room state for recording
   */
  private validateRoomStateForRecording(room: Room): Result<void> {
    // Check if room is active
    if (!RoomDomain.isActive(room)) {
      return Err(new BusinessRuleError('Cannot start recording in a closed room'));
    }

    // Check if room is already recording
    if (RoomDomain.isRecording(room)) {
      return Err(new ConflictError('Room is already recording'));
    }

    // Check if room status allows recording
    if (room.status !== RoomStatus.ACTIVE && room.status !== RoomStatus.WAITING) {
      return Err(new BusinessRuleError(`Cannot start recording when room status is ${room.status}`));
    }

    return Ok(undefined);
  }

  /**
   * Check for existing active recording in the room
   */
  private async checkExistingRecording(roomId: string): Promise<Result<void>> {
    // Find recordings by room ID with status filter
    const recordingsResult = await this.recordingRepository.findByRoomId(roomId, { page: 1, limit: 1 });
    if (!recordingsResult.success) {
      return Err(recordingsResult.error);
    }

    // Check if there's an active recording
    const activeRecording = recordingsResult.data.items.find(recording => 
      RecordingDomain.isInProgress(recording)
    );

    if (activeRecording) {
      return Err(new ConflictError('There is already an active recording for this room'));
    }

    return Ok(undefined);
  }

  /**
   * Validate folder name uniqueness
   */
  private async validateFolderName(folderName: string): Promise<Result<void>> {
    try {
      RecordingDomain.validateFolderName(folderName);
    } catch (error) {
      return Err(error as ValidationError);
    }

    // Check if folder name already exists
    const folderExistsResult = await this.recordingRepository.folderNameExists(folderName);
    if (!folderExistsResult.success) {
      return Err(folderExistsResult.error);
    }

    if (folderExistsResult.data) {
      // Generate unique folder name with timestamp
      const timestamp = Date.now();
      const uniqueFolderName = `${folderName}_${timestamp}`;
      
      try {
        RecordingDomain.validateFolderName(uniqueFolderName);
      } catch (error) {
        return Err(error as ValidationError);
      }
    }

    return Ok(undefined);
  }

  /**
   * Initialize storage for recording
   */
  private async initializeRecordingStorage(folderName: string): Promise<Result<{ folderPath: string }>> {
    const storageResult = await this.storageService.createRecordingFolder(folderName);
    if (!storageResult.success) {
      return Err(storageResult.error);
    }

    return Ok({ folderPath: storageResult.data });
  }

  /**
   * Validate business rules for starting recording
   */
  private validateRecordingBusinessRules(room: Room, host: any): Result<void> {
    // Business rule: Host must have verified email to start recordings
    if (!host.emailVerified) {
      return Err(new BusinessRuleError('Host email must be verified to start recordings'));
    }

    // Business rule: Room must have at least one participant (besides host)
    // This would require checking guest count, which might be handled elsewhere

    // Business rule: Check recording limits per host
    // This could be implemented to limit concurrent recordings per host

    return Ok(undefined);
  }

  /**
   * Cleanup resources in case of failure
   */
  private async cleanup(recordingId?: string, folderName?: string): Promise<void> {
    try {
      if (recordingId) {
        await this.recordingRepository.delete(recordingId);
      }
      
      if (folderName) {
        await this.storageService.deleteRecordingFolder(folderName);
      }
    } catch (error) {
      // Log cleanup errors but don't throw
      console.error('Failed to cleanup resources:', error);
    }
  }
}