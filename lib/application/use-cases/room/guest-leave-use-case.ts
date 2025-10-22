/**
 * Guest Leave Use Case
 * 
 * Handles guest leaving room with token expiration and event publishing.
 */

import { GuestRepository } from '../../../domain/repositories/guest-repository.ts';
import { RoomRepository } from '../../../domain/repositories/room-repository.ts';
import { Guest, GuestDomain } from '../../../domain/entities/guest.ts';
import { Room } from '../../../domain/entities/room.ts';
import { Result, Ok, Err } from '../../../domain/types/common.ts';
import { ValidationError, BusinessRuleError, EntityNotFoundError } from '../../../domain/errors/index.ts';
import { EventPublisher } from '../../../domain/types/events.ts';
import { createBaseEvent, generateCorrelationId } from '../../../domain/services/event-utils.ts';
import { EventType, UserEventData } from '../../../domain/types/events.ts';

/**
 * Input data for guest leaving
 */
export interface GuestLeaveInput {
  guestId: string;
  roomId: string;
  reason?: 'voluntary' | 'kicked' | 'expired';
  kickedBy?: string; // User ID of who kicked the guest (if applicable)
}

/**
 * Output data from guest leaving
 */
export interface GuestLeaveOutput {
  guest: Guest;
  room: Room;
  message: string;
}

/**
 * Guest Leave Use Case implementation
 */
export class GuestLeaveUseCase {
  constructor(
    private guestRepository: GuestRepository,
    private roomRepository: RoomRepository,
    private eventPublisher?: EventPublisher
  ) {}

  /**
   * Execute the guest leave use case
   */
  async execute(input: GuestLeaveInput): Promise<Result<GuestLeaveOutput>> {
    try {
      // 1. Validate input data
      const validationResult = this.validateInput(input);
      if (!validationResult.success) {
        return Err(validationResult.error);
      }

      // 2. Find and validate guest
      const guestValidationResult = await this.validateGuest(input.guestId, input.roomId);
      if (!guestValidationResult.success) {
        return Err(guestValidationResult.error);
      }

      const guest = guestValidationResult.data;

      // 3. Find room
      const roomResult = await this.roomRepository.findById(input.roomId);
      if (!roomResult.success || !roomResult.data) {
        return Err(new EntityNotFoundError('Room', input.roomId));
      }

      const room = roomResult.data;

      // 4. Update guest status based on reason
      let updateData;
      if (input.reason === 'kicked' && input.kickedBy) {
        updateData = GuestDomain.kickFromRoom(input.kickedBy);
      } else {
        updateData = GuestDomain.leaveRoom();
      }

      const updateResult = await this.guestRepository.update(input.guestId, updateData);
      if (!updateResult.success) {
        return Err(updateResult.error);
      }

      // 5. Publish user left event
      if (this.eventPublisher) {
        try {
          const correlationId = generateCorrelationId();
          const userEventData: UserEventData = {
            userId: guest.id,
            roomId: input.roomId,
            displayName: guest.displayName,
            participantType: 'guest',
            email: guest.email
          };

          const eventType = input.reason === 'kicked' ? EventType.USER_KICKED : EventType.USER_LEFT;
          
          const userLeftEvent = createBaseEvent(
            eventType,
            userEventData,
            {
              correlationId,
              userId: input.kickedBy || guest.id,
              priority: 'normal',
              source: 'room-service'
            }
          );

          await this.eventPublisher.publish(userLeftEvent);
        } catch (error) {
          // Log event publishing error but don't fail the guest leave operation
          console.error('Failed to publish user left/kicked event:', error);
        }
      }

      // 6. Prepare success response
      const action = input.reason === 'kicked' ? 'kicked from' : 'left';
      const output: GuestLeaveOutput = {
        guest: updateResult.data,
        room: room,
        message: `Guest "${guest.displayName}" ${action} room "${room.name || room.id}"`
      };

      return Ok(output);

    } catch (error) {
      return Err(new Error(`Failed to process guest leave: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Validate input data
   */
  private validateInput(input: GuestLeaveInput): Result<void> {
    const errors: string[] = [];

    // Guest ID validation
    if (!input.guestId || input.guestId.trim().length === 0) {
      errors.push('Guest ID is required');
    }

    // Room ID validation
    if (!input.roomId || input.roomId.trim().length === 0) {
      errors.push('Room ID is required');
    }

    // Kicked by validation (if reason is kicked)
    if (input.reason === 'kicked' && (!input.kickedBy || input.kickedBy.trim().length === 0)) {
      errors.push('Kicked by user ID is required when reason is kicked');
    }

    if (errors.length > 0) {
      return Err(new ValidationError(errors.join('; ')));
    }

    return Ok(undefined);
  }

  /**
   * Validate guest exists and is in the specified room
   */
  private async validateGuest(guestId: string, roomId: string): Promise<Result<Guest>> {
    const guestResult = await this.guestRepository.findById(guestId);
    if (!guestResult.success) {
      return Err(guestResult.error);
    }

    if (!guestResult.data) {
      return Err(new EntityNotFoundError('Guest', guestId));
    }

    const guest = guestResult.data;

    // Validate guest belongs to the specified room
    if (guest.roomId !== roomId) {
      return Err(new BusinessRuleError('Guest does not belong to the specified room'));
    }

    // Validate guest is still active (not already left or kicked)
    if (guest.leftAt || guest.kickedAt) {
      return Err(new BusinessRuleError('Guest has already left or been kicked from the room'));
    }

    return Ok(guest);
  }
}