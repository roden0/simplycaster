// ============================================================================
// Validation System - Main Export
// SimplyCaster Centralized Form Validation System
// ============================================================================

// Core types and interfaces
export type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationContext,
  FieldValidator,
  FormValidator,
  SerializableValidator,
  FieldValidationSchema,
  ValidationSchema,
  ValidationOptions,
  ValidationData,
  PartialValidationSchema,
  ValidationErrorCode,
  ValidationWarningCode,
} from "./types.ts";

// Validation engine
export { ValidationEngine } from "./engine.ts";

// Validator registry
export {
  ValidatorRegistry,
  defaultValidatorRegistry,
  type ValidatorMetadata,
  type ValidatorRegistration,
  type RegistryStats,
  type RegistryValidationResult,
  type RegistrySnapshot,
} from "./registry.ts";

// ============================================================================
// Convenience Factory Functions
// ============================================================================

import { ValidationEngine } from "./engine.ts";
import { ValidatorRegistry, defaultValidatorRegistry } from "./registry.ts";
import { getCopy } from "../copy.ts";

/**
 * Create a new validation engine with the default registry
 */
export function createValidationEngine(
  copyManager: typeof getCopy = getCopy,
  registry: ValidatorRegistry = defaultValidatorRegistry
): ValidationEngine {
  return new ValidationEngine(copyManager, registry);
}

/**
 * Create a new validator registry
 */
export function createValidatorRegistry(): ValidatorRegistry {
  return new ValidatorRegistry();
}

/**
 * Get the default validation engine instance
 */
let defaultEngine: ValidationEngine | null = null;

export function getDefaultValidationEngine(): ValidationEngine {
  if (!defaultEngine) {
    defaultEngine = createValidationEngine();
  }
  return defaultEngine;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a simple validation result for success
 */
export function createSuccessResult<T>(data: T): ValidationResult<T> {
  return {
    success: true,
    data,
    errors: [],
    warnings: []
  };
}

/**
 * Create a simple validation result for failure
 */
export function createErrorResult<T>(
  field: string,
  code: string,
  message: string,
  params?: Record<string, any>
): ValidationResult<T> {
  return {
    success: false,
    errors: [{
      field,
      code,
      message,
      params
    }],
    warnings: []
  };
}

/**
 * Combine multiple validation results
 */
export function combineValidationResults<T>(
  results: ValidationResult<T>[]
): ValidationResult<T[]> {
  const allErrors = results.flatMap(r => r.errors);
  const allWarnings = results.flatMap(r => r.warnings || []);
  const allData = results
    .filter(r => r.success && r.data !== undefined)
    .map(r => r.data!);

  return {
    success: allErrors.length === 0,
    data: allErrors.length === 0 ? allData : undefined,
    errors: allErrors,
    warnings: allWarnings
  };
}