// ============================================================================
// Comprehensive Validation System Tests
// SimplyCaster Centralized Form Validation System
// ============================================================================

import { assertEquals, assertExists, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createTestValidationEngine,
  createMockContext,
  createContextWithFormData,
  createRequiredFieldSchema,
  createEmailFieldSchema,
  createPasswordFieldSchema,
  createUserRegistrationSchema,
  createFileUploadSchema,
  createValidUserData,
  createInvalidUserData,
  createValidFileUploadData,
  createInvalidFileUploadData,
  createMockFile,
  createMockRequest,
  assertValidationSuccess,
  assertValidationFailure,
  assertHasErrorCodes,
  assertErrorCount,
  measureValidationTime,
  createLargeFormSchema,
  createLargeFormData,
} from "./test-utils.ts";
import { validateRequestBody } from "./server-middleware.ts";
import { validateAPIRequest } from "./api-utils.ts";
import { SchemaBuilder } from "./schema-builder.ts";

// ============================================================================
// Core Validation Engine Tests
// ============================================================================

Deno.test("Comprehensive - ValidationEngine basic functionality", async () => {
  const engine = createTestValidationEngine();
  const schema = createRequiredFieldSchema();
  const context = createMockContext();

  // Test valid input
  const validResult = await engine.validateField('test value', schema, context);
  assertValidationSuccess(validResult, 'test value');

  // Test invalid input
  const invalidResult = await engine.validateField('', schema, context);
  assertValidationFailure(invalidResult, ['required']);
});

Deno.test("Comprehensive - Email validation workflow", async () => {
  const engine = createTestValidationEngine();
  const schema = createEmailFieldSchema();
  const context = createMockContext();

  // Test valid emails
  const validEmails = [
    'test@example.com',
    'user.name@domain.co.uk',
    'user+tag@example.org'
  ];

  for (const email of validEmails) {
    const result = await engine.validateField(email, schema, context);
    assertValidationSuccess(result, email);
  }

  // Test invalid emails
  const invalidEmails = [
    'invalid-email',
    '@example.com',
    'test@',
    ''
  ];

  for (const email of invalidEmails) {
    const result = await engine.validateField(email, schema, context);
    assertValidationFailure(result);
  }
});

Deno.test("Comprehensive - Password validation workflow", async () => {
  const engine = createTestValidationEngine();
  const schema = createPasswordFieldSchema();
  const context = createMockContext();

  // Test valid passwords (avoiding sequential numbers)
  const validPasswords = [
    'SecurePass248',
    'MyPassword975!',
    'ComplexP@ssw0rd'
  ];

  for (const password of validPasswords) {
    const result = await engine.validateField(password, schema, context);
    assertValidationSuccess(result, password);
  }

  // Test invalid passwords
  const invalidPasswords = [
    '', // Empty
    'weak', // Too short
    '12345678', // No letters
    'password' // Too simple
  ];

  for (const password of invalidPasswords) {
    const result = await engine.validateField(password, schema, context);
    assertValidationFailure(result);
  }
});

// ============================================================================
// Form Validation Tests
// ============================================================================

Deno.test("Comprehensive - User registration form validation", async () => {
  const engine = createTestValidationEngine();
  const schema = createUserRegistrationSchema();

  // Test valid registration
  const validData = createValidUserData();
  const validResult = await engine.validateForm(validData, schema);
  assertValidationSuccess(validResult);
  assertEquals(validResult.data?.email, validData.email);
  assertEquals(validResult.data?.fullName, validData.fullName);

  // Test invalid registration
  const invalidData = createInvalidUserData();
  const invalidResult = await engine.validateForm(invalidData, schema);
  assertValidationFailure(invalidResult);
  
  // Should have multiple errors
  assert(invalidResult.errors.length >= 3);
  assertHasErrorCodes(invalidResult, ['email', 'minLength']);
});

Deno.test("Comprehensive - File upload form validation", async () => {
  const engine = createTestValidationEngine();
  const schema = createFileUploadSchema();

  // Test valid file upload
  const validData = createValidFileUploadData();
  const validResult = await engine.validateForm(validData, schema);
  assertValidationSuccess(validResult);

  // Test invalid file upload
  const invalidData = createInvalidFileUploadData();
  const invalidResult = await engine.validateForm(invalidData, schema);
  assertValidationFailure(invalidResult);
  
  // Should have multiple errors
  assertHasErrorCodes(invalidResult, ['required', 'fileType', 'maxLength']);
});

// ============================================================================
// Schema Builder Integration Tests
// ============================================================================

