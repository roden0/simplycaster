// ============================================================================
// Built-in Validators Tests
// SimplyCaster Centralized Form Validation System
// ============================================================================

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  requiredValidator,
  emailValidator,
  minLengthValidator,
  maxLengthValidator,
  patternValidator,
  minValidator,
  maxValidator,
  fileSizeValidator,
  fileTypeValidator,
  passwordValidator,
  matchFieldValidator,
  calculatePasswordStrength,
  registerBuiltInValidators,
  createRegistryWithBuiltIns,
} from "./validators.ts";
import { ValidatorRegistry } from "./registry.ts";
import { getCopy } from "../copy.ts";
import type { ValidationContext } from "./types.ts";

// Mock context for testing
const mockContext: ValidationContext = {
  formData: {},
  fieldPath: 'testField',
  isSubmitting: false,
  copyManager: getCopy
};

Deno.test("requiredValidator - should pass for non-empty values", async () => {
  const result = await requiredValidator("test", mockContext);
  assertEquals(result.success, true);
  assertEquals(result.data, "test");
  assertEquals(result.errors.length, 0);
});

Deno.test("requiredValidator - should fail for empty values", async () => {
  const result = await requiredValidator("", mockContext);
  assertEquals(result.success, false);
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].code, "required");
});

Deno.test("emailValidator - should pass for valid emails", async () => {
  const validEmails = [
    "test@example.com",
    "user.name@domain.co.uk",
    "user+tag@example.org"
  ];

  for (const email of validEmails) {
    const result = await emailValidator(email, mockContext);
    assertEquals(result.success, true, `Failed for email: ${email}`);
  }
});

Deno.test("emailValidator - should fail for invalid emails", async () => {
  const invalidEmails = [
    "invalid-email",
    "@example.com",
    "test@",
    "test..test@example.com"
  ];

  for (const email of invalidEmails) {
    const result = await emailValidator(email, mockContext);
    assertEquals(result.success, false, `Should fail for email: ${email}`);
    assertEquals(result.errors[0].code, "email");
  }
});

Deno.test("minLengthValidator - should validate minimum length", async () => {
  const validator = minLengthValidator(5);
  
  const validResult = await validator("hello", mockContext);
  assertEquals(validResult.success, true);
  
  const invalidResult = await validator("hi", mockContext);
  assertEquals(invalidResult.success, false);
  assertEquals(invalidResult.errors[0].code, "minLength");
});

Deno.test("maxLengthValidator - should validate maximum length", async () => {
  const validator = maxLengthValidator(5);
  
  const validResult = await validator("hello", mockContext);
  assertEquals(validResult.success, true);
  
  const invalidResult = await validator("hello world", mockContext);
  assertEquals(invalidResult.success, false);
  assertEquals(invalidResult.errors[0].code, "maxLength");
});

Deno.test("patternValidator - should validate regex patterns", async () => {
  const validator = patternValidator(/^[A-Z]+$/);
  
  const validResult = await validator("HELLO", mockContext);
  assertEquals(validResult.success, true);
  
  const invalidResult = await validator("hello", mockContext);
  assertEquals(invalidResult.success, false);
  assertEquals(invalidResult.errors[0].code, "pattern");
});

Deno.test("minValidator - should validate minimum numeric value", async () => {
  const validator = minValidator(10);
  
  const validResult = await validator(15, mockContext);
  assertEquals(validResult.success, true);
  
  const invalidResult = await validator(5, mockContext);
  assertEquals(invalidResult.success, false);
  assertEquals(invalidResult.errors[0].code, "min");
});

Deno.test("maxValidator - should validate maximum numeric value", async () => {
  const validator = maxValidator(10);
  
  const validResult = await validator(5, mockContext);
  assertEquals(validResult.success, true);
  
  const invalidResult = await validator(15, mockContext);
  assertEquals(invalidResult.success, false);
  assertEquals(invalidResult.errors[0].code, "max");
});

Deno.test("fileSizeValidator - should validate file size", async () => {
  const validator = fileSizeValidator(1024); // 1KB limit
  
  // Create mock files
  const smallFile = new File(["small"], "small.txt", { type: "text/plain" });
  const largeFile = new File([new ArrayBuffer(2048)], "large.txt", { type: "text/plain" });
  
  const validResult = await validator(smallFile, mockContext);
  assertEquals(validResult.success, true);
  
  const invalidResult = await validator(largeFile, mockContext);
  assertEquals(invalidResult.success, false);
  assertEquals(invalidResult.errors[0].code, "fileSize");
});

Deno.test("fileTypeValidator - should validate file MIME types", async () => {
  const validator = fileTypeValidator(["text/plain", "image/jpeg"]);
  
  const validFile = new File(["content"], "test.txt", { type: "text/plain" });
  const invalidFile = new File(["content"], "test.pdf", { type: "application/pdf" });
  
  const validResult = await validator(validFile, mockContext);
  assertEquals(validResult.success, true);
  
  const invalidResult = await validator(invalidFile, mockContext);
  assertEquals(invalidResult.success, false);
  assertEquals(invalidResult.errors[0].code, "fileType");
});

Deno.test("passwordValidator - should validate password complexity", async () => {
  const validator = passwordValidator();
  
  const validPassword = "SecurePass248"; // No sequential numbers
  const weakPassword = "weak";
  
  const validResult = await validator(validPassword, mockContext);
  assertEquals(validResult.success, true);
  
  const invalidResult = await validator(weakPassword, mockContext);
  assertEquals(invalidResult.success, false);
});

Deno.test("matchFieldValidator - should validate field matching", async () => {
  const validator = matchFieldValidator("password");
  const contextWithPassword: ValidationContext = {
    ...mockContext,
    formData: { password: "secret123" }
  };
  
  const validResult = await validator("secret123", contextWithPassword);
  assertEquals(validResult.success, true);
  
  const invalidResult = await validator("different", contextWithPassword);
  assertEquals(invalidResult.success, false);
  assertEquals(invalidResult.errors[0].code, "matchField");
});

Deno.test("calculatePasswordStrength - should calculate password strength", () => {
  const weakResult = calculatePasswordStrength("weak");
  assertEquals(weakResult.level, "very-weak");
  
  const strongResult = calculatePasswordStrength("StrongPassword987!");
  assertEquals(strongResult.level, "strong");
  
  const mediumResult = calculatePasswordStrength("Password987");
  assertEquals(["fair", "good"].includes(mediumResult.level), true);
});

Deno.test("registerBuiltInValidators - should register all validators", () => {
  const registry = new ValidatorRegistry();
  registerBuiltInValidators(registry);
  
  // Check that key validators are registered
  assertExists(registry.get("required"));
  assertExists(registry.get("email"));
  assertExists(registry.get("minLength"));
  assertExists(registry.get("password"));
  assertExists(registry.get("fileSize"));
  
  const stats = registry.getStats();
  assertEquals(stats.totalValidators > 10, true); // Should have many validators
});

Deno.test("createRegistryWithBuiltIns - should create pre-configured registry", () => {
  const registry = createRegistryWithBuiltIns();
  
  assertExists(registry.get("required"));
  assertExists(registry.get("email"));
  assertExists(registry.get("password"));
  
  const stats = registry.getStats();
  assertEquals(stats.totalValidators > 10, true);
});