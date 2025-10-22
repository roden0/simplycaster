/**
 * Close Room Use Case
 * 
 * Handles room closure with guest expiration, recording finalization,
 * and event publishing for room lifecycle management.
 */

import { RoomRepository } from '../../../domain/repositories/room-repository.ts';
import { GuestRepository } from '../../../domain/repositories/guest-repository.ts';
import { UserRepository } from '../../../domain/repositories/user-repository.ts';
import { Room, RoomDomain } from '../../../domain/entities/room.ts';
import { UserRole, RoomStatus, Result, Ok, Err } from '../../../domain/types/common.ts';
import { ValidationError, BusinessRuleError, EntityNotFoundError } from '../../../domain/errors/index.ts';
import { EventPublisher } from '../../../domain/types/events.ts';
import { createBaseEvent, generateCorrelationId } from '../../../domain/services/event-utils.ts';
import { EventType, RoomEventData } from '../../../domain/types/events.ts';

/**
 * Input data for closing a room
 */
export interface CloseRoomInput {
  roomId: string;
  hostId: string;
  reason?: string;
}

/**
 * Output data from room closure
 */
export interface CloseRoomOutput {
  room: Room;
  expiredGuestsCount: number;
  message: string;
}

/**
 * Close Room Use Case implementation
 */
export class CloseRoomUseCase {
  constructor(
    private roomRepository: RoomRepository,
    private guestRepository: GuestRepository,
    private userRepository: UserRepository,
    private eventPublisher?: EventPublisher
  ) {}

  /**
   * Execute the close room use case
   */
  async execute(input: CloseRoomInput): Promise<Result<CloseRoomOutput>> {
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

      // 4. Validate room state for closure
      const stateValidationResult = this.validateRoomStateForClosure(room);
      if (!stateValidationResult.success) {
        return Err(stateValidationResult.error);
      }

      // 5. Expire all active guests in the room
      const expireGuestsResult = await this.guestRepository.expireGuestsInRoom(input.roomId);
      if (!expireGuestsResult.success) {
        return Err(expireGuestsResult.error);
      }

      // 6. Close the room
      const closeResult = await this.roomRepository.closeRoom(input.roomId);
      if (!closeResult.success) {
        return Err(closeResult.error);
      }

      // 7. Get updated room data
      const updatedRoomResult = await this.roomRepository.findById(input.roomId);
      if (!updatedRoomResult.success || !updatedRoomResult.data) {
        return Err(new EntityNotFoundError('Room', input.roomId));
      }

      const updatedRoom = updatedRoomResult.data;

      // 8. Publish room closed event
      if (this.eventPublisher) {
        try {
          const correlationId = generateCorrelationId();
          const roomEventData: RoomEventData = {
            roomId: updatedRoom.id,
            roomName: updatedRoom.name || `Room-${updatedRoom.id}`,
            hostId: updatedRoom.hostId,
            maxParticipants: updatedRoom.maxParticipants,
            allowVideo: updatedRoom.allowVideo
          };

          const roomClosedEvent = createBaseEvent(
            EventType.ROOM_CLOSED,
            roomEventData,
            {
              correlationId,
              userId: input.hostId,
              priority: 'normal',
              source: 'room-service'
            }
          );

          await this.eventPublisher.publish(roomClosedEvent);
        } catch (error) {
          // Log event publishing error but don't fail the room closure
          console.error('Failed to publish room closed event:', error);
        }
      }

      // 9. Prepare success response
      const output: CloseRoomOutput = {
        room: updatedRoom,
        expiredGuestsCount: 0, // We don't get the count from expireGuestsInRoom
        message: `Room "${updatedRoom.name || updatedRoom.id}" closed successfully`
      };

      return Ok(output);

    } catch (error) {
      return Err(new Error(`Failed to close room: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Validate input data
   */
  private validateInput(input: CloseRoomInput): Result<void> {
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
      return Err(new BusinessRuleError('User does not have permission to close rooms'));
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

    // Check if host owns the room (admins can close any room)
    const hostResult = await this.userRepository.findById(hostId);
    if (hostResult.success && hostResult.data?.role !== UserRole.ADMIN) {
      if (room.hostId !== hostId) {
        return Err(new BusinessRuleError('Only the room host or admin can close rooms'));
      }
    }

    return Ok(room);
  }

  /**
   * Validate room state for closure
   */
  private validateRoomStateForClosure(room: Room): Result<void> {
    // Check if room is already closed
    if (!RoomDomain.isActive(room)) {
      return Err(new BusinessRuleError('Room is already closed'));
    }

    // Room can be closed from any active state (waiting, active, or recording)
    return Ok(undefined);
  }
}