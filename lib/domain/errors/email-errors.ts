// ============================================================================
// Email Domain Error Types
// ============================================================================

import { DomainError } from './base-errors.ts';

/**
 * Email configuration error
 */
export class EmailConfigurationError extends DomainError {
  readonly code = 'EMAIL_CONFIGURATION_ERROR';
  readonly statusCode = 500;

  constructor(message: string, public readonly configField?: string) {
    super(message);
  }
}

/**
 * Email template error
 */
export class EmailTemplateError extends DomainError {
  readonly code = 'EMAIL_TEMPLATE_ERROR';
  readonly statusCode = 400;

  constructor(message: string, public readonly templateId?: string) {
    super(message);
  }
}

/**
 * Email template not found error
 */
export class EmailTemplateNotFoundError extends DomainError {
  readonly code = 'EMAIL_TEMPLATE_NOT_FOUND';
  readonly statusCode = 404;

  constructor(templateId: string) {
    super(`Email template '${templateId}' not found`);
  }
}

/**
 * Email template rendering error
 */
export class EmailTemplateRenderingError extends DomainError {
  readonly code = 'EMAIL_TEMPLATE_RENDERING_ERROR';
  readonly statusCode = 500;

  constructor(message: string, public readonly templateId?: string, public readonly variable?: string) {
    super(message);
  }
}

/**
 * Email validation error
 */
export class EmailValidationError extends DomainError {
  readonly code = 'EMAIL_VALIDATION_ERROR';
  readonly statusCode = 400;

  constructor(message: string, public readonly field?: string) {
    super(message);
  }
}

/**
 * Email provider error
 */
export class EmailProviderError extends DomainError {
  readonly code = 'EMAIL_PROVIDER_ERROR';
  readonly statusCode = 502;

  constructor(message: string, public readonly provider?: string, public readonly originalError?: Error) {
    super(message);
  }
}

/**
 * Email sending error
 */
export class EmailSendingError extends DomainError {
  readonly code = 'EMAIL_SENDING_ERROR';
  readonly statusCode = 500;

  constructor(message: string, public readonly correlationId?: string, public readonly originalError?: Error) {
    super(message);
  }
}

/**
 * Email rate limit error
 */
export class EmailRateLimitError extends DomainError {
  readonly code = 'EMAIL_RATE_LIMIT_ERROR';
  readonly statusCode = 429;

  constructor(message: string = 'Email rate limit exceeded', public readonly retryAfter?: number) {
    super(message);
  }
}

/**
 * Email queue error
 */
export class EmailQueueError extends DomainError {
  readonly code = 'EMAIL_QUEUE_ERROR';
  readonly statusCode = 500;

  constructor(message: string, public readonly queueName?: string, public readonly originalError?: Error) {
    super(message);
  }
}

/**
 * Email attachment error
 */
export class EmailAttachmentError extends DomainError {
  readonly code = 'EMAIL_ATTACHMENT_ERROR';
  readonly statusCode = 400;

  constructor(message: string, public readonly filename?: string) {
    super(message);
  }
}

/**
 * Email service unavailable error
 */
export class EmailServiceUnavailableError extends DomainError {
  readonly code = 'EMAIL_SERVICE_UNAVAILABLE';
  readonly statusCode = 503;

  constructor(message: string = 'Email service is temporarily unavailable', public readonly provider?: string) {
    super(message);
  }
}