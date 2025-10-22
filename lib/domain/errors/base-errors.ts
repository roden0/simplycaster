// ============================================================================
// Base Domain Error Types
// ============================================================================

/**
 * Base domain error class
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Entity not found error
 */
export class EntityNotFoundError extends DomainError {
  readonly code = 'ENTITY_NOT_FOUND';
  readonly statusCode = 404;

  constructor(entityType: string, identifier: string | Record<string, unknown>) {
    const id = typeof identifier === 'string' ? identifier : JSON.stringify(identifier);
    super(`${entityType} with identifier ${id} not found`);
  }
}

/**
 * Validation error for domain rules
 */
export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;

  constructor(message: string, public readonly field?: string) {
    super(message);
  }
}

/**
 * Business rule violation error
 */
export class BusinessRuleError extends DomainError {
  readonly code = 'BUSINESS_RULE_VIOLATION';
  readonly statusCode = 422;

  constructor(message: string, public readonly rule?: string) {
    super(message);
  }
}

/**
 * Authorization error
 */
export class AuthorizationError extends DomainError {
  readonly code = 'AUTHORIZATION_ERROR';
  readonly statusCode = 403;

  constructor(message: string = 'Access denied') {
    super(message);
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends DomainError {
  readonly code = 'AUTHENTICATION_ERROR';
  readonly statusCode = 401;

  constructor(message: string = 'Authentication required') {
    super(message);
  }
}

/**
 * Conflict error (e.g., duplicate resources)
 */
export class ConflictError extends DomainError {
  readonly code = 'CONFLICT_ERROR';
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
  }
}

/**
 * Infrastructure error (database, external services, etc.)
 */
export class InfrastructureError extends DomainError {
  readonly code = 'INFRASTRUCTURE_ERROR';
  readonly statusCode = 500;

  constructor(message: string, public readonly originalError?: Error) {
    super(message);
  }
}