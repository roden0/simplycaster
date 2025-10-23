// ============================================================================
// SchemaBuilder Tests
// SimplyCaster Centralized Form Validation System
// ============================================================================

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { SchemaBuilder, createSchema, defineSchema } from "./schema-builder.ts";
import { userRegistrationSchema, episodeUploadSchema } from "./schemas.ts";

Deno.test("SchemaBuilder - Basic functionality", () => {
  const schema = SchemaBuilder.create<{ email: string; name: string }>()
    .field('email', [
      { type: 'required' },
      { type: 'email' }
    ], { required: true })
    .field('name', [
      { type: 'required' },
      { type: 'minLength', params: { min: 2 } }
    ], { required: true })
    .options({ debounceMs: 300 })
    .build();

  assertEquals(schema.fields.email.required, true);
  assertEquals(schema.fields.email.validators.length, 2);
  assertEquals(schema.fields.email.validators[0].type, 'required');
  assertEquals(schema.fields.email.validators[1].type, 'email');
  assertEquals(schema.options?.debounceMs, 300);
});

Deno.test("SchemaBuilder - Fluent API methods", () => {
  const builder = SchemaBuilder.create<{ email: string; password: string }>()
    .field('email', [{ type: 'email' }])
    .required('email')
    .field('password', [{ type: 'minLength', params: { min: 8 } }])
    .abortEarly(true)
    .stripUnknown(true)
    .debounce(500);

  const schema = builder.build();

  assertEquals(schema.fields.email.required, true);
  assertEquals(schema.options?.abortEarly, true);
  assertEquals(schema.options?.stripUnknown, true);
  assertEquals(schema.options?.debounceMs, 500);
});

Deno.test("SchemaBuilder - Serialization", () => {
  const schema = SchemaBuilder.create<{ email: string }>()
    .field('email', [{ type: 'required' }, { type: 'email' }], { required: true })
    .build();

  const serialized = JSON.stringify(schema);
  const deserialized = SchemaBuilder.deserialize<{ email: string }>(serialized);

  assertEquals(deserialized.fields.email.required, true);
  assertEquals(deserialized.fields.email.validators.length, 2);
});

Deno.test("SchemaBuilder - Form validators", () => {
  const schema = SchemaBuilder.create<{ password: string; confirmPassword: string }>()
    .field('password', [{ type: 'required' }], { required: true })
    .field('confirmPassword', [{ type: 'required' }], { required: true })
    .formValidator({ type: 'passwordsMatch', params: { fields: ['password', 'confirmPassword'] } })
    .build();

  assertExists(schema.formValidators);
  assertEquals(schema.formValidators.length, 1);
  assertEquals(schema.formValidators[0].type, 'passwordsMatch');
});

Deno.test("SchemaBuilder - Clone and merge", () => {
  const builder1 = SchemaBuilder.create<{ email: string }>()
    .field('email', [{ type: 'email' }]);

  const builder2 = builder1.clone()
    .required('email');

  const schema1 = builder1.build();
  const schema2 = builder2.build();

  assertEquals(schema1.fields.email.required, undefined);
  assertEquals(schema2.fields.email.required, true);
});

Deno.test("SchemaBuilder - Statistics", () => {
  const builder = SchemaBuilder.create<{ email: string; password: string }>()
    .field('email', [{ type: 'required' }, { type: 'email' }], { required: true })
    .field('password', [{ type: 'required' }, { type: 'minLength', params: { min: 8 } }], { required: true })
    .formValidator({ type: 'passwordsMatch' })
    .options({ debounceMs: 300 });

  const stats = builder.getStats();

  assertEquals(stats.fieldCount, 2);
  assertEquals(stats.requiredFieldCount, 2);
  assertEquals(stats.totalValidators, 4);
  assertEquals(stats.formValidatorCount, 1);
  assertEquals(stats.hasOptions, true);
});

Deno.test("Predefined schemas - User registration", () => {
  assertExists(userRegistrationSchema);
  assertExists(userRegistrationSchema.fields.email);
  assertExists(userRegistrationSchema.fields.password);
  assertExists(userRegistrationSchema.fields.confirmPassword);
  assertExists(userRegistrationSchema.fields.fullName);
  
  assertEquals(userRegistrationSchema.fields.email.required, true);
  assertEquals(userRegistrationSchema.fields.password.required, true);
  assertEquals(userRegistrationSchema.options?.debounceMs, 300);
});

Deno.test("Predefined schemas - Episode upload", () => {
  assertExists(episodeUploadSchema);
  assertExists(episodeUploadSchema.fields.title);
  assertExists(episodeUploadSchema.fields.file);
  
  assertEquals(episodeUploadSchema.fields.title.required, true);
  assertEquals(episodeUploadSchema.fields.file.required, true);
  
  // Check file validators
  const fileValidators = episodeUploadSchema.fields.file.validators;
  const fileTypeValidator = fileValidators.find(v => v.type === 'fileType');
  assertExists(fileTypeValidator);
  assertExists(fileTypeValidator.params?.types);
});

Deno.test("Convenience functions", () => {
  const schema1 = createSchema<{ name: string }>()
    .field('name', [{ type: 'required' }])
    .build();

  const schema2 = defineSchema<{ email: string }>({
    fields: {
      email: {
        validators: [{ type: 'required' }, { type: 'email' }],
        required: true
      }
    },
    options: { debounceMs: 200 }
  });

  assertExists(schema1.fields.name);
  assertExists(schema2.fields.email);
  assertEquals(schema2.options?.debounceMs, 200);
});