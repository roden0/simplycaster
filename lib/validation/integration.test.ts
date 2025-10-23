// ============================================================================
// Integration Tests - Form Validation Workflows
// SimplyCaster Centralized Form Validation System
// ============================================================================

import { assertEquals, assertExists, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { ValidationEngine } from "./engine.ts";
import { ValidatorRegistry } from "./registry.ts";
import { registerBuiltInValidators } from "./validators.ts";
import { registerAsyncValidators } from "./async-validators.ts";
import { SchemaBuilder } from "./schema-builder.ts";
import { userRegistrationSchema, episodeUploadSchema } from "./schemas.ts";
import { validateRequestBody, validateAPIRequest } from "./server-middleware.ts";
import { getCopy } from "../copy.ts";
import type { ValidationSchema, ValidationContext } from "./types.ts";

// ============================================================================
// Test Setup
// ============================================================================

function createFullValidationEngine(): ValidationEngine {
  const registry = new ValidatorRegistry();
  registerBuiltInValidators(registry);
  registerAsyncValidators(registry);
  return new ValidationEngine(getCopy, registry);
}

function createMockRequest(body: any, contentType: string = "application/json"): Request {
  const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "Content-Type": contentType
    },
    body: bodyString
  });
}

// Mock fetch for async validation tests
const originalFetch = globalThis.fetch;

