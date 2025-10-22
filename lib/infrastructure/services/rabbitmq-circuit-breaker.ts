/**
 * RabbitMQ Circuit Breaker
 * 
 * Implements circuit breaker pattern for RabbitMQ operations to provide
 * resilience against failures and prevent cascading failures.
 */

import { CircuitBreakerConfig } from '../../domain/types/rabbitmq-config.ts';

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Failing fast
  HALF_OPEN = 'half_open' // Testing if service recovered
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  nextAttemptTime?: Date;
  totalRequests: number;
  failureRate: number;
}

/**
 * Circuit breaker for RabbitMQ operations
 */
export class RabbitMQCircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private nextAttemptTime?: Date;
  private totalRequests = 0;
  private windowStart = Date.now();

  constructor(private config: CircuitBreakerConfig) {}

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit breaker should allow the request
    if (!this.canExecute()) {
      throw new Error(`Circuit breaker is ${this.state.toUpperCase()}: operation not allowed`);
    }

    this.totalRequests++;

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Check if operation can be executed based on circuit breaker state
   */
  private canExecute(): boolean {
    const now = Date.now();

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        // Check if enough time has passed to attempt reset
        if (this.nextAttemptTime && now >= this.nextAttemptTime.getTime()) {
          this.state = CircuitBreakerState.HALF_OPEN;
          console.log('🔄 Circuit breaker transitioning to HALF_OPEN');
          return true;
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        // Allow limited requests to test if service recovered
        return true;

      default:
        return false;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.successCount++;
    this.lastSuccessTime = new Date();

    switch (this.state) {
      case CircuitBreakerState.HALF_OPEN:
        // Service appears to be recovered, close the circuit
        this.reset();
        console.log('✅ Circuit breaker CLOSED: service recovered');
        break;

      case CircuitBreakerState.CLOSED:
        // Reset failure count on success in closed state
        this.failureCount = 0;
        break;
    }

    // Reset monitoring window if needed
    this.resetWindowIfNeeded();
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: unknown): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️ Circuit breaker recorded failure: ${errorMessage}`);

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        if (this.shouldOpenCircuit()) {
          this.openCircuit();
        }
        break;

      case CircuitBreakerState.HALF_OPEN:
        // Failure in half-open state means service is still failing
        this.openCircuit();
        break;
    }

    // Reset monitoring window if needed
    this.resetWindowIfNeeded();
  }

  /**
   * Check if circuit should be opened based on failure threshold
   */
  private shouldOpenCircuit(): boolean {
    // Check failure count threshold
    if (this.failureCount >= this.config.failureThreshold) {
      return true;
    }

    // Check failure rate threshold
    const failureRate = this.getFailureRate();
    if (failureRate >= this.config.expectedFailureRate && this.totalRequests >= this.config.failureThreshold) {
      return true;
    }

    return false;
  }

  /**
   * Open the circuit breaker
   */
  private openCircuit(): void {
    this.state = CircuitBreakerState.OPEN;
    this.nextAttemptTime = new Date(Date.now() + this.config.resetTimeout);
    
    console.error(`❌ Circuit breaker OPENED: failure threshold reached (${this.failureCount} failures)`);
    console.log(`⏳ Next attempt allowed at: ${this.nextAttemptTime.toISOString()}`);
  }

  /**
   * Reset circuit breaker to closed state
   */
  private reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.nextAttemptTime = undefined;
    this.windowStart = Date.now();
  }

  /**
   * Reset monitoring window if needed
   */
  private resetWindowIfNeeded(): void {
    const now = Date.now();
    const windowAge = now - this.windowStart;

    if (windowAge >= this.config.monitoringWindow) {
      // Reset counters for new monitoring window
      this.failureCount = 0;
      this.successCount = 0;
      this.totalRequests = 0;
      this.windowStart = now;
    }
  }

  /**
   * Calculate current failure rate
   */
  private getFailureRate(): number {
    if (this.totalRequests === 0) {
      return 0;
    }
    return this.failureCount / this.totalRequests;
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttemptTime: this.nextAttemptTime,
      totalRequests: this.totalRequests,
      failureRate: this.getFailureRate(),
    };
  }

  /**
   * Check if circuit breaker is healthy
   */
  isHealthy(): boolean {
    return this.state === CircuitBreakerState.CLOSED;
  }

  /**
   * Force circuit breaker to open (for testing or manual intervention)
   */
  forceOpen(): void {
    this.openCircuit();
    console.warn('⚠️ Circuit breaker manually forced OPEN');
  }

  /**
   * Force circuit breaker to close (for testing or manual intervention)
   */
  forceClose(): void {
    this.reset();
    console.log('✅ Circuit breaker manually forced CLOSED');
  }

  /**
   * Force circuit breaker to half-open (for testing)
   */
  forceHalfOpen(): void {
    this.state = CircuitBreakerState.HALF_OPEN;
    console.log('🔄 Circuit breaker manually forced HALF_OPEN');
  }
}

/**
 * Circuit breaker with fallback mechanism
 */
export class RabbitMQCircuitBreakerWithFallback<T> extends RabbitMQCircuitBreaker {
  constructor(
    config: CircuitBreakerConfig,
    private fallbackFunction?: () => Promise<T> | T
  ) {
    super(config);
  }

  /**
   * Execute operation with circuit breaker and fallback
   */
  async executeWithFallback(operation: () => Promise<T>): Promise<T> {
    try {
      return await this.execute(operation);
    } catch (error) {
      // If circuit breaker is open and we have a fallback, use it
      if (this.getState() === CircuitBreakerState.OPEN && this.fallbackFunction) {
        console.log('🔄 Circuit breaker OPEN: executing fallback');
        return await this.fallbackFunction();
      }
      throw error;
    }
  }
}

/**
 * Factory function to create circuit breaker
 */
export function createCircuitBreaker(config: CircuitBreakerConfig): RabbitMQCircuitBreaker {
  return new RabbitMQCircuitBreaker(config);
}

/**
 * Factory function to create circuit breaker with fallback
 */
export function createCircuitBreakerWithFallback<T>(
  config: CircuitBreakerConfig,
  fallback?: () => Promise<T> | T
): RabbitMQCircuitBreakerWithFallback<T> {
  return new RabbitMQCircuitBreakerWithFallback(config, fallback);
}