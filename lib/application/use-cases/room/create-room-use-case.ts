/**
 * Create Room Use Case
 * 
 * Handles room creation with host validation, unique slug generation,
 * room configuration, and permission checks.
 */

import { RoomRepository } from '../../../domain/repositories/room-repository.ts';
import { UserRepository } from '../../../domain/repositories/user-repository.ts';
import { Room, CreateRoomData, RoomDomain } from '../../../domain/entities/room.ts';
import { UserRole, RoomStatus, Result, Ok, Err } from '../../../domain/types/common.ts';
import { ValidationError, BusinessRuleError, EntityNotFoundError } from '../../../domain/errors/index.ts';

/**
 * Input data for creating a room
 */
export interface CreateRoomInput {
  name?: string;
  slug?: string;
  hostId: string;
  maxParticipants?: number;
  allowVideo?: boolean;
}

/**
 * Output data from room creation
 */
export interface CreateRoomOutput {
  room: Room;
  message: string;
}

/**
 * Create Room Use Case implementation
 */
export class CreateRoomUseCase {
  constructor(
    private roomRepository: RoomRepository,
    private userRepository: UserRepository
  ) {}

  /**
   * Execute the create room use case
   */
  async execute(input: CreateRoomInput): Promise<Result<CreateRoomOutput>> {
    try {
      // 1. Validate input data
      const validationResult = this.validateInput(input);
      if (!validationResult.success) {
        return Err(validationResult.error);
      }

      // 2. Validate host exists and has proper permissions
      const hostValidationResult = await this.validateHost(input.hostId);
      if (!hostValidationResult.success) {
        return Err(hostValidationResult.error);
      }

      const host = hostValidationResult.data;

      // 3. Generate room name if not provided
      const roomName = input.name || RoomDomain.generateDefaultName();

      // 4. Generate or validate slug
      const slugResult = await this.generateOrValidateSlug(input.slug, roomName);
      if (!slugResult.success) {
        return Err(slugResult.error);
      }

      const slug = slugResult.data;

      // 5. Validate room configuration
      const configValidationResult = this.validateRoomConfiguration(input);
      if (!configValidationResult.success) {
        return Err(configValidationResult.error);
      }

      // 6. Check host room limits (business rule)
      const roomLimitResult = await this.validateHostRoomLimits(input.hostId);
      if (!roomLimitResult.success) {
        return Err(roomLimitResult.error);
      }

      // 7. Create room data
      const createRoomData: CreateRoomData = {
        name: roomName,
        slug: slug,
        hostId: input.hostId,
        maxParticipants: input.maxParticipants ?? 10,
        allowVideo: input.allowVideo ?? true
      };

      // 8. Create room in repository
      const createResult = await this.roomRepository.create(createRoomData);
      if (!createResult.success) {
        return Err(createResult.error);
      }

      // 9. Prepare success response
      const output: CreateRoomOutput = {
        room: createResult.data,
        message: `Room "${createResult.data.name}" created successfully`
      };

      return Ok(output);

    } catch (error) {
      return Err(new Error(`Failed to create room: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Validate input data
   */
  private validateInput(input: CreateRoomInput): Result<void> {
    const errors: string[] = [];

    // Host ID validation
    if (!input.hostId || input.hostId.trim().length === 0) {
      errors.push('Host ID is required');
    }

    // Name validation (if provided)
    if (input.name !== undefined && input.name.length > 255) {
      errors.push('Room name must not exceed 255 characters');
    }

    // Slug validation (if provided)
    if (input.slug !== undefined) {
      try {
        RoomDomain.validateSlug(input.slug);
      } catch (error) {
        errors.push((error as ValidationError).message);
      }
    }

    // Max participants validation (if provided)
    if (input.maxParticipants !== undefined) {
      try {
        RoomDomain.validateMaxParticipants(input.maxParticipants);
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
    // Find host user
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
      return Err(new BusinessRuleError('User does not have permission to create rooms'));
    }

    return Ok(host);
  }

  /**
   * Generate or validate slug
   */
  private async generateOrValidateSlug(providedSlug?: string, roomName?: string): Promise<Result<string>> {
    let slug: string;

    if (providedSlug) {
      // Use provided slug
      slug = providedSlug;
    } else if (roomName) {
      // Generate slug from room name
      slug = RoomDomain.generateSlugFromName(roomName);
    } else {
      // Generate default slug with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      slug = `room-${timestamp}`;
    }

    // Validate slug format
    try {
      RoomDomain.validateSlug(slug);
    } catch (error) {
      return Err(error as ValidationError);
    }

    // Check slug uniqueness
    const slugExistsResult = await this.roomRepository.slugExists(slug);
    if (!slugExistsResult.success) {
      return Err(slugExistsResult.error);
    }

    if (slugExistsResult.data) {
      // Slug exists, generate a unique one
      const timestamp = Date.now();
      const uniqueSlug = `${slug}-${timestamp}`;
      
      // Validate the unique slug
      try {
        RoomDomain.validateSlug(uniqueSlug);
      } catch (error) {
        return Err(error as ValidationError);
      }

      return Ok(uniqueSlug);
    }

    return Ok(slug);
  }

  /**
   * Validate room configuration
   */
  private validateRoomConfiguration(input: CreateRoomInput): Result<void> {
    // Max participants validation
    if (input.maxParticipants !== undefined) {
      try {
        RoomDomain.validateMaxParticipants(input.maxParticipants);
      } catch (error) {
        return Err(error as ValidationError);
      }
    }

    // Additional business rules can be added here
    // For example: video settings validation, room type restrictions, etc.

    return Ok(undefined);
  }

  /**
   * Validate host room limits (business rule)
   */
  private async validateHostRoomLimits(hostId: string): Promise<Result<void>> {
    // Get current active room count for host
    const roomCountResult = await this.roomRepository.countByHost(hostId);
    if (!roomCountResult.success) {
      return Err(roomCountResult.error);
    }

    const currentRoomCount = roomCountResult.data;

    // Business rule: Hosts can have maximum 5 active rooms
    const maxRoomsPerHost = 5;
    if (currentRoomCount >= maxRoomsPerHost) {
      return Err(new BusinessRuleError(`Host cannot have more than ${maxRoomsPerHost} active rooms`));
    }

    return Ok(undefined);
  }

  /**
   * Validate business rules for room creation
   */
  private validateBusinessRules(input: CreateRoomInput, host: any): Result<void> {
    // Business rule: Only verified hosts can create rooms
    if (!host.emailVerified) {
      return Err(new BusinessRuleError('Host email must be verified to create rooms'));
    }

    // Business rule: Room name restrictions
    if (input.name) {
      const forbiddenWords = ['admin', 'system', 'api', 'test'];
      const lowerName = input.name.toLowerCase();
      
      for (const word of forbiddenWords) {
        if (lowerName.includes(word)) {
          return Err(new BusinessRuleError(`Room name cannot contain the word "${word}"`));
        }
      }
    }

    return Ok(undefined);
  }
}