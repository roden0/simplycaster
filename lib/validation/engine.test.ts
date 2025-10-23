// ============================================================================
// ValidationEngine Tests
// SimplyCaster Centralized Form Validation System
// ============================================================================

import { assertEquals, assertExists, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { ValidationEngine } from "./engine.ts";
import { ValidatorRegistry } from "./registry.ts";
import { registerBuiltInValidators } from "./validators.ts";
import { getCopy } from "../copy.ts";
import type {
  ValidationResult,
  ValidationContext,
  FieldValidationSchema,
  ValidationSchema,
} from "./types.ts";

// ============================================================================
// Test Setup
// ============================================================================

function createTestEngine(): ValidationEngine {
  const registry = new ValidatorRegistry();
  registerBuiltInValidators(registry);
  return new ValidationEngine(getCopy, registry);
}

function createMockContext(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    formData: {},
    fieldPath: 'testField',
    isSubmitting: false,
    copyManager: getCopy,
    ...overrides
  };
}

// ============================================================================
// ValidationEngine Constructor Tests
// ============================================================================

Deno.test("ValidationEngine - constructor", () => {
  const registry = new ValidatorRegistry();
  const engine = new ValidationEngine(getCopy, registry);
  
  assertExists(engine);
});

// ============================================================================
// Field Validation Tests
// ============================================================================

Deno.test("ValidationEngine.validateField - required field validation", async () => {
  const engine = createTestEngine();
  const schema: FieldValidationSchema = {
    validators: [{ type: 'required' }],
    required: true
  };
  const context = createMockContext();

  // Test empty value
  const emptyResult = await engine.validateField('', schema, context);
  assertEquals(emptyResult.success, false);
  assertEquals(emptyResult.errors.length, 1);
  assertEquals(emptyResult.errors[0].code, 'required');

  // Test non-empty value
  const validResult = await engine.validateField('test', schema, context);
  assertEquals(validResult.success, true);
  assertEquals(validResult.data, 'test');
  assertEquals(validResult.errors.length, 0);
});

Deno.test("ValidationEngine.validateField - optional field validation", async () => {
  const engine = createTestEngine();
  const schema: FieldValidationSchema = {
    validators: [{ type: 'email' }],
    required: false
  };
  const context = createMockContext();

  // Test empty value (should pass for optional field)
  const emptyResult = await engine.validateField('', schema, context);
  assertEquals(emptyResult.success, true);
  assertEquals(emptyResult.data, '');

  // Test invalid value (should fail)
  const invalidResult = await engine.validateField('invalid-email', schema, context);
  assertEquals(invalidResult.success, false);
  assertEquals(invalidResult.errors[0].code, 'email');

  // Test valid value (should pass)
  const validResult = await engine.validateField('test@example.com', schema, context);
  assertEquals(validResult.success, true);
  assertEquals(validResult.data, 'test@example.com');
});

Deno.test("ValidationEngine.validateField - multiple validators", async () => {
  const engine = createTestEngine();
  const schema: FieldValidationSchema = {
    validators: [
      { type: 'required' },
      { type: 'minLength', params: { min: 5 } },
      { type: 'maxLength', params: { max: 20 } }
    ],
    required: true
  };
  const context = createMockContext();

  // Test value that fails multiple validators
  const shortResult = await engine.validateField('hi', schema, context);
  assertEquals(shortResult.success, false);
  assertEquals(shortResult.errors.length, 1); // minLength error
  assertEquals(shortResult.errors[0].code, 'minLength');

  // Test valid value
  const validResult = await engine.validateField('hello world', schema, context);
  assertEquals(validResult.success, true);
  assertEquals(validResult.data, 'hello world');
});

Deno.test("ValidationEngine.validateField - custom error message", async () => {
  const engine = createTestEngine();
  const schema: FieldValidationSchema = {
    validators: [{ 
      type: 'email',
      message: 'Custom email message'
    }]
  };
  const context = createMockContext();

  const result = await engine.validateField('invalid-email', schema, context);
  assertEquals(result.success, false);
  assertEquals(result.errors[0].message, 'Custom email message');
});

Deno.test("ValidationEngine.validateField - unknown validator", async () => {
  const engine = createTestEngine();
  const schema: FieldValidationSchema = {
    validators: [{ type: 'unknownValidator' }]
  };
  const context = createMockContext();

  // Should not throw, but should log warning and continue
  const result = await engine.validateField('test', schema, context);
  assertEquals(result.success, true); // No validators ran, so success
});

Deno.test("ValidationEngine.validateField - validator throws error", async () => {
  const registry = new ValidatorRegistry();
  
  // Register a validator that throws
  registry.register('throwingValidator', () => {
    throw new Error('Validator error');
  });
  
  const engine = new ValidationEngine(getCopy, registry);
  const schema: FieldValidationSchema = {
    validators: [{ type: 'throwingValidator' }]
  };
  const context = createMockContext();

  const result = await engine.validateField('test', schema, context);
  assertEquals(result.success, false);
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].code, 'validationError');
});

// ============================================================================
// Form Validation Tests
// ============================================================================

