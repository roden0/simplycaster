// ============================================================================
// Async Validation Framework
// SimplyCaster Centralized Form Validation System
// ============================================================================

import type {
  FieldValidator,
  ValidationResult,
  ValidationContext,
  ValidationError,
} from "./types.ts";

// ============================================================================
// Async Validation Types
// ============================================================================

/**
 * Configuration for async validation behavior
 */
export interface AsyncValidationConfig {
  /** Timeout in milliseconds for async validation */
  timeout?: number;
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Initial retry delay in milliseconds */
  retryDelay?: number;
  /** Whether to use exponential backoff for retries */
  exponentialBackoff?: boolean;
  /** Maximum retry delay in milliseconds */
  maxRetryDelay?: number;
  /** Whether to cancel previous validation when new one starts */
  cancelPrevious?: boolean;
}

/**
 * Default async validation configuration
 */
export const DEFAULT_ASYNC_CONFIG: Required<AsyncValidationConfig> = {
  timeout: 10000, // 10 seconds
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  exponentialBackoff: true,
  maxRetryDelay: 8000, // 8 seconds
  cancelPrevious: true,
};

/**
 * Async validation state
 */
export interface AsyncValidationState {
  /** Whether validation is currently running */
  isValidating: boolean;
  /** Current attempt number (0-based) */
  currentAttempt: number;
  /** Validation start time */
  startTime: number;
  /** Abort controller for cancellation */
  abortController: AbortController;
  /** Validation ID for tracking */
  validationId: string;
}

/**
 * Async validation result with additional metadata
 */
export interface AsyncValidationResult<T = any> extends ValidationResult<T> {
  /** Whether the validation was cancelled */
  cancelled?: boolean;
  /** Whether the validation timed out */
  timedOut?: boolean;
  /** Number of retry attempts made */
  retryAttempts?: number;
  /** Total validation duration in milliseconds */
  duration?: number;
  /** Validation ID */
  validationId?: string;
}

/**
 * Network error types for retry logic
 */
export enum NetworkErrorType {
  TIMEOUT = 'timeout',
  CONNECTION_ERROR = 'connection_error',
  SERVER_ERROR = 'server_error',
  RATE_LIMITED = 'rate_limited',
  UNKNOWN = 'unknown',
}

/**
 * Network error with retry information
 */
export class NetworkValidationError extends Error {
  constructor(
    message: string,
    public readonly type: NetworkErrorType,
    public readonly retryable: boolean = true,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'NetworkValidationError';
  }
}

// ============================================================================
// Async Validation Framework
// ============================================================================

/**
 * Async validation framework with timeout, retry, and cancellation support
 */
export class AsyncValidationFramework {
  private activeValidations = new Map<string, AsyncValidationState>();
  private config: Required<AsyncValidationConfig>;

  constructor(config: AsyncValidationConfig = {}) {
    this.config = { ...DEFAULT_ASYNC_CONFIG, ...config };
  }

