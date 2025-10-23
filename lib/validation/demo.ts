// ============================================================================
// Schema System Demonstration
// SimplyCaster Centralized Form Validation System
// ============================================================================

import { 
  createValidationEngine,
  SchemaBuilder,
  userRegistrationSchema,
  episodeUploadSchema,
  getValidationSchema
} from "./index.ts";

// ============================================================================
// Demo: Basic Schema Creation
// ============================================================================

console.log("=== Schema Builder Demo ===\n");

// Create a simple schema using the fluent API
const contactSchema = SchemaBuilder.create<{
  name: string;
  email: string;
  message: string;
}>()
  .field('name', [
    { type: 'required' },
    { type: 'minLength', params: { min: 2 } }
  ], { required: true })
  .field('email', [
    { type: 'required' },
    { type: 'email' }
  ], { required: true })
  .field('message', [
    { type: 'required' },
    { type: 'maxLength', params: { max: 500 } }
  ], { required: true })
  .options({ debounceMs: 300, abortEarly: false })
  .build();

console.log("Contact Form Schema:");
console.log(JSON.stringify(contactSchema, null, 2));

// ============================================================================
// Demo: Using Predefined Schemas
// ============================================================================

console.log("\n=== Predefined Schemas Demo ===\n");

// Get a predefined schema
const userSchema = getValidationSchema('userRegistration');
console.log("User Registration Schema Fields:");
console.log("- Email:", userSchema.fields.email.validators.map(v => v.type));
console.log("- Password:", userSchema.fields.password.validators.map(v => v.type));
console.log("- Confirm Password:", userSchema.fields.confirmPassword.validators.map(v => v.type));
console.log("- Full Name:", userSchema.fields.fullName.validators.map(v => v.type));

// ============================================================================
// Demo: Schema Statistics
// ============================================================================

console.log("\n=== Schema Statistics Demo ===\n");

const builder = SchemaBuilder.create<{
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
  .options({ debounceMs: 300 });

const stats = builder.getStats();
console.log("Schema Statistics:");
console.log(`- Fields: ${stats.fieldCount}`);
console.log(`- Required Fields: ${stats.requiredFieldCount}`);
console.log(`- Total Validators: ${stats.totalValidators}`);
console.log(`- Form Validators: ${stats.formValidatorCount}`);
console.log(`- Async Validators: ${stats.asyncValidatorCount}`);
console.log(`- Has Options: ${stats.hasOptions}`);

// ============================================================================
// Demo: Schema Serialization
// ============================================================================

console.log("\n=== Schema Serialization Demo ===\n");

const schema = builder.build();
const serialized = JSON.stringify(schema);
const deserialized = SchemaBuilder.deserialize(serialized);

console.log("Schema serialized and deserialized successfully!");
console.log("Original fields count:", Object.keys(schema.fields).length);
console.log("Deserialized fields count:", Object.keys(deserialized.fields).length);

// ============================================================================
// Demo: Schema Validation (Mock)
// ============================================================================

console.log("\n=== Schema Validation Demo ===\n");

// This would normally use the validation engine, but for demo purposes
// we'll just show the structure
const mockFormData = {
  email: "user@example.com",
  password: "SecurePass123",
  confirmPassword: "SecurePass123"
};

console.log("Mock form data to validate:");
console.log(JSON.stringify(mockFormData, null, 2));

console.log("\nValidation would check:");
console.log("- Email format and uniqueness");
console.log("- Password strength and length");
console.log("- Password confirmation match");
console.log("- Form-level password matching");

console.log("\n=== Demo Complete ===");

if (import.meta.main) {
  // Run the demo when executed directly
}