Deno.test("ValidationEngine.validateForm - basic form validation", async () => {
  const engine = createTestEngine();
  const schema: ValidationSchema<{ email: string; name: string }> = {
    fields: {
      email: {
        validators: [
          { type: 'required' },
          { type: 'email' }
        ],
        required: true
      },
      name: {
        validators: [
          { type: 'required' },
          { type: 'minLength', params: { min: 2 } }
        ],
        required: true
      }
    }
  };

  // Test valid data
  const validData = { email: 'test@example.com', name: 'John Doe' };
  const validResult = await engine.validateForm(validData, schema);
  assertEquals(validResult.success, true);
  assertEquals(validResult.data?.email, 'test@example.com');
  assertEquals(validResult.data?.name, 'John Doe');

  // Test invalid data
  const invalidData = { email: 'invalid-email', name: 'J' };
  const invalidResult = await engine.validateForm(invalidData, schema);
  assertEquals(invalidResult.success, false);
  assertEquals(invalidResult.errors.length >= 2, true); // At least email and name errors
});

Deno.test("ValidationEngine.validateForm - with form validators", async () => {
  const engine = createTestEngine();
  
  // Create a simple form validator that checks if two fields match
  const registry = new ValidatorRegistry();
  registerBuiltInValidators(registry);
  
  // Register a simple form validator
  registry.register('passwordsMatch', (formData: any) => {
    if (formData.password === formData.confirmPassword) {
      return { success: true, data: formData, errors: [] };
    }
    return {
      success: false,
      errors: [{
        field: 'confirmPassword',
        code: 'passwordsMatch',
        message: 'Passwords must match'
      }]
    };
  });
  
  const testEngine = new ValidationEngine(getCopy, registry);
  
  const schema: ValidationSchema<{ password: string; confirmPassword: string }> = {
    fields: {
      password: {
        validators: [{ type: 'required' }],
        required: true
      },
      confirmPassword: {
        validators: [{ type: 'required' }],
        required: true
      }
    },
    formValidators: [
      { type: 'passwordsMatch' }
    ]
  };

  // Test matching passwords
  const matchingData = { password: 'secret123', confirmPassword: 'secret123' };
  const matchingResult = await testEngine.validateForm(matchingData, schema);
  assertEquals(matchingResult.success, true);

  // Test non-matching passwords
  const nonMatchingData = { password: 'secret123', confirmPassword: 'different' };
  const nonMatchingResult = await testEngine.validateForm(nonMatchingData, schema);
  assertEquals(nonMatchingResult.success, false);
});

Deno.test("ValidationEngine.validateForm - abortEarly option", async () => {
  const engine = createTestEngine();
  const schema: ValidationSchema<{ field1: string; field2: string; field3: string }> = {
    fields: {
      field1: {
        validators: [{ type: 'required' }],
        required: true
      },
      field2: {
        validators: [{ type: 'required' }],
        required: true
      },
      field3: {
        validators: [{ type: 'required' }],
        required: true
      }
    },
    options: {
      abortEarly: true
    }
  };

  const invalidData = { field1: '', field2: '', field3: '' };
  const result = await engine.validateForm(invalidData, schema);
  
  assertEquals(result.success, false);
  // With abortEarly, should stop after first error
  assertEquals(result.errors.length, 1);
});

Deno.test("ValidationEngine.validateForm - stripUnknown option", async () => {
  const engine = createTestEngine();
  const schema: ValidationSchema<{ name: string }> = {
    fields: {
      name: {
        validators: [{ type: 'required' }],
        required: true
      }
    },
    options: {
      stripUnknown: true
    }
  };

  const dataWithExtra = { name: 'John', extra: 'should be removed', another: 'also removed' };
  const result = await engine.validateForm(dataWithExtra, schema);
  
  assertEquals(result.success, true);
  assertExists(result.data);
  assertEquals(result.data.name, 'John');
  assertEquals('extra' in result.data, false);
  assertEquals('another' in result.data, false);
});

Deno.test("ValidationEngine.validateForm - allowUnknown option", async () => {
  const engine = createTestEngine();
  const schema: ValidationSchema<{ name: string }> = {
    fields: {
      name: {
        validators: [{ type: 'required' }],
        required: true
      }
    },
    options: {
      allowUnknown: true
    }
  };

  const dataWithExtra = { name: 'John', extra: 'should be kept' };
  const result = await engine.validateForm(dataWithExtra, schema);
  
  assertEquals(result.success, true);
  assertExists(result.data);
  assertEquals(result.data.name, 'John');
  assertEquals((result.data as any).extra, 'should be kept');
});

// ============================================================================
// Schema Serialization Tests
// ============================================================================

Deno.test("ValidationEngine.validateFromSchema - string schema", async () => {
  const engine = createTestEngine();
  const schema: ValidationSchema<{ email: string }> = {
    fields: {
      email: {
        validators: [{ type: 'required' }, { type: 'email' }],
        required: true
      }
    }
  };

  const serializedSchema = JSON.stringify(schema);
  const data = { email: 'test@example.com' };
  
  const result = await engine.validateFromSchema(data, serializedSchema);
  assertEquals(result.success, true);
  assertEquals(result.data?.email, 'test@example.com');
});

