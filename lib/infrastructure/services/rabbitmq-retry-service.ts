/**
 * RabbitMQ Retry Service
 * 
 * Implements configurable retry logic with exponential backoff for failed
 * event publishing operations. Includes retryable vs non-retryable error
 * classification and retry state tracking.
 */

import { DomainEvent } from '../../domain/types/events.ts';

/**
 * Retry configuration interface
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  
  /** Base delay in milliseconds for first retry */
  baseDelay: number;
  
  /** Maximum delay in milliseconds between retries */
  maxDelay: number;
  
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  
  /** Jitter factor to add randomness (0-1) */
  jitterFactor: number;
  
  /** List of error types/messages that should be retried */
  retryableErrors: string[];
  
  /** List of error types/messages that should NOT be retried */
  nonRetryableErrors: string[];
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  retryableErrors: [
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNRESET',
    'Connection closed',
    'Channel closed',
    'Publish confirmation timeout',
    'Circuit breaker is OPEN',
  ],
  nonRetryableErrors: [
    'Event validation failed',
    'Event serialization failed',
    'Invalid routing key',
    'Exchange not found',
    'Queue not found',
    'Authentication failed',
    'Authorization failed',
  ],
};

/**
 * Retry attempt information
 */
export interface RetryAttempt {
  attemptNumber: number;
  delay: number;
  error: Error;
  timestamp: Date;
}

/**
 * Retry state for tracking retry attempts
 */
export interface RetryState {
  event: DomainEvent;
  attempts: RetryAttempt[];
  nextRetryAt?: Date;
  isRetryable: boolean;
  finalError?: Error;
}

/**
 * Retry result
 */
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDelay: number;
  retryState: RetryState;
}

/**
 * RabbitMQ Retry Service with exponential backoff
 */
export class RabbitMQRetryService {
  private retryStates = new Map<string, RetryState>();

  constructor(private config: RetryConfig = DEFAULT_RETRY_CONFIG) {}

  /**
   * Execute operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    event: DomainEvent,
    operationName = 'operation'
  ): Promise<RetryResult<T>> {
    const retryState: RetryState = {
      event,
      attempts: [],
      isRetryable: true,
    };

    this.retryStates.set(event.id, retryState);

    let lastError: Error;
    let totalDelay = 0;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        console.log(`🔄 Attempting ${operationName} for event ${event.type} (${event.id}) - attempt ${attempt}/${this.config.maxAttempts}`);
        
        const result = await operation();
        
        // Success - clean up retry state
        this.retryStates.delete(event.id);
        
        console.log(`✅ ${operationName} succeeded for event ${event.type} (${event.id}) after ${attempt} attempts`);
        
        return {
          success: true,
          result,
          attempts: attempt,
          totalDelay,
          retryState,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        const retryAttempt: RetryAttempt = {
          attemptNumber: attempt,
          delay: 0,
          error: lastError,
          timestamp: new Date(),
        };

        retryState.attempts.push(retryAttempt);

        // Check if error is retryable
        const isRetryable = this.isRetryableError(lastError);
        retryState.isRetryable = isRetryable;

        console.warn(`⚠️ ${operationName} failed for event ${event.type} (${event.id}) - attempt ${attempt}/${this.config.maxAttempts}: ${lastError.message}`);

        // If not retryable or last attempt, fail immediately
        if (!isRetryable || attempt === this.config.maxAttempts) {
          retryState.finalError = lastError;
          
          if (!isRetryable) {
            console.error(`❌ ${operationName} failed with non-retryable error for event ${event.type} (${event.id}): ${lastError.message}`);
          } else {
            console.error(`❌ ${operationName} failed after ${this.config.maxAttempts} attempts for event ${event.type} (${event.id}): ${lastError.message}`);
          }
          
          break;
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt);
        retryAttempt.delay = delay;
        totalDelay += delay;

        retryState.nextRetryAt = new Date(Date.now() + delay);

        console.log(`⏳ Retrying ${operationName} for event ${event.type} (${event.id}) in ${delay}ms (attempt ${attempt + 1}/${this.config.maxAttempts})`);

        // Wait before next attempt
        await this.sleep(delay);
      }
    }

    // All attempts failed
    return {
      success: false,
      error: lastError!,
      attempts: this.config.maxAttempts,
      totalDelay,
      retryState,
    };
  }

  /**
   * Check if an error should be retried
   */
  private isRetryableError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    const errorName = error.name.toLowerCase();

