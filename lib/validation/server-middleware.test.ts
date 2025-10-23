// ============================================================================
// Server-Side Validation Middleware Tests
// SimplyCaster Centralized Form Validation System
// ============================================================================

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { 
  validateRequestBody,
  parseRequestBody,
  createErrorResponse,
  createSuccessResponse
} from "./server-middleware.ts";
import { 
  validateFileUploads,
  validateSingleFile,
  validateAPIRequest,
  sanitizeRequestData,
  sanitizeHTML,
  sanitizeSQL,
  audioFileValidation
} from "./api-utils.ts";

// ============================================================================
// Test Utilities
// ============================================================================

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

function createMockFormDataRequest(data: Record<string, string | File>): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(data)) {
    formData.append(key, value);
  }
  
  return new Request("http://localhost/test", {
    method: "POST",
    body: formData
  });
}

function createMockFile(name: string, content: string, type: string): File {
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
}

// ============================================================================
// Request Body Parsing Tests
// ============================================================================

Deno.test("parseRequestBody - JSON content", async () => {
  const testData = { name: "John", email: "john@example.com" };
  const req = createMockRequest(testData);
  
  const result = await parseRequestBody(req);
  
  assertEquals(result.name, "John");
  assertEquals(result.email, "john@example.com");
});

Deno.test("parseRequestBody - form data content", async () => {
  const req = createMockFormDataRequest({
    name: "John",
    email: "john@example.com"
  });
  
  const result = await parseRequestBody(req);
  
  assertEquals(result.name, "John");
  assertEquals(result.email, "john@example.com");
});

// ============================================================================
// Request Validation Tests
// ============================================================================

Deno.test("validateRequestBody - valid data", async () => {
  const testData = { 
    name: "John Doe", 
    email: "john@example.com",
    age: 25
  };
  const req = createMockRequest(testData);
  
  const schema = {
    fields: {
      name: {
        validators: [
          { type: 'required' },
          { type: 'minLength', params: { min: 2 } }
        ]
      },
      email: {
        validators: [
          { type: 'required' },
          { type: 'email' }
        ]
      },
      age: {
        validators: [
          { type: 'min', params: { min: 18 } }
        ]
      }
    }
  };
  
  const result = await validateRequestBody(req, schema);
  
  assertEquals(result.success, true);
  assertExists(result.data);
  assertEquals(result.data.name, "John Doe");
  assertEquals(result.data.email, "john@example.com");
  assertEquals(result.data.age, 25);
});

Deno.test("validateRequestBody - invalid data", async () => {
  const testData = { 
    name: "", // Required field empty
    email: "invalid-email", // Invalid email format
    age: 15 // Below minimum
  };
  const req = createMockRequest(testData);
  
  const schema = {
    fields: {
      name: {
        validators: [
          { type: 'required' },
          { type: 'minLength', params: { min: 2 } }
        ]
      },
      email: {
        validators: [
          { type: 'required' },
          { type: 'email' }
        ]
      },
      age: {
        validators: [
          { type: 'min', params: { min: 18 } }
        ]
      }
    }
  };
  
  const result = await validateRequestBody(req, schema);
  
  assertEquals(result.success, false);
  assertEquals(result.errors.length >= 1, true);
});

// ============================================================================
// API Validation Tests
// ============================================================================

Deno.test("validateAPIRequest - with sanitization", async () => {
  const testData = { 
    name: "  John Doe  ", // Has whitespace
    description: "<script>alert('xss')</script>Normal text"
  };
  const req = createMockRequest(testData);
  
  const schema = {
    fields: {
      name: {
        validators: [
          { type: 'required' },
          { type: 'minLength', params: { min: 2 } }
        ]
      },
      description: {
        validators: [
          { type: 'maxLength', params: { max: 500 } }
        ]
      }
    }
  };
  
  const result = await validateAPIRequest(req, schema, {
    sanitize: true,
    stripUnknown: true
  });
  
  assertEquals(result.success, true);
  assertExists(result.data);
  assertEquals(result.data.name, "John Doe"); // Trimmed
});

// ============================================================================
// File Validation Tests
// ============================================================================