  /**
   * Execute an async validator with timeout, retry, and cancellation support
   */
  async executeValidator<T>(
    validator: FieldValidator<T>,
    value: T,
    context: ValidationContext,
    config?: Partial<AsyncValidationConfig>
  ): Promise<AsyncValidationResult<T>> {
    const validationConfig = { ...this.config, ...config };
    const validationId = crypto.randomUUID();
    const startTime = Date.now();

    // Cancel previous validation if configured
    if (validationConfig.cancelPrevious && context.fieldPath) {
      this.cancelValidation(context.fieldPath);
    }

    // Create validation state
    const abortController = new AbortController();
    const state: AsyncValidationState = {
      isValidating: true,
      currentAttempt: 0,
      startTime,
      abortController,
      validationId,
    };

    this.activeValidations.set(context.fieldPath, state);

    try {
      const result = await this.executeWithRetry(
        validator,
        value,
        context,
        state,
        validationConfig
      );

      const duration = Date.now() - startTime;
      return {
        ...result,
        duration,
        validationId,
        retryAttempts: state.currentAttempt,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          errors: [],
          cancelled: true,
          duration,
          validationId,
          retryAttempts: state.currentAttempt,
        };
      }

      // Handle timeout
      if (error instanceof NetworkValidationError && error.type === NetworkErrorType.TIMEOUT) {
        return {
          success: false,
          errors: [{
            field: context.fieldPath,
            code: 'validationTimeout',
            message: context.copyManager('validation.timeout') || 
              'Validation timed out. Please try again.',
            params: { timeout: validationConfig.timeout }
          }],
          timedOut: true,
          duration,
          validationId,
          retryAttempts: state.currentAttempt,
        };
      }

      // Handle other network errors
      if (error instanceof NetworkValidationError) {
        return {
          success: false,
          errors: [{
            field: context.fieldPath,
            code: 'networkError',
            message: context.copyManager('validation.networkError') || 
              'Unable to validate. Please check your connection and try again.',
            params: { 
              errorType: error.type,
              statusCode: error.statusCode,
              retryAttempts: state.currentAttempt
            }
          }],
          duration,
          validationId,
          retryAttempts: state.currentAttempt,
        };
      }

      // Handle unexpected errors
      return {
        success: false,
        errors: [{
          field: context.fieldPath,
          code: 'validationError',
          message: context.copyManager('errors.validationError') || 
            'An unexpected error occurred during validation.',
          params: { 
            error: error instanceof Error ? error.message : String(error),
            retryAttempts: state.currentAttempt
          }
        }],
        duration,
        validationId,
        retryAttempts: state.currentAttempt,
      };
    } finally {
      this.activeValidations.delete(context.fieldPath);
    }
  }

  /**
   * Cancel validation for a specific field
   */
  cancelValidation(fieldPath: string): boolean {
    const state = this.activeValidations.get(fieldPath);
    if (state) {
      state.abortController.abort();
      this.activeValidations.delete(fieldPath);
      return true;
    }
    return false;
  }

  /**
   * Cancel all active validations
   */
  cancelAllValidations(): number {
    let cancelledCount = 0;
    for (const [fieldPath, state] of this.activeValidations.entries()) {
      state.abortController.abort();
      cancelledCount++;
    }
    this.activeValidations.clear();
    return cancelledCount;
  }

  /**
   * Get active validation state for a field
   */
  getValidationState(fieldPath: string): AsyncValidationState | undefined {
    return this.activeValidations.get(fieldPath);
  }

  /**
   * Check if validation is active for a field
   */
  isValidating(fieldPath: string): boolean {
    return this.activeValidations.has(fieldPath);
  }

  /**
   * Get all active validation field paths
   */
  getActiveValidations(): string[] {
    return Array.from(this.activeValidations.keys());
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AsyncValidationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Execute validator with retry logic
   */
  private async executeWithRetry<T>(
    validator: FieldValidator<T>,
    value: T,
    context: ValidationContext,
    state: AsyncValidationState,
    config: Required<AsyncValidationConfig>
  ): Promise<ValidationResult<T>> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      state.currentAttempt = attempt;

      try {
        // Check if validation was cancelled
        if (state.abortController.signal.aborted) {
          throw new Error('AbortError');
        }

        // Execute validation with timeout
        const result = await this.executeWithTimeout(
          validator,
          value,
          context,
          state.abortController.signal,
          config.timeout
        );

        // If successful, return result
        if (result.success || !this.shouldRetry(lastError, attempt, config)) {
          return result;
        }

        lastError = new Error('Validation failed');
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry if cancelled or not retryable
        if (state.abortController.signal.aborted || !this.shouldRetry(lastError, attempt, config)) {
          throw lastError;
        }

        // Wait before retry (except on last attempt)
        if (attempt < config.maxRetries) {
          const delay = this.calculateRetryDelay(attempt, config);
          await this.sleep(delay, state.abortController.signal);
        }
      }
    }

    // All retries exhausted
    throw lastError || new Error('Validation failed after all retries');
  }

  /**
   * Execute validator with timeout
   */
  private async executeWithTimeout<T>(
    validator: FieldValidator<T>,
    value: T,
    context: ValidationContext,
    abortSignal: AbortSignal,
    timeout: number
  ): Promise<ValidationResult<T>> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new NetworkValidationError(
          'Validation timed out',
          NetworkErrorType.TIMEOUT,
          true
        ));
      }, timeout);

      // Handle abort signal
      const abortHandler = () => {
        clearTimeout(timeoutId);
        reject(new Error('AbortError'));
      };

      if (abortSignal.aborted) {
        clearTimeout(timeoutId);
        reject(new Error('AbortError'));
        return;
      }

      abortSignal.addEventListener('abort', abortHandler);

      // Execute validator
      Promise.resolve(validator(value, context))
        .then((result) => {
          clearTimeout(timeoutId);
          abortSignal.removeEventListener('abort', abortHandler);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          abortSignal.removeEventListener('abort', abortHandler);
          
          // Convert fetch errors to NetworkValidationError
          if (error instanceof TypeError && error.message.includes('fetch')) {
            reject(new NetworkValidationError(
              'Network connection error',
              NetworkErrorType.CONNECTION_ERROR,
              true
            ));
          } else if (error.name === 'AbortError') {
            reject(error);
          } else {
            reject(this.classifyNetworkError(error));
          }
        });
    });
  }

  /**
   * Determine if an error should trigger a retry
   */
  private shouldRetry(error: Error | undefined, attempt: number, config: Required<AsyncValidationConfig>): boolean {
    if (attempt >= config.maxRetries) {
      return false;
    }

    if (!error) {
      return false;
    }

    if (error.name === 'AbortError') {
      return false;
    }

    if (error instanceof NetworkValidationError) {
      return error.retryable;
    }

    // Retry on network-related errors
    return error.message.includes('fetch') || 
           error.message.includes('network') ||
           error.message.includes('timeout');
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number, config: Required<AsyncValidationConfig>): number {
    if (!config.exponentialBackoff) {
      return config.retryDelay;
    }

    const delay = config.retryDelay * Math.pow(2, attempt);
    return Math.min(delay, config.maxRetryDelay);
  }

  /**
   * Sleep with cancellation support
   */
  private sleep(ms: number, abortSignal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (abortSignal.aborted) {
        reject(new Error('AbortError'));
        return;
      }

      const timeoutId = setTimeout(resolve, ms);
      
      const abortHandler = () => {
        clearTimeout(timeoutId);
        reject(new Error('AbortError'));
      };

      abortSignal.addEventListener('abort', abortHandler, { once: true });
    });
  }

  /**
   * Classify errors into network error types
   */
  private classifyNetworkError(error: any): NetworkValidationError {
    if (error instanceof Response) {
      if (error.status === 429) {
        return new NetworkValidationError(
          'Rate limited',
          NetworkErrorType.RATE_LIMITED,
          true,
          error.status
        );
      } else if (error.status >= 500) {
        return new NetworkValidationError(
          'Server error',
          NetworkErrorType.SERVER_ERROR,
          true,
          error.status
        );
      } else {
        return new NetworkValidationError(
          'HTTP error',
          NetworkErrorType.UNKNOWN,
          false,
          error.status
        );
      }
    }

    if (error instanceof TypeError && error.message.includes('fetch')) {
      return new NetworkValidationError(
        'Network connection error',
        NetworkErrorType.CONNECTION_ERROR,
        true
      );
    }

    return new NetworkValidationError(
      error.message || 'Unknown error',
      NetworkErrorType.UNKNOWN,
      false
    );
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create an async validator wrapper with built-in retry and timeout logic
 */
export function createAsyncValidator<T>(
  validatorFn: (value: T, context: ValidationContext, signal: AbortSignal) => Promise<ValidationResult<T>>,
  config?: AsyncValidationConfig
): FieldValidator<T> {
  const framework = new AsyncValidationFramework(config);

  return async (value: T, context?: ValidationContext): Promise<ValidationResult<T>> => {
    if (!context) {
      throw new Error('Async validators require validation context');
    }

    const wrappedValidator: FieldValidator<T> = async (val, ctx) => {
      const abortSignal = framework.getValidationState(ctx!.fieldPath)?.abortController.signal;
      if (!abortSignal) {
        throw new Error('No abort signal available');
      }
      return validatorFn(val, ctx!, abortSignal);
    };

    const result = await framework.executeValidator(wrappedValidator, value, context, config);
    
    // Convert AsyncValidationResult back to ValidationResult
    return {
      success: result.success,
      data: result.data,
      errors: result.errors,
      warnings: result.warnings,
    };
  };
}

/**
 * Create a debounced async validator
 */
export function createDebouncedAsyncValidator<T>(
  validator: FieldValidator<T>,
  debounceMs: number = 300,
  config?: AsyncValidationConfig
): FieldValidator<T> {
  const framework = new AsyncValidationFramework(config);
  const timeouts = new Map<string, number>();

  return async (value: T, context?: ValidationContext): Promise<ValidationResult<T>> => {
    if (!context) {
      throw new Error('Async validators require validation context');
    }

    const fieldPath = context.fieldPath;

    // Clear existing timeout
    const existingTimeout = timeouts.get(fieldPath);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Cancel existing validation
    framework.cancelValidation(fieldPath);

    // Create debounced promise
    return new Promise((resolve) => {
      const timeoutId = setTimeout(async () => {
        timeouts.delete(fieldPath);
        try {
          const result = await framework.executeValidator(validator, value, context, config);
          resolve({
            success: result.success,
            data: result.data,
            errors: result.errors,
            warnings: result.warnings,
          });
        } catch (error) {
          resolve({
            success: false,
            errors: [{
              field: fieldPath,
              code: 'validationError',
              message: context.copyManager('errors.validationError') || 'Validation failed',
              params: { error: error instanceof Error ? error.message : String(error) }
            }]
          });
        }
      }, debounceMs);

      timeouts.set(fieldPath, timeoutId);
    });
  };
}

// ============================================================================
// Default Framework Instance
// ============================================================================

/**
 * Default global async validation framework instance
 */
export const defaultAsyncFramework = new AsyncValidationFramework();