function mockFetch(responses: Record<string, any>) {
  globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url.toString();
    
    for (const [pattern, response] of Object.entries(responses)) {
      if (urlString.includes(pattern)) {
        if (response instanceof Error) {
          throw response;
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

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

// ============================================================================
// End-to-End Form Validation Tests
// ============================================================================

Deno.test("Integration - User registration form workflow", async () => {
  const engine = createFullValidationEngine();
  
  // Test complete valid registration
  const validData = {
    email: 'newuser@example.com',
    password: 'SecurePass123',
    confirmPassword: 'SecurePass123',
    fullName: 'John Doe'
  };

  mockFetch({
    '/api/validate/unique-email': { unique: true }
  });

  const result = await engine.validateForm(validData, userRegistrationSchema);
  
  assertEquals(result.success, true);
  assertExists(result.data);
  assertEquals(result.data.email, 'newuser@example.com');
  assertEquals(result.data.fullName, 'John Doe');
  
  restoreFetch();
});

Deno.test("Integration - User registration with validation errors", async () => {
  const engine = createFullValidationEngine();
  
  // Test registration with multiple validation errors
  const invalidData = {
    email: 'invalid-email',
    password: 'weak',
    confirmPassword: 'different',
    fullName: 'J'
  };

  const result = await engine.validateForm(invalidData, userRegistrationSchema);
  
  assertEquals(result.success, false);
  assertEquals(result.errors.length >= 4, true); // Multiple validation errors
  
  // Check specific error codes
  const errorCodes = result.errors.map(e => e.code);
  assert(errorCodes.includes('email'));
  assert(errorCodes.includes('minLength') || errorCodes.includes('password'));
  assert(errorCodes.includes('matchField'));
});

Deno.test("Integration - User registration with email already taken", async () => {
  const engine = createFullValidationEngine();
  
  const validData = {
    email: 'taken@example.com',
    password: 'SecurePass123',
    confirmPassword: 'SecurePass123',
    fullName: 'John Doe'
  };

  mockFetch({
    '/api/validate/unique-email': { unique: false }
  });

  const result = await engine.validateForm(validData, userRegistrationSchema);
  
  assertEquals(result.success, false);
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].code, 'uniqueEmail');
  
  restoreFetch();
});

Deno.test("Integration - Episode upload form workflow", async () => {
  const engine = createFullValidationEngine();
  
  // Create a mock audio file
  const audioFile = new File(['mock audio content'], 'episode.mp3', { 
    type: 'audio/mpeg' 
  });
  
  const validData = {
    title: 'My First Episode',
    description: 'This is a great episode about testing',
    file: audioFile,
    episodeNumber: 1
  };

  mockFetch({
    '/api/validate/file': { 
      integrityValid: true,
      malwareDetected: false,
      metadata: { duration: 1800 } // 30 minutes
    }
  });

  const result = await engine.validateForm(validData, episodeUploadSchema);
  
  assertEquals(result.success, true);
  assertExists(result.data);
  assertEquals(result.data.title, 'My First Episode');
  assertEquals(result.data.episodeNumber, 1);
  
  restoreFetch();
});

Deno.test("Integration - Episode upload with file validation errors", async () => {
  const engine = createFullValidationEngine();
  
  // Create a mock file that will fail validation
  const corruptedFile = new File(['corrupted'], 'episode.mp3', { 
    type: 'audio/mpeg' 
  });
  
  const invalidData = {
    title: '', // Required field empty
    description: 'x'.repeat(1001), // Too long
    file: corruptedFile,
    episodeNumber: -1 // Invalid number
  };

  mockFetch({
    '/api/validate/file': { 
      integrityValid: false,
      malwareDetected: false
    }
  });

  const result = await engine.validateForm(invalidData, episodeUploadSchema);
  
  assertEquals(result.success, false);
  assertEquals(result.errors.length >= 3, true); // Multiple errors
  
  const errorCodes = result.errors.map(e => e.code);
  assert(errorCodes.includes('required')); // Title required
  assert(errorCodes.includes('maxLength')); // Description too long
  assert(errorCodes.includes('fileCorrupted')); // File validation
  
  restoreFetch();
});

// ============================================================================
// Client-Server Validation Consistency Tests
// ============================================================================

Deno.test("Integration - Client-server validation consistency", async () => {
  const engine = createFullValidationEngine();
  
  // Test data that should fail validation
  const testData = {
    email: 'invalid-email',
    password: 'weak',
    fullName: 'J'
  };

  // Client-side validation
  const clientResult = await engine.validateForm(testData, userRegistrationSchema);
  
  // Server-side validation using middleware
  const request = createMockRequest(testData);
  const serverResult = await validateRequestBody(request, userRegistrationSchema);
  
  // Both should fail with similar errors
  assertEquals(clientResult.success, false);
  assertEquals(serverResult.success, false);
  
  // Check that error codes are consistent
  const clientErrorCodes = clientResult.errors.map(e => e.code).sort();
  const serverErrorCodes = serverResult.errors.map(e => e.code).sort();
  
  assertEquals(clientErrorCodes, serverErrorCodes);
});

Deno.test("Integration - Server validation with sanitization", async () => {
  const testData = {
    email: '  TEST@EXAMPLE.COM  ', // Should be trimmed and lowercased
    password: 'SecurePass123',
    fullName: '  John Doe  ' // Should be trimmed
  };

  const request = createMockRequest(testData);
  const result = await validateAPIRequest(request, userRegistrationSchema, {
    sanitize: true
  });
  
  assertEquals(result.success, true);
  assertExists(result.data);
  assertEquals(result.data.email, 'test@example.com'); // Normalized
  assertEquals(result.data.fullName, 'John Doe'); // Trimmed
});

Deno.test("Integration - Server validation with unknown field stripping", async () => {
  const testData = {
    email: 'test@example.com',
    password: 'SecurePass123',
    fullName: 'John Doe',
    extraField: 'should be removed',
    anotherExtra: 'also removed'
  };

  const request = createMockRequest(testData);
  const result = await validateAPIRequest(request, userRegistrationSchema, {
    stripUnknown: true
  });
  
  assertEquals(result.success, true);
  assertExists(result.data);
  assertEquals(result.data.email, 'test@example.com');
  assertEquals('extraField' in result.data, false);
  assertEquals('anotherExtra' in result.data, false);
});

// ============================================================================
// Complex Form Validation Scenarios
// ============================================================================

Deno.test("Integration - Multi-step form validation", async () => {
  const engine = createFullValidationEngine();
  
  // Step 1: Basic info
  const step1Schema = SchemaBuilder.create<{ email: string; password: string }>()
    .field('email', [
      { type: 'required' },
      { type: 'email' },
      { type: 'uniqueEmail', async: true }
    ], { required: true })
    .field('password', [
      { type: 'required' },
      { type: 'minLength', params: { min: 8 } },
      { type: 'password' }
    ], { required: true })
    .build();

  // Step 2: Profile info
  const step2Schema = SchemaBuilder.create<{ fullName: string; bio?: string }>()
    .field('fullName', [
      { type: 'required' },
      { type: 'minLength', params: { min: 2 } }
    ], { required: true })
    .field('bio', [
      { type: 'maxLength', params: { max: 500 } }
    ])
    .build();

  mockFetch({
    '/api/validate/unique-email': { unique: true }
  });

  // Validate step 1
  const step1Data = { email: 'test@example.com', password: 'SecurePass123' };
  const step1Result = await engine.validateForm(step1Data, step1Schema);
  assertEquals(step1Result.success, true);

  // Validate step 2
  const step2Data = { fullName: 'John Doe', bio: 'Software developer' };
  const step2Result = await engine.validateForm(step2Data, step2Schema);
  assertEquals(step2Result.success, true);

  // Combine and validate final form
  const finalData = { ...step1Data, ...step2Data };
  const finalSchema = SchemaBuilder.create<typeof finalData>()
    .field('email', step1Schema.fields.email.validators, { required: true })
    .field('password', step1Schema.fields.password.validators, { required: true })
    .field('fullName', step2Schema.fields.fullName.validators, { required: true })
    .field('bio', step2Schema.fields.bio?.validators || [])
    .build();

  const finalResult = await engine.validateForm(finalData, finalSchema);
  assertEquals(finalResult.success, true);
  
  restoreFetch();
});

Deno.test("Integration - Conditional validation workflow", async () => {
  const engine = createFullValidationEngine();
  
  // Schema with conditional validation
  const conditionalSchema = SchemaBuilder.create<{
    userType: 'host' | 'guest';
    email: string;
    hostCode?: string;
    guestName?: string;
  }>()
    .field('userType', [{ type: 'required' }], { required: true })
    .field('email', [
      { type: 'required' },
      { type: 'email' }
    ], { required: true })
    .field('hostCode', [
      { type: 'minLength', params: { min: 6 } }
    ]) // Required only for hosts
    .field('guestName', [
      { type: 'minLength', params: { min: 2 } }
    ]) // Required only for guests
    .build();

  // Test host registration
  const hostData = {
    userType: 'host' as const,
    email: 'host@example.com',
    hostCode: 'HOST123'
  };

  const hostResult = await engine.validateForm(hostData, conditionalSchema);
  assertEquals(hostResult.success, true);

  // Test guest registration
  const guestData = {
    userType: 'guest' as const,
    email: 'guest@example.com',
    guestName: 'Guest User'
  };

  const guestResult = await engine.validateForm(guestData, conditionalSchema);
  assertEquals(guestResult.success, true);
});

// ============================================================================
// Async Validation Integration Tests
// ============================================================================

Deno.test("Integration - Mixed sync and async validation", async () => {
  const engine = createFullValidationEngine();
  
  const mixedSchema = SchemaBuilder.create<{
    email: string;
    username: string;
    password: string;
  }>()
    .field('email', [
      { type: 'required' },
      { type: 'email' }, // Sync
      { type: 'uniqueEmail', async: true } // Async
    ], { required: true })
    .field('username', [
      { type: 'required' },
      { type: 'minLength', params: { min: 3 } }, // Sync
      { type: 'usernameAvailability', async: true } // Async
    ], { required: true })
    .field('password', [
      { type: 'required' },
      { type: 'password' } // Sync
    ], { required: true })
    .build();

  mockFetch({
    '/api/validate/unique-email': { unique: true },
    '/api/validate/username-availability': { 
      available: true,
      reserved: false,
      inappropriate: false
    }
  });

  const testData = {
    email: 'test@example.com',
    username: 'testuser',
    password: 'SecurePass123'
  };

  const result = await engine.validateForm(testData, mixedSchema);
  
  assertEquals(result.success, true);
  assertExists(result.data);
  
  restoreFetch();
});

Deno.test("Integration - Async validation with network failures", async () => {
  const engine = createFullValidationEngine();
  
  const asyncSchema = SchemaBuilder.create<{ email: string }>()
    .field('email', [
      { type: 'required' },
      { type: 'email' },
      { type: 'uniqueEmail', async: true }
    ], { required: true })
    .build();

  // Mock network failure
  mockFetch({
    '/api/validate/unique-email': new Error('Network error')
  });

  const testData = { email: 'test@example.com' };

  try {
    await engine.validateForm(testData, asyncSchema);
    assert(false, 'Should have thrown network error');
  } catch (error) {
    assertEquals(error.message, 'Network error');
  }
  
  restoreFetch();
});

// ============================================================================
// Performance and Stress Tests
// ============================================================================

Deno.test("Integration - Large form validation performance", async () => {
  const engine = createFullValidationEngine();
  
  // Create a schema with many fields
  const largeFormSchema = SchemaBuilder.create<Record<string, string>>()
    .field('field1', [{ type: 'required' }, { type: 'email' }], { required: true })
    .field('field2', [{ type: 'required' }, { type: 'minLength', params: { min: 5 } }], { required: true })
    .field('field3', [{ type: 'required' }, { type: 'maxLength', params: { max: 100 } }], { required: true })
    .field('field4', [{ type: 'pattern', params: { pattern: '^[A-Z]+$' } }])
    .field('field5', [{ type: 'min', params: { min: 0 } }])
    .build();

  // Add more fields dynamically
  for (let i = 6; i <= 50; i++) {
    largeFormSchema.fields[`field${i}`] = {
      validators: [{ type: 'maxLength', params: { max: 50 } }]
    };
  }

  // Create test data
  const largeFormData: Record<string, any> = {
    field1: 'test@example.com',
    field2: 'valid value',
    field3: 'another valid value',
    field4: 'UPPERCASE',
    field5: 10
  };

  // Add data for additional fields
  for (let i = 6; i <= 50; i++) {
    largeFormData[`field${i}`] = `value ${i}`;
  }

  const startTime = Date.now();
  const result = await engine.validateForm(largeFormData, largeFormSchema);
  const endTime = Date.now();

  assertEquals(result.success, true);
  
  // Should complete within reasonable time (less than 1 second)
  assert(endTime - startTime < 1000, `Validation took too long: ${endTime - startTime}ms`);
});

Deno.test("Integration - Concurrent validation requests", async () => {
  const engine = createFullValidationEngine();
  
  const schema = SchemaBuilder.create<{ email: string; name: string }>()
    .field('email', [{ type: 'required' }, { type: 'email' }], { required: true })
    .field('name', [{ type: 'required' }], { required: true })
    .build();

  // Create multiple validation requests
  const requests = Array.from({ length: 10 }, (_, i) => ({
    email: `user${i}@example.com`,
    name: `User ${i}`
  }));

  // Run all validations concurrently
  const startTime = Date.now();
  const results = await Promise.all(
    requests.map(data => engine.validateForm(data, schema))
  );
  const endTime = Date.now();

  // All should succeed
  results.forEach((result, i) => {
    assertEquals(result.success, true, `Request ${i} failed`);
  });

  // Should complete within reasonable time
  assert(endTime - startTime < 2000, `Concurrent validation took too long: ${endTime - startTime}ms`);
});

// ============================================================================
// Error Recovery and Resilience Tests
// ============================================================================

Deno.test("Integration - Validation with partial failures", async () => {
  const engine = createFullValidationEngine();
  
  const schema = SchemaBuilder.create<{
    validField: string;
    invalidField: string;
    anotherValidField: string;
  }>()
    .field('validField', [{ type: 'required' }], { required: true })
    .field('invalidField', [{ type: 'email' }])
    .field('anotherValidField', [{ type: 'minLength', params: { min: 2 } }])
    .options({ abortEarly: false }) // Continue validation even with errors
    .build();

  const testData = {
    validField: 'valid value',
    invalidField: 'invalid-email',
    anotherValidField: 'valid value too'
  };

  const result = await engine.validateForm(testData, schema);
  
  assertEquals(result.success, false);
  assertEquals(result.errors.length, 1); // Only email validation should fail
  assertEquals(result.errors[0].code, 'email');
  assertEquals(result.errors[0].field, 'invalidField');
});

Deno.test("Integration - Schema serialization round-trip", async () => {
  const engine = createFullValidationEngine();
  
  // Create a complex schema
  const originalSchema = SchemaBuilder.create<{
    email: string;
    password: string;
    confirmPassword: string;
  }>()
    .field('email', [
      { type: 'required' },
      { type: 'email' },
      { type: 'uniqueEmail', async: true }
    ], { required: true })
    .field('password', [
      { type: 'required' },
      { type: 'minLength', params: { min: 8 } }
    ], { required: true })
    .field('confirmPassword', [
      { type: 'required' },
      { type: 'matchField', params: { field: 'password' } }
    ], { required: true })
    .formValidator({ type: 'passwordsMatch' })
    .options({ debounceMs: 300, abortEarly: false })
    .build();

  // Serialize and deserialize
  const serialized = engine.serializeSchema(originalSchema);
  const deserialized = engine.deserializeSchema(serialized);

  // Test that deserialized schema works the same
  mockFetch({
    '/api/validate/unique-email': { unique: true }
  });

  const testData = {
    email: 'test@example.com',
    password: 'SecurePass123',
    confirmPassword: 'SecurePass123'
  };

  const originalResult = await engine.validateForm(testData, originalSchema);
  const deserializedResult = await engine.validateFromSchema(testData, serialized);

  assertEquals(originalResult.success, deserializedResult.success);
  assertEquals(originalResult.errors.length, deserializedResult.errors.length);
  
  restoreFetch();
});

console.log("✅ All integration tests completed successfully!");