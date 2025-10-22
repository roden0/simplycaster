// ============================================================================
// Room Domain Entity
// ============================================================================

import { BaseEntity, RoomStatus } from '../types/common.ts';
import { ValidationError, InvalidRoomStatusError, RoomCapacityExceededError } from '../errors/index.ts';

/**
 * Room domain entity
 */
export interface Room extends BaseEntity {
  name?: string;
  slug?: string;
  status: RoomStatus;
  hostId: string;
  maxParticipants: number;
  allowVideo: boolean;
  recordingStartedAt?: Date;
  recordingStoppedAt?: Date;
  closedAt?: Date;
}

/**
 * Data for creating a new room
 */
export interface CreateRoomData {
  name?: string;
  slug?: string;
  hostId: string;
  maxParticipants?: number;
  allowVideo?: boolean;
}

/**
 * Data for updating a room
 */
export interface UpdateRoomData {
  name?: string;
  slug?: string;
  status?: RoomStatus;
  maxParticipants?: number;
  allowVideo?: boolean;
  recordingStartedAt?: Date;
  recordingStoppedAt?: Date;
  closedAt?: Date;
}

/**
 * Room domain service functions
 */
export class RoomDomain {
  /**
   * Validates room slug format
   */
  static validateSlug(slug: string): void {
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(slug)) {
      throw new ValidationError('Slug must contain only lowercase letters, numbers, and hyphens', 'slug');
    }
  }

  /**
   * Validates max participants
   */
  static validateMaxParticipants(maxParticipants: number): void {
    if (maxParticipants < 1 || maxParticipants > 100) {
      throw new ValidationError('Max participants must be between 1 and 100', 'maxParticipants');
    }
  }

  /**
   * Checks if room can transition to new status
   */
  static canTransitionTo(currentStatus: RoomStatus, targetStatus: RoomStatus): boolean {
    const validTransitions: Record<RoomStatus, RoomStatus[]> = {
      [RoomStatus.WAITING]: [RoomStatus.ACTIVE, RoomStatus.CLOSED],
      [RoomStatus.ACTIVE]: [RoomStatus.RECORDING, RoomStatus.CLOSED],
      [RoomStatus.RECORDING]: [RoomStatus.ACTIVE, RoomStatus.CLOSED],
      [RoomStatus.CLOSED]: [] // No transitions from closed
    };

    return validTransitions[currentStatus].includes(targetStatus);
  }

  /**
   * Validates room status transition
   */
  static validateStatusTransition(currentStatus: RoomStatus, targetStatus: RoomStatus): void {
    if (!this.canTransitionTo(currentStatus, targetStatus)) {
      throw new InvalidRoomStatusError(currentStatus, targetStatus);
    }
  }

  /**
   * Checks if room is active (not closed)
   */
  static isActive(room: Room): boolean {
    return !room.closedAt && room.status !== RoomStatus.CLOSED;
  }

  /**
   * Checks if room is recording
   */
  static isRecording(room: Room): boolean {
    return room.status === RoomStatus.RECORDING && !!room.recordingStartedAt;
  }

  /**
   * Checks if room can accept new participants
   */
  static canAcceptParticipants(room: Room, currentParticipantCount: number): boolean {
    if (!this.isActive(room)) {
      return false;
    }
    return currentParticipantCount < room.maxParticipants;
  }

  /**
   * Validates participant capacity
   */
  static validateParticipantCapacity(room: Room, currentParticipantCount: number): void {
    if (currentParticipantCount >= room.maxParticipants) {
      throw new RoomCapacityExceededError(room.maxParticipants);
    }
  }

  /**
   * Generates default room name based on creation date
   */
  static generateDefaultName(createdAt: Date = new Date()): string {
    return `Room ${createdAt.toISOString().split('T')[0]} ${createdAt.toTimeString().split(' ')[0]}`;
  }

  /**
   * Generates room slug from name
   */
  static generateSlugFromName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  /**
   * Creates update data for starting recording
   */
  static startRecording(): UpdateRoomData {
    return {
      status: RoomStatus.RECORDING,
      recordingStartedAt: new Date()
    };
  }

  /**
   * Creates update data for stopping recording
   */
  static stopRecording(): UpdateRoomData {
    return {
      status: RoomStatus.ACTIVE,
      recordingStoppedAt: new Date()
    };
  }

  /**
   * Creates update data for closing room
   */
  static closeRoom(): UpdateRoomData {
    return {
      status: RoomStatus.CLOSED,
      closedAt: new Date()
    };
  }
}