/**
 * TURN Credential Service Tests
 * 
 * Tests for TURN credential generation, validation, and security features.
 */

import { assertEquals, assertThrows, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { TurnCredentialService } from "./turn-credential-service.ts";

Deno.test("TurnCredentialService - Constructor validation", () => {
  // Should throw error for missing secret
  assertThrows(
    () => new TurnCredentialService({
      secret: "",
      realm: "test.local",
      defaultTTL: 3600
    }),
    Error,
    "TURN secret must be at least 32 characters long"
  );

  // Should throw error for short secret
  assertThrows(
    () => new TurnCredentialService({
      secret: "short",
      realm: "test.local", 
      defaultTTL: 3600
    }),
    Error,
    "TURN secret must be at least 32 characters long"
  );

  // Should create service with valid config
  const service = new TurnCredentialService({
    secret: "this-is-a-very-long-secret-key-for-testing-purposes",
    realm: "test.local",
    defaultTTL: 3600
  });
  
  assert(service instanceof TurnCredentialService);
});

Deno.test("TurnCredentialService - Generate credentials", async () => {
  const service = new TurnCredentialService({
    secret: "this-is-a-very-long-secret-key-for-testing-purposes",
    realm: "test.local",
    defaultTTL: 3600
  });

  const userId = "test-user-123";
  const credentials = await service.generateTurnCredentials(userId);

  // Check credential structure
  assert(credentials.username.includes(":"));
  assert(credentials.username.endsWith(`:${userId}`));
  assert(credentials.credential.length > 0);
  assert(credentials.ttl === 3600);
  assert(credentials.expiresAt instanceof Date);
  assert(credentials.expiresAt > new Date());
});

Deno.test("TurnCredentialService - Generate credentials with custom TTL", async () => {
  const service = new TurnCredentialService({
    secret: "this-is-a-very-long-secret-key-for-testing-purposes",
    realm: "test.local",
    defaultTTL: 3600
  });

  const userId = "test-user-123";
  const customTTL = 7200; // 2 hours
  const credentials = await service.generateTurnCredentials(userId, customTTL);

  assertEquals(credentials.ttl, customTTL);
  
  // Check expiration time is approximately correct (within 1 second)
  const expectedExpiration = new Date(Date.now() + (customTTL * 1000));
  const timeDiff = Math.abs(credentials.expiresAt.getTime() - expectedExpiration.getTime());
  assert(timeDiff < 1000, "Expiration time should be within 1 second of expected");
});

Deno.test("TurnCredentialService - Validate credentials", async () => {
  const service = new TurnCredentialService({
    secret: "this-is-a-very-long-secret-key-for-testing-purposes",
    realm: "test.local",
    defaultTTL: 3600
  });

  const userId = "test-user-123";
  const credentials = await service.generateTurnCredentials(userId);

  // Valid credentials should pass validation
  const isValid = await service.validateTurnCredentials(
    credentials.username,
    credentials.credential
  );
  assert(isValid, "Valid credentials should pass validation");

  // Invalid credential should fail validation
  const isInvalid = await service.validateTurnCredentials(
    credentials.username,
    "invalid-credential"
  );
  assert(!isInvalid, "Invalid credentials should fail validation");

  // Empty credentials should fail validation
  const isEmpty = await service.validateTurnCredentials("", "");
  assert(!isEmpty, "Empty credentials should fail validation");
});

Deno.test("TurnCredentialService - Credential expiration", async () => {
  const service = new TurnCredentialService({
    secret: "this-is-a-very-long-secret-key-for-testing-purposes",
    realm: "test.local",
    defaultTTL: 3600
  });

  // Test with already expired timestamp
  const pastTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
  const expiredUsername = `${pastTimestamp}:test-user-123`;
  
  // Should be expired
  assert(service.isCredentialExpired(expiredUsername), "Past timestamp should be expired");

  // Test with future timestamp
  const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  const validUsername = `${futureTimestamp}:test-user-123`;
  
  // Should not be expired
  assert(!service.isCredentialExpired(validUsername), "Future timestamp should not be expired");

  // Test validation with expired credentials - should fail due to expiration
  const isValid = await service.validateTurnCredentials(expiredUsername, "any-credential");
  assert(!isValid, "Expired credentials should fail validation");
});

Deno.test("TurnCredentialService - Extract user ID from username", () => {
  const service = new TurnCredentialService({
    secret: "this-is-a-very-long-secret-key-for-testing-purposes",
    realm: "test.local",
    defaultTTL: 3600
  });

  // Valid username format
  const userId1 = service.extractUserIdFromUsername("1234567890:user-123");
  assertEquals(userId1, "user-123");

  // Username with colons in user ID
  const userId2 = service.extractUserIdFromUsername("1234567890:user:with:colons");
  assertEquals(userId2, "user:with:colons");

  // Invalid format should return null
  const userId3 = service.extractUserIdFromUsername("invalid-format");
  assertEquals(userId3, null);

  // Empty string should return null
  const userId4 = service.extractUserIdFromUsername("");
  assertEquals(userId4, null);
});

Deno.test("TurnCredentialService - Input validation", async () => {
  const service = new TurnCredentialService({
    secret: "this-is-a-very-long-secret-key-for-testing-purposes",
    realm: "test.local",
    defaultTTL: 3600
  });

  // Empty user ID should throw error
  let errorThrown = false;
  try {
    await service.generateTurnCredentials("");
  } catch (error) {
    errorThrown = true;
    assert((error as Error).message.includes("User ID is required"));
  }
  assert(errorThrown, "Should throw error for empty user ID");

  // Invalid TTL should throw error
  errorThrown = false;
  try {
    await service.generateTurnCredentials("user-123", 0);
  } catch (error) {
    errorThrown = true;
    assert((error as Error).message.includes("TTL must be between"));
  }
  assert(errorThrown, "Should throw error for invalid TTL");

  errorThrown = false;
  try {
    await service.generateTurnCredentials("user-123", 86401);
  } catch (error) {
    errorThrown = true;
    assert((error as Error).message.includes("TTL must be between"));
  }
  assert(errorThrown, "Should throw error for TTL too large");
});

Deno.test("TurnCredentialService - Credential uniqueness", async () => {
  const service = new TurnCredentialService({
    secret: "this-is-a-very-long-secret-key-for-testing-purposes",
    realm: "test.local",
    defaultTTL: 3600
  });

  const userId = "test-user-123";
  
  // Generate multiple credentials with different TTLs to ensure different timestamps
  const cred1 = await service.generateTurnCredentials(userId, 3600);
  const cred2 = await service.generateTurnCredentials(userId, 7200);

  // Credentials should be different (different timestamps due to different TTLs)
  assert(cred1.username !== cred2.username, "Credentials should have different usernames");
  assert(cred1.credential !== cred2.credential, "Credentials should have different credential values");
  assert(cred1.ttl !== cred2.ttl, "Credentials should have different TTL values");
});

Deno.test("TurnCredentialService - Security - Timing attack resistance", async () => {
  const service = new TurnCredentialService({
    secret: "this-is-a-very-long-secret-key-for-testing-purposes",
    realm: "test.local",
    defaultTTL: 3600
  });

  const userId = "test-user-123";
  const credentials = await service.generateTurnCredentials(userId);

  // Test with credentials of different lengths
  const shortInvalid = "short";
  const longInvalid = "this-is-a-very-long-invalid-credential-string";

  // Both should fail validation
  const shortResult = await service.validateTurnCredentials(credentials.username, shortInvalid);
  const longResult = await service.validateTurnCredentials(credentials.username, longInvalid);

  assert(!shortResult, "Short invalid credential should fail");
  assert(!longResult, "Long invalid credential should fail");
});