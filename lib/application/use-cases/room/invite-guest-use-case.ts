/**
 * Invite Guest Use Case
 * 
 * Handles guest invitation logic with token generation,
 * email validation, invitation expiration, and guest access control.
 */

import { RoomRepository } from '../../../domain/repositories/room-repository.ts';
import { GuestRepository } from '../../../domain/repositories/guest-repository.ts';
import { UserRepository } from '../../../domain/repositories/user-repository.ts';
import { TokenService } from '../../../domain/services/token-service.ts';
import { Room, RoomDomain } from '../../../domain/entities/room.ts';
import { Guest, CreateGuestData, GuestDomain } from '../../../domain/entities/guest.ts';
import { UserRole, Result, Ok, Err } from '../../../domain/types/common.ts';
import { ValidationError, BusinessRuleError, EntityNotFoundError, ConflictError } from '../../../domain/errors/index.ts';

/**
 * Input data for inviting a guest
 */
export interface InviteGuestInput {
  roomId: string;
  hostId: string;
  displayName: string;
  email?: string;
  tokenExpirationHours?: number;
}

/**
 * Output data from guest invitation
 */
export interface InviteGuestOutput {
  guest: Guest;
  room: Room;
  inviteToken: string;
  inviteUrl: string;
  expiresAt: Date;
  message: string;
}

/**
 * Invite Guest Use Case implementation
 */
export class InviteGuestUseCase {
  private readonly defaultTokenExpirationHours = 24;
  private readonly maxTokenExpirationHours = 168; // 7 days

  constructor(
    private roomRepository: RoomRepository,
    private guestRepository: GuestRepository,
    private userRepository: UserRepository,
    private tokenService: TokenService
  ) {}

