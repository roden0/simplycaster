// ============================================================================
// Test Utilities and Data Builders
// SimplyCaster Centralized Form Validation System
// ============================================================================

import { ValidationEngine } from "./engine.ts";
import { ValidatorRegistry } from "./registry.ts";
import { registerBuiltInValidators } from "./validators.ts";
import { SchemaBuilder } from "./schema-builder.ts";
import { getCopy } from "../copy.ts";
import type {
  ValidationContext,
  ValidationSchema,
  FieldValidationSchema,
  ValidationResult,
  ValidationError,
} from "./types.ts";

// ============================================================================
// Test Engine Factory
// ============================================================================

/**
 * Creates a validation engine with all built-in validators for testing
 */
export function createTestValidationEngine(): ValidationEngine {
  const registry = new ValidatorRegistry();
  registerBuiltInValidators(registry);
  return new ValidationEngine(getCopy, registry);
}

/**
 * Creates a minimal validation engine for isolated testing
 */
export function createMinimalValidationEngine(): ValidationEngine {
  const registry = new ValidatorRegistry();
  return new ValidationEngine(getCopy, registry);
}

// ============================================================================
// Context Builders
// ============================================================================

/**
 * Creates a mock validation context for testing
 */
export function createMockContext(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    formData: {},
    fieldPath: 'testField',
    isSubmitting: false,
    copyManager: getCopy,
    ...overrides
  };
}

/**
 * Creates a validation context with form data
 */
export function createContextWithFormData(
  formData: Record<string, any>,
  fieldPath: string = 'testField'
): ValidationContext {
  return createMockContext({ formData, fieldPath });
}

/**
 * Creates a validation context for submitting state
 */
export function createSubmittingContext(
  formData: Record<string, any> = {},
  fieldPath: string = 'testField'
): ValidationContext {
  return createMockContext({ formData, fieldPath, isSubmitting: true });
}

// ============================================================================
// Schema Builders
// ============================================================================

/**
 * Creates a simple required field schema
 */
export function createRequiredFieldSchema(): FieldValidationSchema {
  return {
    validators: [{ type: 'required' }],
    required: true
  };
}

/**
 * Creates an email field schema
 */
export function createEmailFieldSchema(required: boolean = true): FieldValidationSchema {
  return {
    validators: [
      ...(required ? [{ type: 'required' }] : []),
      { type: 'email' }
    ],
    required
  };
}

/**
 * Creates a password field schema
 */
export function createPasswordFieldSchema(): FieldValidationSchema {
  return {
    validators: [
      { type: 'required' },
      { type: 'minLength', params: { min: 8 } },
      { type: 'password' }
    ],
    required: true
  };
}

/**
 * Creates a simple user registration schema
 */
export function createUserRegistrationSchema(): ValidationSchema<{
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
}> {
  return SchemaBuilder.create<{
    email: string;
    password: string;
    confirmPassword: string;
    fullName: string;
  }>()
    .field('email', [
      { type: 'required' },
      { type: 'email' }
    ], { required: true })
    .field('password', [
      { type: 'required' },
      { type: 'minLength', params: { min: 8 } }
    ], { required: true })
    .field('confirmPassword', [
      { type: 'required' },
      { type: 'matchField', params: { field: 'password' } }
    ], { required: true })
    .field('fullName', [
      { type: 'required' },
      { type: 'minLength', params: { min: 2 } }
    ], { required: true })
    .build();
}

/**
 * Creates a file upload schema
 */
export function createFileUploadSchema(): ValidationSchema<{
  title: string;
  file: File;
  description?: string;
}> {
  return SchemaBuilder.create<{
    title: string;
    file: File;
    description?: string;
  }>()
    .field('title', [
      { type: 'required' },
      { type: 'minLength', params: { min: 1 } },
      { type: 'maxLength', params: { max: 200 } }
    ], { required: true })
    .field('file', [
      { type: 'required' },
      { type: 'fileSize', params: { maxSize: 10 * 1024 * 1024 } }, // 10MB
      { type: 'fileType', params: { types: ['audio/mpeg', 'audio/ogg', 'audio/wav'] } }
    ], { required: true })
    .field('description', [
      { type: 'maxLength', params: { max: 1000 } }
    ])
    .build();
}

// ============================================================================
// Data Builders
// ============================================================================

/**
 * Creates valid user registration data
 */
export function createValidUserData(): {
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
} {
  return {
    email: 'test@example.com',
    password: 'SecurePass123',
    confirmPassword: 'SecurePass123',
    fullName: 'John Doe'
  };
}

/**
 * Creates invalid user registration data
 */
export function createInvalidUserData(): {
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
} {
  return {
    email: 'invalid-email',
    password: 'weak',
    confirmPassword: 'different',
    fullName: 'J'
  };
}

/**
 * Creates a mock file for testing
 */
export function createMockFile(
  name: string = 'test.mp3',
  content: string = 'mock audio content',
  type: string = 'audio/mpeg'
): File {
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
}

/**
 * Creates valid file upload data
 */
export function createValidFileUploadData(): {
  title: string;
  file: File;
  description?: string;
} {
  return {
    title: 'Test Episode',
    file: createMockFile(),
    description: 'A test episode for validation'
  };
}

/**
 * Creates invalid file upload data
 */
