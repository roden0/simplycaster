// ============================================================================
// ValidatorRegistry - Manages validation functions
// SimplyCaster Centralized Form Validation System
// ============================================================================

import type { FieldValidator } from "./types.ts";

/**
 * Registry for managing validation functions
 */
export class ValidatorRegistry {
  private validators = new Map<string, FieldValidator>();
  private asyncValidators = new Map<string, FieldValidator>();
  private validatorMetadata = new Map<string, ValidatorMetadata>();

  /**
   * Register a synchronous validator
   */
  register(type: string, validator: FieldValidator, metadata?: ValidatorMetadata): void {
    this.validators.set(type, validator);
    
    if (metadata) {
      this.validatorMetadata.set(type, metadata);
    }
  }

  /**
   * Register an asynchronous validator
   */
  registerAsync(type: string, validator: FieldValidator, metadata?: ValidatorMetadata): void {
    this.asyncValidators.set(type, validator);
    
    if (metadata) {
      this.validatorMetadata.set(type, {
        ...metadata,
        async: true
      });
    }
  }

  /**
   * Get a validator by type
   */
  get(type: string): FieldValidator | undefined {
    return this.validators.get(type) || this.asyncValidators.get(type);
  }

  /**
   * Check if a validator exists
   */
  has(type: string): boolean {
    return this.validators.has(type) || this.asyncValidators.has(type);
  }

  /**
   * Check if a validator is asynchronous
   */
  isAsync(type: string): boolean {
    return this.asyncValidators.has(type);
  }

  /**
   * Get validator metadata
   */
  getMetadata(type: string): ValidatorMetadata | undefined {
    return this.validatorMetadata.get(type);
  }

  /**
   * Get all registered validator types
   */
  getRegisteredTypes(): string[] {
    const syncTypes = Array.from(this.validators.keys());
    const asyncTypes = Array.from(this.asyncValidators.keys());
    return [...syncTypes, ...asyncTypes];
  }

  /**
   * Get all synchronous validator types
   */
  getSyncTypes(): string[] {
    return Array.from(this.validators.keys());
  }

  /**
   * Get all asynchronous validator types
   */
  getAsyncTypes(): string[] {
    return Array.from(this.asyncValidators.keys());
  }

  /**
   * Remove a validator
   */
  unregister(type: string): boolean {
    const hadSync = this.validators.delete(type);
    const hadAsync = this.asyncValidators.delete(type);
    this.validatorMetadata.delete(type);
    
    return hadSync || hadAsync;
  }

  /**
   * Clear all validators
   */
  clear(): void {
    this.validators.clear();
    this.asyncValidators.clear();
    this.validatorMetadata.clear();
  }

  /**
   * Register multiple validators at once
   */
  registerBatch(validators: ValidatorRegistration[]): void {
    for (const registration of validators) {
      if (registration.async) {
        this.registerAsync(registration.type, registration.validator, registration.metadata);
      } else {
        this.register(registration.type, registration.validator, registration.metadata);
      }
    }
  }

  /**
   * Get registry statistics
   */
  getStats(): RegistryStats {
    return {
      totalValidators: this.validators.size + this.asyncValidators.size,
      syncValidators: this.validators.size,
      asyncValidators: this.asyncValidators.size,
      validatorsWithMetadata: this.validatorMetadata.size
    };
  }

  /**
   * Validate registry state (for debugging)
   */
  validateRegistry(): RegistryValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check for validators without metadata
    const allTypes = this.getRegisteredTypes();
    for (const type of allTypes) {
      if (!this.validatorMetadata.has(type)) {
        warnings.push(`Validator '${type}' has no metadata`);
      }
    }

    // Check for metadata without validators
    for (const type of this.validatorMetadata.keys()) {
      if (!this.has(type)) {
        issues.push(`Metadata exists for unregistered validator '${type}'`);
      }
    }

    // Check for async/sync mismatches
    for (const [type, metadata] of this.validatorMetadata.entries()) {
      const isActuallyAsync = this.isAsync(type);
      const isMarkedAsync = metadata.async === true;
      
      if (isActuallyAsync !== isMarkedAsync) {
        issues.push(`Validator '${type}' async flag mismatch: registered as ${isActuallyAsync ? 'async' : 'sync'}, metadata says ${isMarkedAsync ? 'async' : 'sync'}`);
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      warnings
    };
  }

  /**
   * Create a snapshot of the current registry state
   */
  createSnapshot(): RegistrySnapshot {
    return {
      validators: new Map(this.validators),
      asyncValidators: new Map(this.asyncValidators),
      metadata: new Map(this.validatorMetadata),
      timestamp: new Date()
    };
  }

  /**
   * Restore registry from a snapshot
   */
  restoreFromSnapshot(snapshot: RegistrySnapshot): void {
    this.validators = new Map(snapshot.validators);
    this.asyncValidators = new Map(snapshot.asyncValidators);
    this.validatorMetadata = new Map(snapshot.metadata);
  }
}

// ============================================================================
// Supporting Types
// ============================================================================

/**
 * Metadata for a validator
 */
export interface ValidatorMetadata {
  /** Human-readable description */
  description?: string;
  /** Whether the validator is asynchronous */
  async?: boolean;
  /** Expected parameter schema */
  parameterSchema?: Record<string, any>;
  /** Example usage */
  examples?: string[];
  /** Version of the validator */
  version?: string;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Validator registration configuration
 */
export interface ValidatorRegistration {
  /** Validator type identifier */
  type: string;
  /** Validator function */
  validator: FieldValidator;
  /** Whether the validator is asynchronous */
  async?: boolean;
  /** Optional metadata */
  metadata?: ValidatorMetadata;
}

/**
 * Registry statistics
 */
export interface RegistryStats {
  /** Total number of registered validators */
  totalValidators: number;
  /** Number of synchronous validators */
  syncValidators: number;
  /** Number of asynchronous validators */
  asyncValidators: number;
  /** Number of validators with metadata */
  validatorsWithMetadata: number;
}

/**
 * Registry validation result
 */
export interface RegistryValidationResult {
  /** Whether the registry is in a valid state */
  isValid: boolean;
  /** Critical issues that need to be fixed */
  issues: string[];
  /** Non-critical warnings */
  warnings: string[];
}

/**
 * Registry snapshot for backup/restore
 */
export interface RegistrySnapshot {
  /** Synchronous validators */
  validators: Map<string, FieldValidator>;
  /** Asynchronous validators */
  asyncValidators: Map<string, FieldValidator>;
  /** Validator metadata */
  metadata: Map<string, ValidatorMetadata>;
  /** Snapshot timestamp */
  timestamp: Date;
}

// ============================================================================
// Default Registry Instance
// ============================================================================

/**
 * Default global validator registry instance
 */
export const defaultValidatorRegistry = new ValidatorRegistry();

// Note: Built-in validators are registered lazily when first accessed
// to avoid circular dependencies. See registerBuiltInValidators in validators.ts