Deno.test("Comprehensive - Dynamic schema building", async () => {
  const engine = createTestValidationEngine();
  
  // Build schema dynamically
  const schema = SchemaBuilder.create<{
    username: string;
    email: string;
    age: number;
    bio?: string;
  }>()
    .field('username', [
      { type: 'required' },
      { type: 'minLength', params: { min: 3 } },
      { type: 'maxLength', params: { max: 20 } }
    ], { required: true })
    .field('email', [
      { type: 'required' },
      { type: 'email' }
    ], { required: true })
    .field('age', [
      { type: 'required' },
      { type: 'min', params: { min: 13 } },
      { type: 'max', params: { max: 120 } }
    ], { required: true })
    .field('bio', [
      { type: 'maxLength', params: { max: 500 } }
    ])
    .options({ debounceMs: 300, abortEarly: false })
    .build();

  // Test valid data
  const validData = {
    username: 'testuser',
    email: 'test@example.com',
    age: 25,
    bio: 'Software developer'
  };

  const validResult = await engine.validateForm(validData, schema);
  assertValidationSuccess(validResult);

  // Test invalid data
  const invalidData = {
    username: 'ab', // Too short
    email: 'invalid-email',
    age: 12, // Too young
    bio: 'x'.repeat(501) // Too long
  };

  const invalidResult = await engine.validateForm(invalidData, schema);
  assertValidationFailure(invalidResult);
  assertHasErrorCodes(invalidResult, ['minLength', 'email', 'min', 'maxLength']);
});

// ============================================================================
// Server-Side Validation Tests
// ============================================================================

Deno.test("Comprehensive - Server-side validation workflow", async () => {
  const schema = createUserRegistrationSchema();
  
  // Test valid request
  const validData = createValidUserData();
  const validRequest = createMockRequest(validData);
  const validResult = await validateRequestBody(validRequest, schema);
  
  assertValidationSuccess(validResult);
  assertEquals(validResult.data?.email, validData.email);

  // Test invalid request
  const invalidData = createInvalidUserData();
  const invalidRequest = createMockRequest(invalidData);
  const invalidResult = await validateRequestBody(invalidRequest, schema);
  
  assertValidationFailure(invalidResult);
  assert(invalidResult.errors.length >= 3);
});

Deno.test("Comprehensive - API validation with sanitization", async () => {
  const schema = SchemaBuilder.create<{
    name: string;
    email: string;
    description: string;
  }>()
    .field('name', [
      { type: 'required' },
      { type: 'minLength', params: { min: 2 } }
    ], { required: true })
    .field('email', [
      { type: 'required' },
      { type: 'email' }
    ], { required: true })
    .field('description', [
      { type: 'maxLength', params: { max: 500 } }
    ])
    .build();

  const testData = {
    name: '  John Doe  ', // Should be trimmed
    email: '  test@example.com  ', // Should be trimmed
    description: 'A description with\x00null bytes', // Should be sanitized
    extraField: 'should be removed' // Should be stripped
  };

  const request = createMockRequest(testData);
  const result = await validateAPIRequest(request, schema, {
    sanitize: true,
    stripUnknown: true
  });

  assertValidationSuccess(result);
  const data = result.data as any;
  assertEquals(data?.name, 'John Doe');
  assertEquals(data?.email, 'test@example.com');
  assertEquals(data?.description, 'A description withnull bytes');
  assertEquals('extraField' in (data || {}), false);
});

// ============================================================================
// Schema Serialization Tests
// ============================================================================

Deno.test("Comprehensive - Schema serialization round-trip", async () => {
  const engine = createTestValidationEngine();
  const originalSchema = createUserRegistrationSchema();
  
  // Serialize and deserialize
  const serialized = engine.serializeSchema(originalSchema);
  const deserialized = engine.deserializeSchema(serialized);
  
  // Test that both schemas work the same
  const testData = createValidUserData();
  
  const originalResult = await engine.validateForm(testData, originalSchema);
  const deserializedResult = await engine.validateFromSchema(testData, serialized);
  
  assertEquals(originalResult.success, deserializedResult.success);
  assertEquals(originalResult.errors.length, deserializedResult.errors.length);
  
  if (originalResult.success && deserializedResult.success) {
    assertEquals(originalResult.data?.email, deserializedResult.data?.email);
  }
});

// ============================================================================
// Performance Tests
// ============================================================================

Deno.test("Comprehensive - Large form validation performance", async () => {
  const engine = createTestValidationEngine();
  const schema = createLargeFormSchema(100); // 100 fields
  const data = createLargeFormData(100);
  
  const { result, timeMs } = await measureValidationTime(async () => {
    return await engine.validateForm(data, schema);
  });
  
  assertValidationSuccess(result);
  
  // Should complete within reasonable time (less than 1 second)
  assert(timeMs < 1000, `Large form validation took too long: ${timeMs}ms`);
});

