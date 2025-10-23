/**
 * Tests for validation copy utilities
 */

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
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
  validationMessages,
} from "./copy-utils.ts";
import type { ValidationError } from "./types.ts";
import type { ExtendedValidationContext } from "./copy-utils.ts";

Deno.test("getValidationMessage - basic message retrieval", () => {
  const message = getValidationMessage("required");
  assertEquals(message, "This field is required");
});

Deno.test("getValidationMessage - with interpolation", () => {
  const message = getValidationMessage("minLength", { min: 5 });
  assertEquals(message, "Must be at least 5 characters");
});

Deno.test("getValidationMessage - context-specific message", () => {
  const context: ExtendedValidationContext = { 
    context: "user",
    formData: {},
    fieldPath: "email",
    isSubmitting: false,
    copyManager: () => "test"
  };
  const message = getValidationMessage("email", undefined, context);
  assertEquals(message, "Please enter a valid email address");
});

Deno.test("getValidationMessage - fallback to general message", () => {
  const context: ExtendedValidationContext = { 
    context: "nonexistent",
    formData: {},
    fieldPath: "test",
    isSubmitting: false,
    copyManager: () => "test"
  };
  const message = getValidationMessage("required", undefined, context);
  assertEquals(message, "This field is required");
});

Deno.test("getValidationMessage - fallback to generic", () => {
  const message = getValidationMessage("nonexistent");
  assertEquals(message, "Please check your input and try again");
});

Deno.test("getParameterizedValidationMessage - automatic context building", () => {
  const message = getParameterizedValidationMessage("minLength", { minLength: 8 });
  assertEquals(message, "Must be at least 8 characters");
});

Deno.test("getParameterizedValidationMessage - with minimum/maximum conversion", () => {
  const message = getParameterizedValidationMessage("range", { minimum: 1, maximum: 10 });
  assertEquals(message, "Must be between 1 and 10");
});

Deno.test("getFieldValidationMessage - with field name", () => {
  const message = getFieldValidationMessage("username", "required");
  assertEquals(message, "This field is required");
});

Deno.test("formatValidationError - basic error formatting", () => {
  const error: ValidationError = {
    field: "email",
    code: "email",
    message: "Invalid email",
  };
  
  const message = formatValidationError(error);
  assertEquals(message, "Please enter a valid email address");
});

Deno.test("formatValidationError - with parameters", () => {
  const error: ValidationError = {
    field: "password",
    code: "minLength",
    message: "Too short",
    params: { min: 8 },
  };
  
  const message = formatValidationError(error);
  assertEquals(message, "Must be at least 8 characters");
});

Deno.test("getContextValidationMessages - room context", () => {
  const messages = getContextValidationMessages("room");
  assertEquals(typeof messages, "object");
  assertStringIncludes(messages.name, "Room name");
});

Deno.test("getCustomValidationMessage - template interpolation", () => {
  const template = "{{field}} must be between {{min}} and {{max}} characters";
  const variables = { field: "Username", min: 3, max: 20 };
  
  const message = getCustomValidationMessage(template, variables);
  assertEquals(message, "Username must be between 3 and 20 characters");
});

Deno.test("buildValidationContext - context building", () => {
  const context = buildValidationContext("email", "invalid@", { format: "email" });
  
  assertEquals(context.field, "email");
  assertEquals(context.value, "invalid@");
  assertEquals(context.format, "email");
});

Deno.test("getAsyncValidationMessage - validating state", () => {
  const message = getAsyncValidationMessage("validating");
  assertEquals(message, "Validating...");
});

Deno.test("getAsyncValidationMessage - failed state", () => {
  const message = getAsyncValidationMessage("failed");
  assertEquals(message, "Validation failed");
});

Deno.test("getServerValidationMessage - with error string", () => {
  const message = getServerValidationMessage("Database connection failed");
  assertStringIncludes(message, "Database connection failed");
});

Deno.test("getServerValidationMessage - with Error object", () => {
  const error = new Error("Network timeout");
  const message = getServerValidationMessage(error);
  assertStringIncludes(message, "Network timeout");
});

Deno.test("getConditionalValidationMessage - simple condition", () => {
  const message = getConditionalValidationMessage("user is admin");
  assertStringIncludes(message, "user is admin");
});

Deno.test("getConditionalValidationMessage - with dependent field", () => {
  const message = getConditionalValidationMessage("", "role", "admin");
  assertStringIncludes(message, "role");
  assertStringIncludes(message, "admin");
});

Deno.test("validationMessages - convenience functions", () => {
  assertEquals(validationMessages.required(), "This field is required");
  assertEquals(validationMessages.email(), "Please enter a valid email address");
  assertEquals(validationMessages.minLength(5), "Must be at least 5 characters");
  assertEquals(validationMessages.maxLength(100), "Must be less than 100 characters");
  assertEquals(validationMessages.range(1, 10), "Must be between 1 and 10");
});

Deno.test("validationMessages - with field names", () => {
  const message = validationMessages.required("username");
  assertEquals(message, "This field is required");
});

Deno.test("validationMessages - with validation context", () => {
  const context: ExtendedValidationContext = { 
    context: "user",
    formData: {},
    fieldPath: "email",
    isSubmitting: false,
    copyManager: () => "test"
  };
  const message = validationMessages.email("email", context);
  assertEquals(message, "Please enter a valid email address");
});

Deno.test("validationMessages - custom message with variables", () => {
  const message = validationMessages.custom("{{field}} is invalid", { field: "Email" });
  assertEquals(message, "Email is invalid");
});