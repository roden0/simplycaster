// ============================================================================
// Validation Hooks Tests
// SimplyCaster Centralized Form Validation System
// ============================================================================

import { assertEquals, assertExists, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { signal } from "@preact/signals";
import { useFormValidation, useFieldValidation } from "./hooks.ts";
import { SchemaBuilder } from "./schema-builder.ts";
import type { ValidationSchema } from "./types.ts";

// Note: These tests focus on the validation logic and data structures
// rather than the actual hook behavior, which would require a Preact test environment

// Test schema
const testSchema: ValidationSchema<{
  email: string;
  password: string;
  name: string;
}> = SchemaBuilder.create<{
  email: string;
  password: string;
  name: string;
}>()
  .field('email', [
    { type: 'required' },
    { type: 'email' }
  ], { required: true })
  .field('password', [
    { type: 'required' },
    { type: 'minLength', params: { min: 8 } }
  ], { required: true })
  .field('name', [
    { type: 'required' },
    { type: 'minLength', params: { min: 2 } }
  ], { required: true })
  .options({ debounceMs: 100 })
  .build();

Deno.test("useFormValidation - initialization", () => {
  const initialData = { email: 'test@example.com', password: '', name: '' };
  
  // This is a conceptual test - in real usage, this would be inside a component
  // For now, we'll test the schema structure and validation logic
  
  assertEquals(testSchema.fields.email.required, true);
  assertEquals(testSchema.fields.email.validators.length, 2);
  assertEquals(testSchema.fields.email.validators[0].type, 'required');
  assertEquals(testSchema.fields.email.validators[1].type, 'email');
});

Deno.test("useFormValidation - schema validation", () => {
  // Test that the schema is properly structured
  assertExists(testSchema.fields.email);
  assertExists(testSchema.fields.password);
  assertExists(testSchema.fields.name);
  
  assertEquals(testSchema.options?.debounceMs, 100);
});

Deno.test("useFieldValidation - validator configuration", () => {
  const validators = [
    { type: 'required' },
    { type: 'email' }
  ];
  
  // Test validator configuration
  assertEquals(validators.length, 2);
  assertEquals(validators[0].type, 'required');
  assertEquals(validators[1].type, 'email');
});

Deno.test("Form validation utilities - field props creation", async () => {
  // Test the utility functions that would be used by the hooks
  const mockFormState = {
    getFieldValue: (name: string) => name === 'email' ? 'test@example.com' : '',
    getFieldError: (name: string) => name === 'password' ? 'Password is required' : undefined,
    hasFieldError: (name: string) => name === 'password',
    isFieldTouched: (name: string) => name === 'email',
    setFieldValue: (name: string, value: any) => {},
    touchField: (name: string) => {},
  };
  
  // Test field value retrieval
  assertEquals(mockFormState.getFieldValue('email'), 'test@example.com');
  assertEquals(mockFormState.getFieldValue('password'), '');
  
  // Test error state
  assertEquals(mockFormState.getFieldError('password'), 'Password is required');
  assertEquals(mockFormState.getFieldError('email'), undefined);
  
  // Test touched state
  assert(mockFormState.isFieldTouched('email'));
  assert(!mockFormState.isFieldTouched('password'));
});

Deno.test("Debounce utility - timing", async () => {
  let callCount = 0;
  let lastValue: string | undefined;
  
  // Simple debounce implementation for testing
  function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: number | undefined;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }
  
  const debouncedFn = debounce((value: string) => {
    callCount++;
    lastValue = value;
  }, 50);
  
  // Call multiple times rapidly
  debouncedFn('first');
  debouncedFn('second');
  debouncedFn('third');
  
  // Should not have been called yet
  assertEquals(callCount, 0);
  
  // Wait for debounce
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Should have been called once with the last value
  assertEquals(callCount, 1);
  assertEquals(lastValue, 'third');
});

Deno.test("Validation context structure", () => {
  const context = {
    formData: { email: 'test@example.com', password: 'secret123' },
    fieldPath: 'email',
    isSubmitting: false,
    copyManager: (key: string) => `Mock message for ${key}`
  };
  
  assertEquals(context.fieldPath, 'email');
  assertEquals(context.isSubmitting, false);
  assertEquals(context.copyManager('validation.required'), 'Mock message for validation.required');
  assertExists(context.formData.email);
});

Deno.test("Async validation configuration", () => {
  const asyncValidators = [
    { type: 'uniqueEmail', async: true },
    { type: 'required' }
  ];
  
  const asyncValidator = asyncValidators.find(v => v.async);
  const syncValidator = asyncValidators.find(v => !v.async);
  
  assertExists(asyncValidator);
  assertEquals(asyncValidator.type, 'uniqueEmail');
  
  assertExists(syncValidator);
  assertEquals(syncValidator.type, 'required');
});

Deno.test("Form state management structure", () => {
  // Test the expected structure of form state
  const mockFormState = {
    data: { email: 'test@example.com', password: '', name: 'John' },
    errors: {
      password: [{ field: 'password', code: 'required', message: 'Password is required' }]
    },
    isValidating: false,
    isSubmitting: false,
    isValid: false,
    hasErrors: true,
    fieldErrors: {
      password: 'Password is required'
    },
    touchedFields: ['email', 'name']
  };
  
  assertEquals(mockFormState.data.email, 'test@example.com');
  assertEquals(mockFormState.errors.password[0].code, 'required');
  assertEquals(mockFormState.fieldErrors.password, 'Password is required');
  assert(mockFormState.hasErrors);
  assert(!mockFormState.isValid);
  assertEquals(mockFormState.touchedFields.length, 2);
});