// ============================================================================
// Recording Domain Errors
// ============================================================================

import { DomainError, BusinessRuleError, ValidationError } from './base-errors.ts';

/**
 * Recording not found error
 */
export class RecordingNotFoundError extends DomainError {
  readonly code = 'RECORDING_NOT_FOUND';
  readonly statusCode = 404;

  constructor(identifier: string) {
    super(`Recording with identifier ${identifier} not found`);
  }
}

/**
 * Recording already started error
 */
export class RecordingAlreadyStartedError extends BusinessRuleError {
  constructor() {
    super('Recording has already been started', 'RECORDING_STATE');
  }
}

/**
 * Recording not started error
 */
export class RecordingNotStartedError extends BusinessRuleError {
  constructor() {
    super('Recording has not been started', 'RECORDING_STATE');
  }
}

/**
 * Recording already stopped error
 */
export class RecordingAlreadyStoppedError extends BusinessRuleError {
  constructor() {
    super('Recording has already been stopped', 'RECORDING_STATE');
  }
}

/**
 * Invalid recording status error
 */
export class InvalidRecordingStatusError extends BusinessRuleError {
  constructor(currentStatus: string, targetStatus: string) {
    super(`Cannot transition recording from ${currentStatus} to ${targetStatus}`, 'RECORDING_STATUS_TRANSITION');
  }
}

/**
 * Recording file error
 */
export class RecordingFileError extends ValidationError {
  constructor(message: string, fileName?: string) {
    super(message, fileName ? `file.${fileName}` : 'file');
  }
}

/**
 * Recording processing error
 */
export class RecordingProcessingError extends DomainError {
  readonly code = 'RECORDING_PROCESSING_ERROR';
  readonly statusCode = 422;

  constructor(message: string, public readonly processingStage?: string) {
    super(message);
  }
}