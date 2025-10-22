// ============================================================================
// User Domain Errors
// ============================================================================

import { DomainError, ConflictError, ValidationError, AuthenticationError } from './base-errors.ts';

/**
 * User not found error
 */
export class UserNotFoundError extends DomainError {
  readonly code = 'USER_NOT_FOUND';
  readonly statusCode = 404;

  constructor(identifier: string) {
    super(`User with identifier ${identifier} not found`);
  }
}

/**
 * Email already exists error
 */
export class EmailAlreadyExistsError extends ConflictError {
  constructor(email: string) {
    super(`User with email ${email} already exists`);
  }
}

/**
 * Invalid password error
 */
export class InvalidPasswordError extends ValidationError {
  constructor(message: string = 'Invalid password format') {
    super(message, 'password');
  }
}

/**
 * Invalid credentials error
 */
export class InvalidCredentialsError extends AuthenticationError {
  constructor() {
    super('Invalid email or password');
  }
}

/**
 * Account locked error
 */
export class AccountLockedError extends AuthenticationError {
  constructor(lockedUntil: Date) {
    super(`Account is locked until ${lockedUntil.toISOString()}`);
  }
}

/**
 * Email not verified error
 */
export class EmailNotVerifiedError extends AuthenticationError {
  constructor() {
    super('Email address must be verified before login');
  }
}

/**
 * User inactive error
 */
export class UserInactiveError extends AuthenticationError {
  constructor() {
    super('User account is inactive');
  }
}