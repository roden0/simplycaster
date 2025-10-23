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

// Schema builder
export {
  SchemaBuilder,
  createSchema,
  defineSchema,
  type SchemaStats,
} from "./schema-builder.ts";

// Predefined schemas
export {
  // Schema definitions
  userRegistrationSchema,
  episodeUploadSchema,
  roomCreationSchema,
  guestInviteSchema,
  loginSchema,
  passwordResetSchema,
  passwordChangeSchema,
  
  // Schema registry
  validationSchemas,
  getValidationSchema,
  getSchemaNames,
  hasSchema,
  
  // Schema utilities
  createUpdateSchema,
  createPartialSchema,
  
  // Types
  type UserRegistrationData,
  type EpisodeUploadData,
  type RoomCreationData,
  type GuestInviteData,
  type LoginData,
  type PasswordResetData,
  type PasswordChangeData,
  type SchemaName,
} from "./schemas.ts";

// Built-in validators
export {
  // Basic validators
  requiredValidator,
  emailValidator,
  minLengthValidator,
  maxLengthValidator,
  patternValidator,
  minValidator,
  maxValidator,
  
  // File validators
  fileSizeValidator,
  fileTypeValidator,
  multipleFileTypeValidator,
  fileExtensionValidator,
  
  // Password validators
  passwordValidator,
  matchFieldValidator,
  calculatePasswordStrength,
  
  // Factory functions
  createMinLengthValidator,
  createMaxLengthValidator,
  createPatternValidator,
  createMinValidator,
  createMaxValidator,
  createFileSizeValidator,
  createFileTypeValidator,
  createMultipleFileTypeValidator,
  createFileExtensionValidator,
  createPasswordValidator,
  createMatchFieldValidator,
  
  // Registration functions
  registerBuiltInValidators,
  createRegistryWithBuiltIns,
  
  // Types
  type PasswordRequirements,
} from "./validators.ts";

// Client-side hooks for Preact
export {
  useFormValidation,
  useFieldValidation,
  useAsyncFieldValidation,
  useEnhancedAsyncFieldValidation,
} from "./hooks.ts";

// Async validation framework
export type {
  AsyncValidationConfig,
  AsyncValidationState,
  AsyncValidationResult,
  NetworkErrorType,
} from "./async-validation.ts";

export {
  AsyncValidationFramework,
  NetworkValidationError,
  createAsyncValidator,
  createDebouncedAsyncValidator,
  defaultAsyncFramework,
  DEFAULT_ASYNC_CONFIG,
} from "./async-validation.ts";

// Async validators
export {
  uniqueEmailValidator,
  createUniqueSlugValidator,
  uniqueRoomSlugValidator,
  uniqueEpisodeSlugValidator,
  asyncFileValidator,
  usernameAvailabilityValidator,
  createUniqueSlugValidatorFactory,
  createAsyncFileValidatorFactory,
  registerAsyncValidators,
} from "./async-validators.ts";

// Async validation UI components
export type {
  AsyncValidationLoadingProps,
  AsyncValidationProgressProps,
  AsyncValidationErrorProps,
  AsyncValidationStatusProps,
  AsyncValidationFieldProps,
} from "./async-ui-components.tsx";

export {
  AsyncValidationLoading,
  AsyncValidationProgress,
  AsyncValidationError,
  AsyncValidationStatus,
  AsyncValidationField,
  useAsyncValidationProgress,
  useAsyncValidationRetry,
} from "./async-ui-components.tsx";

// Form integration utilities
export {
  // Types
  type ValidatedFieldProps,
  type ValidatedFormProps,
  
  // Field binding utilities
  createFieldProps,
  createFormProps,
  
  // Fresh form integration
  extractFormData,
  formatErrorsForFresh,
  createValidationHandler,
  
  // Accessibility helpers
  createAccessibilityProps,
  createErrorElement,
  createDescriptionElement,
  
  // Validation state binding
  bindValidationToSignals,
  createFieldBinding,
  
  // Component factories
  createValidatedInput,
  createValidatedTextarea,
  createValidatedSelect,
  
  // Pre-built components
  ValidatedTextInput,
  ValidatedEmailInput,
  ValidatedPasswordInput,
  ValidatedNumberInput,
  ValidatedTextarea,
  ValidatedSelect,
} from "./form-utils.tsx";

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
// Server-Side Validation
// ============================================================================

// Server-side validation middleware
export type {
  ValidationMiddlewareOptions,
  ValidatedRequest,
  ValidationErrorResponse,
  ValidationSuccessResponse,
} from "./server-middleware.ts";

export {
  createValidationMiddleware,
  validateRequestBody,
  createErrorResponse,
  createSuccessResponse,
  parseRequestBody,
  validateJSON,
  validateFormData,
  validateMultipartData,
} from "./server-middleware.ts";

// API validation utilities
export type {
  APIValidationOptions,
  FileValidationOptions,
  SanitizationResult,
} from "./api-utils.ts";

export {
  validateAPIRequest,
  validateFileUploads,
  validateSingleFile,
  validateFileContent,
  sanitizeRequestData,
  sanitizeHTML,
  sanitizeSQL,
  createAPIErrorResponse,
  createAPISuccessResponse,
  commonFileValidation,
  audioFileValidation,
  imageFileValidation,
} from "./api-utils.ts";

// ============================================================================
// Copy Management Integration
// ============================================================================

// Validation copy utilities
export type {
  ValidationMessageContext,
  ExtendedValidationContext,
} from "./copy-utils.ts";

export {
  getValidationMessage,
  getParameterizedValidationMessage,
  getFieldValidationMessage,
  formatValidationError,
  getContextValidationMessages,
  getCustomValidationMessage,
  buildValidationContext,
  getAsyncValidationMessage,
  getServerValidationMessage,
  getConditionalValidationMessage,
  getArrayValidationMessage,
  getFileValidationMessage,
  validationMessages,
  validationCopy,
} from "./copy-utils.ts";

// ============================================================================
// Utility Functions
// ============================================================================

import type { ValidationResult } from "./types.ts";

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