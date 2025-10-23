// ============================================================================
// Core Validation Types and Interfaces
// SimplyCaster Centralized Form Validation System
// ============================================================================

import type { getCopy } from "../copy.ts";

// ============================================================================
// Core Validation Result Types
// ============================================================================

/**
 * Result of a validation operation
 */
export interface ValidationResult<T = any> {
  /** Whether validation passed */
  success: boolean;
  /** Validated data (only present if success is true) */
  data?: T;
  /** Array of validation errors */
  errors: ValidationError[];
  /** Array of validation warnings (non-blocking) */
  warnings?: ValidationWarning[];
}

/**
 * Individual validation error
 */
export interface ValidationError {
  /** Field path that failed validation */
  field: string;
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Parameters used in error message interpolation */
  params?: Record<string, any>;
}

/**
 * Individual validation warning
 */
export interface ValidationWarning {
  /** Field path that generated warning */
  field: string;
  /** Warning code for programmatic handling */
  code: string;
  /** Human-readable warning message */
  message: string;
  /** Parameters used in warning message interpolation */
  params?: Record<string, any>;
}

// ============================================================================
// Validation Context
// ============================================================================

/**
 * Context provided to validators for cross-field validation and error messages
 */
export interface ValidationContext {
  /** Complete form data for cross-field validation */
  formData: Record<string, any>;
  /** Current field path being validated */
  fieldPath: string;
  /** Whether validation is happening during form submission */
  isSubmitting: boolean;
  /** Copy manager function for retrieving error messages */
  copyManager: typeof getCopy;
}

// ============================================================================
// Validator Function Types
// ============================================================================

/**
 * Function that validates a single field value
 */
export type FieldValidator<T = any> = (
  value: T,
  context?: ValidationContext
) => ValidationResult<T> | Promise<ValidationResult<T>>;

/**
 * Function that validates an entire form with cross-field validation
 */
export type FormValidator<T = any> = (
  data: T,
  context?: ValidationContext
) => ValidationResult<T> | Promise<ValidationResult<T>>;

// ============================================================================
// Serializable Validation Schema Types
// ============================================================================

/**
 * Serializable validator definition for client-server communication
 */
export interface SerializableValidator {
  /** Validator type identifier */
  type: string;
  /** Parameters for the validator */
  params?: Record<string, any>;
  /** Custom error message override */
  message?: string;
  /** Whether this validator is asynchronous */
  async?: boolean;
}

/**
 * Schema definition for a single field
 */
export interface FieldValidationSchema {
  /** Array of validators to apply to this field */
  validators: SerializableValidator[];
  /** Whether this field is required */
  required?: boolean;
  /** Fields this field depends on for validation */
  dependsOn?: string[];
}

/**
 * Complete validation schema for a form or data structure
 */
export interface ValidationSchema<T = any> {
  /** Field-level validation definitions */
  fields: Record<keyof T, FieldValidationSchema>;
  /** Form-level validators for cross-field validation */
  formValidators?: SerializableValidator[];
  /** Validation options */
  options?: ValidationOptions;
}

/**
 * Options for validation behavior
 */
export interface ValidationOptions {
  /** Stop validation on first error */
  abortEarly?: boolean;
  /** Remove unknown fields from validated data */
  stripUnknown?: boolean;
  /** Allow unknown fields in validated data */
  allowUnknown?: boolean;
  /** Debounce time in milliseconds for real-time validation */
  debounceMs?: number;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract the data type from a ValidationResult
 */
export type ValidationData<T> = T extends ValidationResult<infer U> ? U : never;

/**
 * Make all fields in a validation schema optional for partial validation
 */
export type PartialValidationSchema<T> = {
  fields: Partial<Record<keyof T, FieldValidationSchema>>;
  formValidators?: SerializableValidator[];
  options?: ValidationOptions;
};

/**
 * Type for validation error codes
 */
export type ValidationErrorCode = 
  | 'required'
  | 'email'
  | 'minLength'
  | 'maxLength'
  | 'pattern'
  | 'min'
  | 'max'
  | 'fileSize'
  | 'fileType'
  | 'password'
  | 'matchField'
  | 'uniqueEmail'
  | 'uniqueSlug'
  | 'custom'
  | string; // Allow custom error codes

/**
 * Type for validation warning codes
 */
export type ValidationWarningCode = 
  | 'passwordWeak'
  | 'fileCorrupted'
  | 'networkError'
  | 'custom'
  | string; // Allow custom warning codes