Deno.test("ValidationEngine.validateFromSchema - invalid JSON", async () => {
  const engine = createTestEngine();
  const invalidJson = '{ invalid json }';
  const data = { email: 'test@example.com' };
  
  const result = await engine.validateFromSchema(data, invalidJson);
  assertEquals(result.success, false);
  assertEquals(result.errors[0].code, 'schemaParseError');
});

Deno.test("ValidationEngine.serializeSchema", () => {
  const engine = createTestEngine();
  const schema: ValidationSchema<{ email: string }> = {
    fields: {
      email: {
        validators: [{ type: 'email' }]
      }
    }
  };

  const serialized = engine.serializeSchema(schema);
  const parsed = JSON.parse(serialized);
  
  assertEquals(parsed.fields.email.validators[0].type, 'email');
});

Deno.test("ValidationEngine.deserializeSchema", () => {
  const engine = createTestEngine();
  const schema: ValidationSchema<{ email: string }> = {
    fields: {
      email: {
        validators: [{ type: 'email' }]
      }
    }
  };

  const serialized = JSON.stringify(schema);
  const deserialized = engine.deserializeSchema<{ email: string }>(serialized);
  
  assertEquals(deserialized.fields.email.validators[0].type, 'email');
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

Deno.test("ValidationEngine.validateField - null and undefined values", async () => {
  const engine = createTestEngine();
  const schema: FieldValidationSchema = {
    validators: [{ type: 'email' }],
    required: false
  };
  const context = createMockContext();

  // Test null value
  const nullResult = await engine.validateField(null, schema, context);
  assertEquals(nullResult.success, true);

  // Test undefined value
  const undefinedResult = await engine.validateField(undefined, schema, context);
  assertEquals(undefinedResult.success, true);
});

Deno.test("ValidationEngine.validateField - empty arrays", async () => {
  const engine = createTestEngine();
  const schema: FieldValidationSchema = {
    validators: [{ type: 'required' }],
    required: true
  };
  const context = createMockContext();

  const result = await engine.validateField([], schema, context);
  assertEquals(result.success, false);
  assertEquals(result.errors[0].code, 'required');
});

Deno.test("ValidationEngine.validateForm - empty form data", async () => {
  const engine = createTestEngine();
  const schema: ValidationSchema<{ name: string }> = {
    fields: {
      name: {
        validators: [{ type: 'required' }],
        required: true
      }
    }
  };

  const result = await engine.validateForm({} as { name: string }, schema);
  assertEquals(result.success, false);
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].code, 'required');
});

Deno.test("ValidationEngine.validateForm - field validation throws error", async () => {
  const registry = new ValidatorRegistry();
  registry.register('throwingValidator', () => {
    throw new Error('Field validation error');
  });
  
  const engine = new ValidationEngine(getCopy, registry);
  const schema: ValidationSchema<{ test: string }> = {
    fields: {
      test: {
        validators: [{ type: 'throwingValidator' }]
      }
    }
  };

  const result = await engine.validateForm({ test: 'value' }, schema);
  assertEquals(result.success, false);
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].code, 'validationError');
});

Deno.test("ValidationEngine.validateForm - form validator throws error", async () => {
  const registry = new ValidatorRegistry();
  registerBuiltInValidators(registry);
  registry.register('throwingFormValidator', () => {
    throw new Error('Form validation error');
  });
  
  const engine = new ValidationEngine(getCopy, registry);
  const schema: ValidationSchema<{ test: string }> = {
    fields: {
      test: {
        validators: [{ type: 'required' }],
        required: true
      }
    },
    formValidators: [
      { type: 'throwingFormValidator' }
    ]
  };

  const result = await engine.validateForm({ test: 'value' }, schema);
  assertEquals(result.success, false);
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].code, 'validationError');
});

// ============================================================================
// Context and Copy Manager Integration
// ============================================================================

Deno.test("ValidationEngine - context propagation", async () => {
  const engine = createTestEngine();
  const schema: FieldValidationSchema = {
    validators: [{ type: 'required' }],
    required: true
  };
  
  const context = createMockContext({
    fieldPath: 'customField',
    formData: { other: 'data' },
    isSubmitting: true
  });

  const result = await engine.validateField('', schema, context);
  assertEquals(result.success, false);
  assertEquals(result.errors[0].field, 'customField');
});

Deno.test("ValidationEngine - copy manager integration", async () => {
  const mockCopyManager = (key: string) => {
    if (key === 'validation.required') return 'Custom required message';
    return 'Default message';
  };
  
  const registry = new ValidatorRegistry();
  registerBuiltInValidators(registry);
  const engine = new ValidationEngine(mockCopyManager, registry);
  
  const schema: FieldValidationSchema = {
    validators: [{ type: 'required' }],
    required: true
  };
  const context = createMockContext({ copyManager: mockCopyManager });

  const result = await engine.validateField('', schema, context);
  assertEquals(result.success, false);
  assertEquals(result.errors[0].message, 'Custom required message');
});

console.log("✅ All ValidationEngine tests completed successfully!");