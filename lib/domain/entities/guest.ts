// ============================================================================
// Guest Domain Entity
// ============================================================================

import { BaseEntity } from '../types/common.ts';
import { ValidationError } from '../errors/index.ts';

/**
 * Guest domain entity
 */
export interface Guest extends BaseEntity {
  roomId: string;
  displayName: string;
  email?: string;
  accessTokenHash: string;
  tokenExpiresAt: Date;
  joinedAt: Date;
  lastSeenAt: Date;
  leftAt?: Date;
  kickedAt?: Date;
  kickedBy?: string;
  invitedBy: string;
}

/**
 * Data for creating a new guest
 */
export interface CreateGuestData {
  roomId: string;
  displayName: string;
  email?: string;
  accessTokenHash: string;
  tokenExpiresAt: Date;
  invitedBy: string;
}

/**
 * Data for updating a guest
 */
export interface UpdateGuestData {
  displayName?: string;
  lastSeenAt?: Date;
  leftAt?: Date;
  kickedAt?: Date;
  kickedBy?: string;
}

/**
 * Guest domain service functions
 */
export class GuestDomain {
  /**
   * Validates display name
   */
  static validateDisplayName(displayName: string): void {
    if (!displayName || displayName.trim().length === 0) {
      throw new ValidationError('Display name cannot be empty', 'displayName');
    }
    
    if (displayName.length > 100) {
      throw new ValidationError('Display name cannot exceed 100 characters', 'displayName');
    }
  }

  /**
   * Validates email format if provided
   */
  static validateEmail(email?: string): void {
    if (email) {
      const emailRegex = /^[^@]+@[^@]+\.[^@]+$/;
      if (!emailRegex.test(email)) {
        throw new ValidationError('Invalid email format', 'email');
      }
    }
  }

  /**
   * Checks if guest token is expired
   */
  static isTokenExpired(guest: Guest): boolean {
    return guest.tokenExpiresAt < new Date();
  }

  /**
   * Checks if guest is currently active in room
   */
  static isActive(guest: Guest): boolean {
    return !guest.leftAt && !guest.kickedAt && !this.isTokenExpired(guest);
  }

  /**
   * Checks if guest has left the room
   */
  static hasLeft(guest: Guest): boolean {
    return !!guest.leftAt;
  }

  /**
   * Checks if guest was kicked from the room
   */
  static wasKicked(guest: Guest): boolean {
    return !!guest.kickedAt;
  }

  /**
   * Creates update data for guest leaving room
   */
  static leaveRoom(): UpdateGuestData {
    return {
      leftAt: new Date()
    };
  }

  /**
   * Creates update data for kicking guest from room
   */
  static kickFromRoom(kickedBy: string): UpdateGuestData {
    return {
      kickedAt: new Date(),
      kickedBy
    };
  }

  /**
   * Creates update data for updating last seen timestamp
   */
  static updateLastSeen(): UpdateGuestData {
    return {
      lastSeenAt: new Date()
    };
  }

  /**
   * Generates display name from email if not provided
   */
  static generateDisplayNameFromEmail(email: string): string {
    return email.split('@')[0];
  }

  /**
   * Creates default token expiration (24 hours from now)
   */
  static createDefaultTokenExpiration(): Date {
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
}