Deno.test("validateSingleFile - valid audio file", async () => {
  const audioFile = createMockFile("test.mp3", "fake mp3 content", "audio/mpeg");
  
  const result = await validateSingleFile(audioFile, "audioFile", {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ["audio/mpeg", "audio/ogg"],
    allowedExtensions: ["mp3", "ogg"]
  });
  
  assertEquals(result.success, true);
  assertExists(result.data);
  assertEquals(result.data.name, "test.mp3");
});

Deno.test("validateSingleFile - file too large", async () => {
  const largeFile = createMockFile("large.mp3", "x".repeat(1000), "audio/mpeg");
  
  const result = await validateSingleFile(largeFile, "audioFile", {
    maxSize: 100, // Very small limit
    allowedTypes: ["audio/mpeg"]
  });
  
  assertEquals(result.success, false);
  assertEquals(result.errors.length >= 1, true);
  assertEquals(result.errors[0].code, "FILE_TOO_LARGE");
});

Deno.test("validateSingleFile - invalid file type", async () => {
  const textFile = createMockFile("test.txt", "text content", "text/plain");
  
  const result = await validateSingleFile(textFile, "audioFile", {
    allowedTypes: ["audio/mpeg", "audio/ogg"]
  });
  
  assertEquals(result.success, false);
  assertEquals(result.errors.length >= 1, true);
  assertEquals(result.errors[0].code, "INVALID_FILE_TYPE");
});

// ============================================================================
// Sanitization Tests
// ============================================================================

Deno.test("sanitizeRequestData - basic sanitization", async () => {
  const testData = {
    name: "  John Doe  ",
    description: "Normal text with\x00null bytes",
    nested: {
      value: "  nested value  "
    }
  };
  
  const result = await sanitizeRequestData(testData);
  
  assertEquals(result.success, true);
  assertExists(result.data);
  assertEquals(result.data.name, "John Doe");
  assertEquals(result.data.description, "Normal text withnull bytes");
  assertEquals(result.data.nested.value, "nested value");
});

Deno.test("sanitizeHTML - removes script tags", () => {
  const html = "<p>Safe content</p><script>alert('xss')</script><p>More content</p>";
  const sanitized = sanitizeHTML(html);
  
  assertEquals(sanitized.includes("<script>"), false);
  assertEquals(sanitized.includes("alert"), false);
  assertEquals(sanitized.includes("Safe content"), true);
});

Deno.test("sanitizeSQL - removes SQL injection patterns", () => {
  const sql = "user'; DROP TABLE users; --";
  const sanitized = sanitizeSQL(sql);
  
  assertEquals(sanitized.includes("DROP TABLE"), false);
  assertEquals(sanitized.includes("--"), false);
});

// ============================================================================
// Response Helper Tests
// ============================================================================

Deno.test("createErrorResponse - formats error correctly", () => {
  const errorData = {
    success: false as const,
    error: "Validation failed",
    code: "VALIDATION_ERROR",
    errors: [{
      field: "email",
      code: "INVALID_EMAIL",
      message: "Invalid email format",
      params: {}
    }]
  };
  
  const response = createErrorResponse(errorData, 400);
  
  assertEquals(response.status, 400);
  assertEquals(response.headers.get("Content-Type"), "application/json");
});

Deno.test("createSuccessResponse - formats success correctly", () => {
  const data = { id: "123", name: "John Doe" };
  
  const response = createSuccessResponse(data, 201);
  
  assertEquals(response.status, 201);
  assertEquals(response.headers.get("Content-Type"), "application/json");
});

// ============================================================================
// Integration Tests
// ============================================================================

Deno.test("Full validation flow - JSON request", async () => {
  const testData = { 
    email: "john@example.com",
    password: "SecurePass123",
    fullName: "John Doe"
  };
  const req = createMockRequest(testData);
  
  const schema = {
    fields: {
      email: {
        validators: [
          { type: 'required' },
          { type: 'email' }
        ]
      },
      password: {
        validators: [
          { type: 'required' },
          { type: 'minLength', params: { min: 8 } }
        ]
      },
      fullName: {
        validators: [
          { type: 'required' },
          { type: 'minLength', params: { min: 2 } }
        ]
      }
    }
  };
  
  const result = await validateAPIRequest(req, schema, {
    sanitize: true,
    stripUnknown: true
  });
  
  assertEquals(result.success, true);
  assertExists(result.data);
  assertEquals(result.data.email, "john@example.com");
  assertEquals(result.data.fullName, "John Doe");
});

console.log("✅ All server-side validation tests completed successfully!");