  /**
   * Execute the invite guest use case
   */
  async execute(input: InviteGuestInput): Promise<Result<InviteGuestOutput>> {
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

      // 4. Validate room state for guest invitation
      const stateValidationResult = this.validateRoomStateForInvitation(room);
      if (!stateValidationResult.success) {
        return Err(stateValidationResult.error);
      }

      // 5. Check room capacity
      const capacityValidationResult = await this.validateRoomCapacity(room);
      if (!capacityValidationResult.success) {
        return Err(capacityValidationResult.error);
      }

      // 6. Check for existing active guest with same email (if provided)
      if (input.email) {
        const existingGuestResult = await this.checkExistingGuest(input.roomId, input.email);
        if (!existingGuestResult.success) {
          return Err(existingGuestResult.error);
        }
      }

      // 7. Generate guest access token
      const tokenExpirationHours = input.tokenExpirationHours || this.defaultTokenExpirationHours;
      const tokenResult = await this.generateGuestToken(input.roomId, input.displayName, tokenExpirationHours);
      if (!tokenResult.success) {
        return Err(tokenResult.error);
      }

      // 8. Create guest record
      const tokenExpiresAt = new Date(Date.now() + tokenExpirationHours * 60 * 60 * 1000);
      
      const guestData: CreateGuestData = {
        roomId: input.roomId,
        displayName: input.displayName.trim(),
        email: input.email?.toLowerCase().trim(),
        accessTokenHash: tokenResult.data.tokenHash,
        tokenExpiresAt: tokenExpiresAt,
        invitedBy: input.hostId
      };

      const createGuestResult = await this.guestRepository.create(guestData);
      if (!createGuestResult.success) {
        return Err(createGuestResult.error);
      }

      // 9. Generate invite URL
      const inviteUrl = this.generateInviteUrl(tokenResult.data.token, room.slug || room.id);

      // 10. Prepare success response
      const output: InviteGuestOutput = {
        guest: createGuestResult.data,
        room: room,
        inviteToken: tokenResult.data.token,
        inviteUrl: inviteUrl,
        expiresAt: tokenExpiresAt,
        message: `Guest "${input.displayName}" invited to room "${room.name || room.id}"`
      };

      return Ok(output);

    } catch (error) {
      return Err(new Error(`Failed to invite guest: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Validate input data
   */
  private validateInput(input: InviteGuestInput): Result<void> {
    const errors: string[] = [];

    // Room ID validation
    if (!input.roomId || input.roomId.trim().length === 0) {
      errors.push('Room ID is required');
    }

    // Host ID validation
    if (!input.hostId || input.hostId.trim().length === 0) {
      errors.push('Host ID is required');
    }

    // Display name validation
    if (!input.displayName || input.displayName.trim().length === 0) {
      errors.push('Display name is required');
    } else {
      try {
        GuestDomain.validateDisplayName(input.displayName);
      } catch (error) {
        errors.push((error as ValidationError).message);
      }
    }

    // Email validation (if provided)
    if (input.email) {
      try {
        GuestDomain.validateEmail(input.email);
      } catch (error) {
        errors.push((error as ValidationError).message);
      }
    }

    // Token expiration validation (if provided)
    if (input.tokenExpirationHours !== undefined) {
      if (input.tokenExpirationHours <= 0) {
        errors.push('Token expiration must be greater than 0 hours');
      }
      if (input.tokenExpirationHours > this.maxTokenExpirationHours) {
        errors.push(`Token expiration cannot exceed ${this.maxTokenExpirationHours} hours`);
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
      return Err(new BusinessRuleError('User does not have permission to invite guests'));
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
      return Err(new BusinessRuleError('Only the room host can invite guests'));
    }

    return Ok(room);
  }

  /**
   * Validate room state for guest invitation
   */
  private validateRoomStateForInvitation(room: Room): Result<void> {
    // Check if room is active
    if (!RoomDomain.isActive(room)) {
      return Err(new BusinessRuleError('Cannot invite guests to a closed room'));
    }

    // Room can be in any active state (waiting, active, or recording)
    // Guests can be invited even during recording

    return Ok(undefined);
  }

  /**
   * Validate room capacity
   */
  private async validateRoomCapacity(room: Room): Promise<Result<void>> {
    // Get current active guest count
    const activeGuestsResult = await this.guestRepository.countActiveByRoom(room.id);
    if (!activeGuestsResult.success) {
      return Err(activeGuestsResult.error);
    }

    const currentGuestCount = activeGuestsResult.data;

    // Check if room can accept new participants
    if (!RoomDomain.canAcceptParticipants(room, currentGuestCount + 1)) { // +1 for the host
      return Err(new BusinessRuleError(`Room has reached maximum capacity of ${room.maxParticipants} participants`));
    }

    return Ok(undefined);
  }

  /**
   * Check for existing active guest with same email
   */
  private async checkExistingGuest(roomId: string, email: string): Promise<Result<void>> {
    const existingGuestResult = await this.guestRepository.findActiveByRoomAndEmail(roomId, email);
    if (!existingGuestResult.success) {
      return Err(existingGuestResult.error);
    }

    if (existingGuestResult.data) {
      return Err(new ConflictError('A guest with this email is already invited to this room'));
    }

    return Ok(undefined);
  }

  /**
   * Generate guest access token
   */
  private async generateGuestToken(
    roomId: string, 
    displayName: string, 
    expirationHours: number
  ): Promise<Result<{ token: string; tokenHash: string }>> {
    
    const tokenPayload = {
      roomId: roomId,
      displayName: displayName,
      type: 'guest_access',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (expirationHours * 60 * 60)
    };

    const tokenResult = await this.tokenService.generateGuestToken(tokenPayload, expirationHours);
    if (!tokenResult.success) {
      return Err(tokenResult.error);
    }

    const token = tokenResult.data;

    // Generate hash of the token for storage
    const hashResult = await this.tokenService.hashToken(token);
    if (!hashResult.success) {
      return Err(hashResult.error);
    }

    return Ok({
      token: token,
      tokenHash: hashResult.data
    });
  }

  /**
   * Generate invite URL
   */
  private generateInviteUrl(token: string, roomSlugOrId: string): string {
    // In a real implementation, this would use the actual base URL from configuration
    const baseUrl = Deno.env.get('BASE_URL') || 'http://localhost:8000';
    return `${baseUrl}/invite?token=${token}&room=${roomSlugOrId}`;
  }

  /**
   * Validate business rules for guest invitation
   */
  private validateInvitationBusinessRules(room: Room, host: any, input: InviteGuestInput): Result<void> {
    // Business rule: Host must have verified email to invite guests
    if (!host.emailVerified) {
      return Err(new BusinessRuleError('Host email must be verified to invite guests'));
    }

    // Business rule: Cannot invite guests with forbidden display names
    const forbiddenNames = ['admin', 'system', 'host', 'moderator'];
    const lowerDisplayName = input.displayName.toLowerCase();
    
    for (const name of forbiddenNames) {
      if (lowerDisplayName.includes(name)) {
        return Err(new BusinessRuleError(`Display name cannot contain the word "${name}"`));
      }
    }

    // Business rule: Check invitation limits per room
    // This could be implemented to limit total invitations per room

    return Ok(undefined);
  }

  /**
   * Revoke existing guest invitation (helper method)
   */
  async revokeGuestInvitation(guestId: string, hostId: string): Promise<Result<void>> {
    try {
      // Find guest
      const guestResult = await this.guestRepository.findById(guestId);
      if (!guestResult.success) {
        return Err(guestResult.error);
      }

      if (!guestResult.data) {
        return Err(new EntityNotFoundError('Guest', guestId));
      }

      const guest = guestResult.data;

      // Validate host permission
      const roomResult = await this.roomRepository.findById(guest.roomId);
      if (!roomResult.success) {
        return Err(roomResult.error);
      }

      if (!roomResult.data || roomResult.data.hostId !== hostId) {
        return Err(new BusinessRuleError('Only the room host can revoke guest invitations'));
      }

      // Kick guest from room (which expires their token)
      const kickResult = await this.guestRepository.update(
        guestId,
        GuestDomain.kickFromRoom(hostId)
      );

      if (!kickResult.success) {
        return Err(kickResult.error);
      }

      return Ok(undefined);

    } catch (error) {
      return Err(new Error(`Failed to revoke guest invitation: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
}