Deno.test("Comprehensive - Concurrent validation performance", async () => {
  const engine = createTestValidationEngine();
  const schema = createUserRegistrationSchema();
  
  // Create multiple validation requests
  const requests = Array.from({ length: 20 }, (_, i) => ({
    email: `user${i}@example.com`,
    password: 'SecurePass123',
    confirmPassword: 'SecurePass123',
    fullName: `User ${i}`
  }));

  const { result: results, timeMs } = await measureValidationTime(async () => {
    return await Promise.all(
      requests.map(data => engine.validateForm(data, schema))
    );
  });

  // All should succeed
  results.forEach((result, i) => {
    assertValidationSuccess(result);
    assertEquals(result.data?.email, `user${i}@example.com`);
  });

  // Should complete within reasonable time
  assert(timeMs < 2000, `Concurrent validation took too long: ${timeMs}ms`);
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

Deno.test("Comprehensive - Edge cases handling", async () => {
  const engine = createTestValidationEngine();
  const schema = createEmailFieldSchema(false); // Optional email
  const context = createMockContext();

  // Test null values
  const nullResult = await engine.validateField(null, schema, context);
  assertValidationSuccess(nullResult, null);

  // Test undefined values
  const undefinedResult = await engine.validateField(undefined, schema, context);
  assertValidationSuccess(undefinedResult, undefined);

  // Test empty arrays
  const requiredSchema = createRequiredFieldSchema();
  const arrayResult = await engine.validateField([], requiredSchema, context);
  assertValidationFailure(arrayResult, ['required']);

  // Test whitespace-only strings
  const whitespaceResult = await engine.validateField('   ', requiredSchema, context);
  assertValidationFailure(whitespaceResult, ['required']);
});

Deno.test("Comprehensive - Form validation with mixed field types", async () => {
  const engine = createTestValidationEngine();
  
  const schema = SchemaBuilder.create<{
    text: string;
    number: number;
    boolean: boolean;
    file: File;
    array: string[];
  }>()
    .field('text', [
      { type: 'required' },
      { type: 'minLength', params: { min: 3 } }
    ], { required: true })
    .field('number', [
      { type: 'required' },
      { type: 'min', params: { min: 0 } },
      { type: 'max', params: { max: 100 } }
    ], { required: true })
    .field('boolean', [
      { type: 'required' }
    ], { required: true })
    .field('file', [
      { type: 'required' },
      { type: 'fileSize', params: { maxSize: 1024 * 1024 } }
    ], { required: true })
    .field('array', [
      { type: 'required' }
    ], { required: true })
    .build();

  const validData = {
    text: 'valid text',
    number: 50,
    boolean: true,
    file: createMockFile(),
    array: ['item1', 'item2']
  };

  const result = await engine.validateForm(validData, schema);
  assertValidationSuccess(result);
  assertEquals(result.data?.text, 'valid text');
  assertEquals(result.data?.number, 50);
  assertEquals(result.data?.boolean, true);
});

// ============================================================================
// Context and Copy Manager Integration
// ============================================================================

Deno.test("Comprehensive - Context propagation", async () => {
  const engine = createTestValidationEngine();
  const schema = createRequiredFieldSchema();
  
  const context = createContextWithFormData(
    { otherField: 'other value' },
    'customField'
  );

  const result = await engine.validateField('', schema, context);
  assertValidationFailure(result);
  assertEquals(result.errors[0].field, 'customField');
});

Deno.test("Comprehensive - Form data context usage", async () => {
  const engine = createTestValidationEngine();
  
  // Create a schema that uses matchField validator
  const schema = SchemaBuilder.create<{
    password: string;
    confirmPassword: string;
  }>()
    .field('password', [
      { type: 'required' }
    ], { required: true })
    .field('confirmPassword', [
      { type: 'required' },
      { type: 'matchField', params: { field: 'password' } }
    ], { required: true })
    .build();

  // Test matching passwords
  const matchingData = {
    password: 'secret123',
    confirmPassword: 'secret123'
  };

  const matchingResult = await engine.validateForm(matchingData, schema);
  assertValidationSuccess(matchingResult);

  // Test non-matching passwords
  const nonMatchingData = {
    password: 'secret123',
    confirmPassword: 'different'
  };

  const nonMatchingResult = await engine.validateForm(nonMatchingData, schema);
  assertValidationFailure(nonMatchingResult, ['matchField']);
});

console.log("✅ All comprehensive validation tests completed successfully!");