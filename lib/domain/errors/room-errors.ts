// ============================================================================
// Room Domain Errors
// ============================================================================

import { DomainError, ConflictError, ValidationError, BusinessRuleError } from './base-errors.ts';

/**
 * Room not found error
 */
export class RoomNotFoundError extends DomainError {
  readonly code = 'ROOM_NOT_FOUND';
  readonly statusCode = 404;

  constructor(identifier: string) {
    super(`Room with identifier ${identifier} not found`);
  }
}

/**
 * Room slug already exists error
 */
export class RoomSlugExistsError extends ConflictError {
  constructor(slug: string) {
    super(`Room with slug ${slug} already exists`);
  }
}

/**
 * Room capacity exceeded error
 */
export class RoomCapacityExceededError extends BusinessRuleError {
  constructor(maxParticipants: number) {
    super(`Room capacity of ${maxParticipants} participants exceeded`, 'ROOM_CAPACITY');
  }
}

/**
 * Invalid room status transition error
 */
export class InvalidRoomStatusError extends BusinessRuleError {
  constructor(currentStatus: string, targetStatus: string) {
    super(`Cannot transition room from ${currentStatus} to ${targetStatus}`, 'ROOM_STATUS_TRANSITION');
  }
}

/**
 * Room already recording error
 */
export class RoomAlreadyRecordingError extends BusinessRuleError {
  constructor() {
    super('Room is already recording', 'ROOM_RECORDING_STATE');
  }
}

/**
 * Room not recording error
 */
export class RoomNotRecordingError extends BusinessRuleError {
  constructor() {
    super('Room is not currently recording', 'ROOM_RECORDING_STATE');
  }
}

/**
 * Room closed error
 */
export class RoomClosedError extends BusinessRuleError {
  constructor() {
    super('Room is closed and cannot be accessed', 'ROOM_CLOSED');
  }
}

/**
 * Invalid room configuration error
 */
export class InvalidRoomConfigError extends ValidationError {
  constructor(field: string, message: string) {
    super(message, field);
  }
}