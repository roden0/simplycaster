// ============================================================================
// User Domain Entity
// ============================================================================

import { BaseEntity, UserRole } from '../types/common.ts';
import { ValidationError } from '../errors/index.ts';

/**
 * User domain entity
 */
export interface User extends BaseEntity {
  email: string;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  lastLoginIp?: string;
}

/**
 * Data for creating a new user
 */
export interface CreateUserData {
  email: string;
  role: UserRole;
  isActive?: boolean;
  emailVerified?: boolean;
}

/**
 * Data for updating a user
 */
export interface UpdateUserData {
  email?: string;
  role?: UserRole;
  isActive?: boolean;
  emailVerified?: boolean;
  failedLoginAttempts?: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  passwordHash?: string;
  passwordSalt?: string;
}

/**
 * User domain service functions
 */
export class UserDomain {
  /**
   * Validates email format
   */
  static validateEmail(email: string): void {
    const emailRegex = /^[^@]+@[^@]+\.[^@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError('Invalid email format', 'email');
    }
  }

  /**
   * Validates user role
   */
  static validateRole(role: UserRole): void {
    if (!Object.values(UserRole).includes(role)) {
      throw new ValidationError('Invalid user role', 'role');
    }
  }

  /**
   * Checks if user account is locked
   */
  static isAccountLocked(user: User): boolean {
    return user.lockedUntil ? user.lockedUntil > new Date() : false;
  }

  /**
   * Checks if user can perform admin actions
   */
  static canPerformAdminActions(user: User): boolean {
    return user.role === UserRole.ADMIN && user.isActive && user.emailVerified;
  }

  /**
   * Checks if user can host rooms
   */
  static canHostRooms(user: User): boolean {
    return (user.role === UserRole.HOST || user.role === UserRole.ADMIN) && 
           user.isActive && user.emailVerified;
  }

  /**
   * Increments failed login attempts
   */
  static incrementFailedAttempts(user: User): UpdateUserData {
    const newAttempts = user.failedLoginAttempts + 1;
    const shouldLock = newAttempts >= 5;
    
    return {
      failedLoginAttempts: newAttempts,
      lockedUntil: shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : undefined // 15 minutes
    };
  }

  /**
   * Resets failed login attempts on successful login
   */
  static resetFailedAttempts(): UpdateUserData {
    return {
      failedLoginAttempts: 0,
      lockedUntil: undefined,
      lastLoginAt: new Date()
    };
  }
}