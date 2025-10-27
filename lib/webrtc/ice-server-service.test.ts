/**
 * ICE Server Service Tests
 * 
 * Tests for ICE server configuration generation and validation.
 */

import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { ICEServerService } from "./ice-server-service.ts";
import { TurnCredentialService } from "./turn-credential-service.ts";

// Mock TURN credential service for testing
class MockTurnCredentialService {
  async generateTurnCredentials(userId: string) {
    return {
      username: `1234567890:${userId}`,
      credential: "mock-credential",
      ttl: 3600,
      expiresAt: new Date(Date.now() + 3600000)
    };
  }

  async validateTurnCredentials(username: string, credential: string) {
    return credential === "mock-credential";
  }

  isCredentialExpired(username: string) {
    return false;
  }

  extractUserIdFromUsername(username: string) {
    const parts = username.split(":");
    return parts.length >= 2 ? parts.slice(1).join(":") : null;
  }
}

Deno.test("ICEServerService - Generate ICE server configuration", async () => {
  const mockTurnService = new MockTurnCredentialService();
  const service = new ICEServerService(mockTurnService as any, {
    stunUrls: ["stun:localhost:3478"],
    turnUrls: ["turn:localhost:3478?transport=udp"],
    host: "localhost",
    port: 3478,
    turnsPort: 5349,
    realm: "test.local",
    isSecure: false
  });

  const userId = "test-user-123";
  const config = await service.generateICEServerConfiguration(userId);

  // Should have both STUN and TURN servers
  assert(config.length >= 2, "Should have at least STUN and TURN servers");

  // Check STUN server
  const stunServer = config.find(server => 
    server.urls.some(url => url.startsWith("stun:"))
  );
  assert(stunServer, "Should have STUN server");
  assertEquals(stunServer.urls, ["stun:localhost:3478"]);
  assert(!stunServer.username, "STUN server should not have username");
  assert(!stunServer.credential, "STUN server should not have credential");

  // Check TURN server
  const turnServer = config.find(server => 
    server.urls.some(url => url.startsWith("turn:"))
  );
  assert(turnServer, "Should have TURN server");
  assertEquals(turnServer.urls, ["turn:localhost:3478?transport=udp"]);
  assertEquals(turnServer.username, "1234567890:test-user-123");
  assertEquals(turnServer.credential, "mock-credential");
  assertEquals(turnServer.credentialType, "password");
});

Deno.test("ICEServerService - Fallback to public STUN servers", async () => {
  const mockTurnService = new MockTurnCredentialService();
  const service = new ICEServerService(mockTurnService as any, {
    stunUrls: [],
    turnUrls: [],
    host: "localhost",
    port: 3478,
    turnsPort: 5349,
    realm: "test.local",
    isSecure: false
  });

  const userId = "test-user-123";
  const config = await service.generateICEServerConfiguration(userId);

  // Should have fallback public STUN servers
  assert(config.length > 0, "Should have fallback STUN servers");
  
  const hasGoogleStun = config.some(server =>
    server.urls.some(url => url.includes("stun.l.google.com"))
  );
  assert(hasGoogleStun, "Should include Google STUN servers as fallback");
});

Deno.test("ICEServerService - Environment configuration loading", () => {
  const mockTurnService = new MockTurnCredentialService();
  
  // Test development configuration
  const devService = new ICEServerService(mockTurnService as any, {
    host: "localhost",
    port: 3478,
    turnsPort: 5349,
    realm: "dev.local",
    isSecure: false
  });

  const devConfig = devService.getEnvironmentConfiguration();
  assertEquals(devConfig.host, "localhost");
  assertEquals(devConfig.port, 3478);
  assertEquals(devConfig.isSecure, false);
  assert(devConfig.stunUrls.includes("stun:localhost:3478"));
  assert(devConfig.turnUrls.includes("turn:localhost:3478?transport=udp"));

  // Test production configuration
  const prodService = new ICEServerService(mockTurnService as any, {
    host: "turn.example.com",
    port: 3478,
    turnsPort: 5349,
    realm: "example.com",
    isSecure: true
  });

  const prodConfig = prodService.getEnvironmentConfiguration();
  assertEquals(prodConfig.host, "turn.example.com");
  assertEquals(prodConfig.isSecure, true);
  assert(prodConfig.turnUrls.includes("turns:turn.example.com:5349?transport=tcp"));
});