    // Check non-retryable errors first (higher priority)
    for (const nonRetryableError of this.config.nonRetryableErrors) {
      if (errorMessage.includes(nonRetryableError.toLowerCase()) ||
          errorName.includes(nonRetryableError.toLowerCase())) {
        return false;
      }
    }

    // Check retryable errors
    for (const retryableError of this.config.retryableErrors) {
      if (errorMessage.includes(retryableError.toLowerCase()) ||
          errorName.includes(retryableError.toLowerCase())) {
        return true;
      }
    }

    // Default: network-related errors are retryable, others are not
    const networkErrors = ['econnrefused', 'enotfound', 'etimedout', 'econnreset', 'socket'];
    return networkErrors.some(networkError => 
      errorMessage.includes(networkError) || errorName.includes(networkError)
    );
  }

  /**
   * Calculate delay for retry attempt with exponential backoff and jitter
   */
  private calculateDelay(attemptNumber: number): number {
    // Calculate exponential backoff delay
    const exponentialDelay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attemptNumber - 1);
    
    // Apply maximum delay limit
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * this.config.jitterFactor * Math.random();
    const finalDelay = cappedDelay + jitter;
    
    return Math.round(finalDelay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get retry state for an event
   */
  getRetryState(eventId: string): RetryState | undefined {
    return this.retryStates.get(eventId);
  }

  /**
   * Get all active retry states
   */
  getAllRetryStates(): Map<string, RetryState> {
    return new Map(this.retryStates);
  }

  /**
   * Clear retry state for an event
   */
  clearRetryState(eventId: string): boolean {
    return this.retryStates.delete(eventId);
  }

  /**
   * Clear all retry states
   */
  clearAllRetryStates(): void {
    this.retryStates.clear();
  }

  /**
   * Get retry statistics
   */
  getRetryStats() {
    const states = Array.from(this.retryStates.values());
    
    const totalEvents = states.length;
    const retryableEvents = states.filter(s => s.isRetryable).length;
    const nonRetryableEvents = totalEvents - retryableEvents;
    
    const totalAttempts = states.reduce((sum, state) => sum + state.attempts.length, 0);
    const averageAttempts = totalEvents > 0 ? totalAttempts / totalEvents : 0;
    
    const eventsWithFinalError = states.filter(s => s.finalError).length;
    
    return {
      totalEvents,
      retryableEvents,
      nonRetryableEvents,
      totalAttempts,
      averageAttempts: Math.round(averageAttempts * 100) / 100,
      eventsWithFinalError,
      successRate: totalEvents > 0 ? ((totalEvents - eventsWithFinalError) / totalEvents) * 100 : 0,
      config: this.config,
    };
  }

  /**
   * Update retry configuration
   */
  updateConfig(newConfig: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('🔧 Retry configuration updated:', this.config);
  }

  /**
   * Check if retry service is healthy
   */
  isHealthy(): boolean {
    // Consider unhealthy if too many events are stuck in retry
    const retryStates = this.getAllRetryStates();
    const maxStuckEvents = 100; // Configurable threshold
    
    return retryStates.size < maxStuckEvents;
  }
}

/**
 * Factory function to create retry service
 */
export function createRetryService(config?: Partial<RetryConfig>): RabbitMQRetryService {
  const finalConfig = config ? { ...DEFAULT_RETRY_CONFIG, ...config } : DEFAULT_RETRY_CONFIG;
  return new RabbitMQRetryService(finalConfig);
}

/**
 * Utility function to create retry-enabled operation
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  event: DomainEvent,
  retryService: RabbitMQRetryService,
  operationName?: string
): Promise<T> {
  const result = await retryService.executeWithRetry(operation, event, operationName);
  
  if (result.success && result.result !== undefined) {
    return result.result;
  }
  
  throw result.error || new Error('Operation failed after all retry attempts');
}