export function createInvalidFileUploadData(): {
  title: string;
  file: File;
  description?: string;
} {
  return {
    title: '', // Empty title
    file: createMockFile('test.txt', 'text content', 'text/plain'), // Wrong type
    description: 'x'.repeat(1001) // Too long
  };
}

// ============================================================================
// Validation Result Builders
// ============================================================================

/**
 * Creates a successful validation result
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
 * Creates a failed validation result
 */
export function createFailureResult<T>(errors: ValidationError[]): ValidationResult<T> {
  return {
    success: false,
    errors,
    warnings: []
  };
}

/**
 * Creates a validation error
 */
export function createValidationError(
  field: string,
  code: string,
  message: string,
  params: Record<string, any> = {}
): ValidationError {
  return {
    field,
    code,
    message,
    params
  };
}

// ============================================================================
// Mock Utilities
// ============================================================================

/**
 * Creates a mock fetch function for testing async validators
 */
export function createMockFetch(responses: Record<string, any>): typeof fetch {
  return async (url: string | URL | Request, init?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url.toString();
    
    for (const [pattern, response] of Object.entries(responses)) {
      if (urlString.includes(pattern)) {
        if (response instanceof Error) {
          throw response;
        }
        
        if (typeof response === 'function') {
          const result = response(urlString, init);
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        return new Response(JSON.stringify(response.body || response), {
          status: response.status || 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  };
}

/**
 * Creates a mock Request object for server-side testing
 */
export function createMockRequest(
  body: any,
  contentType: string = "application/json",
  method: string = "POST"
): Request {
  const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request("http://localhost/test", {
    method,
    headers: {
      "Content-Type": contentType
    },
    body: bodyString
  });
}

/**
 * Creates a mock FormData request
 */
export function createMockFormDataRequest(data: Record<string, string | File>): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(data)) {
    formData.append(key, value);
  }
  
  return new Request("http://localhost/test", {
    method: "POST",
    body: formData
  });
}

// ============================================================================
// Test Assertion Helpers
// ============================================================================

/**
 * Asserts that a validation result is successful
 */
export function assertValidationSuccess<T>(
  result: ValidationResult<T>,
  expectedData?: T
): asserts result is ValidationResult<T> & { success: true; data: T } {
  if (!result.success) {
    throw new Error(`Expected validation to succeed, but got errors: ${JSON.stringify(result.errors)}`);
  }
  
  if (expectedData !== undefined && JSON.stringify(result.data) !== JSON.stringify(expectedData)) {
    throw new Error(`Expected data ${JSON.stringify(expectedData)}, but got ${JSON.stringify(result.data)}`);
  }
}

/**
 * Asserts that a validation result failed
 */
export function assertValidationFailure<T>(
  result: ValidationResult<T>,
  expectedErrorCodes?: string[]
): asserts result is ValidationResult<T> & { success: false } {
  if (result.success) {
    throw new Error(`Expected validation to fail, but it succeeded with data: ${JSON.stringify(result.data)}`);
  }
  
  if (expectedErrorCodes) {
    const actualCodes = result.errors.map(e => e.code);
    for (const expectedCode of expectedErrorCodes) {
      if (!actualCodes.includes(expectedCode)) {
        throw new Error(`Expected error code '${expectedCode}', but got: ${actualCodes.join(', ')}`);
      }
    }
  }
}

/**
 * Asserts that a validation result has specific error codes
 */
export function assertHasErrorCodes(result: ValidationResult<any>, expectedCodes: string[]): void {
  const actualCodes = result.errors.map(e => e.code);
  for (const expectedCode of expectedCodes) {
    if (!actualCodes.includes(expectedCode)) {
      throw new Error(`Expected error code '${expectedCode}', but got: ${actualCodes.join(', ')}`);
    }
  }
}

/**
 * Asserts that a validation result has a specific number of errors
 */
export function assertErrorCount(result: ValidationResult<any>, expectedCount: number): void {
  if (result.errors.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} errors, but got ${result.errors.length}: ${JSON.stringify(result.errors)}`);
  }
}

// ============================================================================
// Performance Testing Utilities
// ============================================================================

/**
 * Measures the execution time of a validation operation
 */
export async function measureValidationTime<T>(
  operation: () => Promise<T>
): Promise<{ result: T; timeMs: number }> {
  const startTime = Date.now();
  const result = await operation();
  const endTime = Date.now();
  
  return {
    result,
    timeMs: endTime - startTime
  };
}

/**
 * Creates a large form schema for performance testing
 */
export function createLargeFormSchema(fieldCount: number = 50): ValidationSchema<Record<string, any>> {
  const builder = SchemaBuilder.create<Record<string, any>>();
  
  for (let i = 1; i <= fieldCount; i++) {
    builder.field(`field${i}`, [
      { type: 'maxLength', params: { max: 100 } }
    ]);
  }
  
  return builder.build();
}

/**
 * Creates large form data for performance testing
 */
export function createLargeFormData(fieldCount: number = 50): Record<string, any> {
  const data: Record<string, any> = {};
  
  for (let i = 1; i <= fieldCount; i++) {
    data[`field${i}`] = `value for field ${i}`;
  }
  
  return data;
}

// ============================================================================
// Export all utilities
// ============================================================================

export {
  // Re-export commonly used types for convenience
  type ValidationContext,
  type ValidationSchema,
  type FieldValidationSchema,
  type ValidationResult,
  type ValidationError,
};