Deno.test("ICEServerService - Validate ICE server configuration", () => {
  const mockTurnService = new MockTurnCredentialService();
  const service = new ICEServerService(mockTurnService as any);

  // Valid configuration
  const validConfig = [
    { urls: ["stun:stun.example.com:3478"] },
    { 
      urls: ["turn:turn.example.com:3478"], 
      username: "user", 
      credential: "pass",
      credentialType: "password" as const
    }
  ];
  assert(service.validateICEServerConfig(validConfig), "Valid config should pass validation");

  // Invalid configuration - empty array
  assert(!service.validateICEServerConfig([]), "Empty config should fail validation");

  // Invalid configuration - missing urls
  const invalidConfig1 = [{ username: "user" }] as any;
  assert(!service.validateICEServerConfig(invalidConfig1), "Config without urls should fail validation");

  // Invalid configuration - empty urls array
  const invalidConfig2 = [{ urls: [] }];
  assert(!service.validateICEServerConfig(invalidConfig2), "Config with empty urls should fail validation");

  // Invalid configuration - invalid URL format
  const invalidConfig3 = [{ urls: ["invalid-url"] }];
  assert(!service.validateICEServerConfig(invalidConfig3), "Config with invalid URLs should fail validation");

  // Valid STUN URL
  const stunConfig = [{ urls: ["stun:stun.example.com:3478"] }];
  assert(service.validateICEServerConfig(stunConfig), "Valid STUN config should pass validation");

  // Valid TURN URL
  const turnConfig = [{ urls: ["turn:turn.example.com:3478?transport=udp"] }];
  assert(service.validateICEServerConfig(turnConfig), "Valid TURN config should pass validation");

  // Valid TURNS URL
  const turnsConfig = [{ urls: ["turns:turns.example.com:5349?transport=tcp"] }];
  assert(service.validateICEServerConfig(turnsConfig), "Valid TURNS config should pass validation");
});

Deno.test("ICEServerService - Refresh credentials", async () => {
  const mockTurnService = new MockTurnCredentialService();
  const service = new ICEServerService(mockTurnService as any);

  const userId = "test-user-123";
  const credentials = await service.refreshCredentials(userId);

  assertEquals(credentials.username, "1234567890:test-user-123");
  assertEquals(credentials.credential, "mock-credential");
  assertEquals(credentials.ttl, 3600);
  assert(credentials.expiresAt instanceof Date);
});

Deno.test("ICEServerService - Handle TURN credential generation failure", async () => {
  // Mock service that throws error
  const failingTurnService = {
    async generateTurnCredentials(userId: string) {
      throw new Error("Credential generation failed");
    }
  };

  const service = new ICEServerService(failingTurnService as any, {
    stunUrls: ["stun:localhost:3478"],
    turnUrls: ["turn:localhost:3478"],
    host: "localhost",
    port: 3478,
    turnsPort: 5349,
    realm: "test.local",
    isSecure: false
  });

  const userId = "test-user-123";
  const config = await service.generateICEServerConfiguration(userId);

  // Should still have STUN servers even if TURN credential generation fails
  assert(config.length > 0, "Should have at least STUN servers");
  
  const hasStun = config.some(server =>
    server.urls.some(url => url.startsWith("stun:"))
  );
  assert(hasStun, "Should have STUN servers even when TURN fails");

  // Should not have TURN servers with credentials
  const hasTurnWithCredentials = config.some(server =>
    server.urls.some(url => url.startsWith("turn:")) && server.username
  );
  assert(!hasTurnWithCredentials, "Should not have TURN servers with credentials when generation fails");
});

Deno.test("ICEServerService - Multiple URL formats", () => {
  const mockTurnService = new MockTurnCredentialService();
  const service = new ICEServerService(mockTurnService as any, {
    stunUrls: [
      "stun:stun1.example.com:3478",
      "stun:stun2.example.com:3478"
    ],
    turnUrls: [
      "turn:turn.example.com:3478?transport=udp",
      "turn:turn.example.com:3478?transport=tcp",
      "turns:turn.example.com:5349?transport=tcp"
    ],
    host: "turn.example.com",
    port: 3478,
    turnsPort: 5349,
    realm: "example.com",
    isSecure: true
  });

  const envConfig = service.getEnvironmentConfiguration();
  
  // Should have multiple STUN URLs
  assertEquals(envConfig.stunUrls.length, 2);
  assert(envConfig.stunUrls.includes("stun:stun1.example.com:3478"));
  assert(envConfig.stunUrls.includes("stun:stun2.example.com:3478"));

  // Should have multiple TURN URLs including TURNS (3 provided + 1 auto-added TURNS)
  assertEquals(envConfig.turnUrls.length, 4);
  assert(envConfig.turnUrls.includes("turn:turn.example.com:3478?transport=udp"));
  assert(envConfig.turnUrls.includes("turn:turn.example.com:3478?transport=tcp"));
  assert(envConfig.turnUrls.includes("turns:turn.example.com:5349?transport=tcp"));
});