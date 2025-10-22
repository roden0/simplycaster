#!/usr/bin/env -S deno run -A

// ============================================================================
// SimplyCaster Secret Generation Script
// Generates secure secrets for production deployment
// ============================================================================

import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";
import { encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";

/**
 * Generates a cryptographically secure random string
 * @param length - Length of the generated string in bytes
 * @returns Base64 encoded random string
 */
function generateSecureSecret(length: number = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return encode(bytes);
}

/**
 * Generates a secure password
 * @param length - Length of the password
 * @returns Secure password with mixed characters
 */
function generateSecurePassword(length: number = 24): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  
  return Array.from(bytes)
    .map(byte => chars[byte % chars.length])
    .join("");
}

/**
 * Prompts user for input with a default value
 */
async function prompt(message: string, defaultValue?: string): Promise<string> {
  const input = globalThis.prompt(`${message}${defaultValue ? ` (${defaultValue})` : ""}: `);
  return input?.trim() || defaultValue || "";
}

async function generateSecrets() {
  console.log("🔐 SimplyCaster Secret Generation");
  console.log("=====================================\n");

  console.log("This script will generate secure secrets for production deployment.");
  console.log("⚠️  Keep these secrets safe and never commit them to version control!\n");

  // Get configuration
  const environment = await prompt("Environment", "production");
  const dbUser = await prompt("Database username", "app");
  const dbName = await prompt("Database name", "appdb");

  console.log("\n🔄 Generating secure secrets...\n");

  // Generate secrets
  const secrets = {
    db_user: dbUser,
    db_password: generateSecurePassword(32),
    db_name: dbName,
    jwt_secret: generateSecureSecret(48),
    pepper_secret: generateSecureSecret(48),
  };

  // Create secrets directory if it doesn't exist
  try {
    await Deno.mkdir("secrets", { recursive: true });
  } catch (error) {
    // Directory might already exist
  }

  // Write secrets to files
  for (const [name, value] of Object.entries(secrets)) {
    const filename = `secrets/${name}.${environment}.txt`;
    await Deno.writeTextFile(filename, value);
    
    // Set restrictive permissions (Unix-like systems)
    try {
      await Deno.chmod(filename, 0o600);
    } catch (error) {
      // Might not be supported on all systems
    }
    
    console.log(`✅ Generated: ${filename}`);
  }

  console.log("\n📋 Generated Secrets Summary:");
  console.log("============================");
  console.log(`Database User: ${secrets.db_user}`);
  console.log(`Database Name: ${secrets.db_name}`);
  console.log(`Database Password: ${secrets.db_password.substring(0, 8)}... (${secrets.db_password.length} chars)`);
  console.log(`JWT Secret: ${secrets.jwt_secret.substring(0, 12)}... (${secrets.jwt_secret.length} chars)`);
  console.log(`Pepper Secret: ${secrets.pepper_secret.substring(0, 12)}... (${secrets.pepper_secret.length} chars)`);

  console.log("\n🔒 Security Recommendations:");
  console.log("============================");
  console.log("1. Store secrets in a secure password manager");
  console.log("2. Use different secrets for each environment");
  console.log("3. Rotate JWT secrets regularly (monthly)");
  console.log("4. NEVER rotate pepper secrets (breaks password hashes)");
  console.log("5. Set up secret monitoring and alerting");
  console.log("6. Use external secret management in production (AWS Secrets Manager, etc.)");

  console.log("\n🐳 Docker Deployment:");
  console.log("=====================");
  console.log("Update your docker-compose.yml secrets section:");
  console.log(`
secrets:
  db_user:
    file: ./secrets/db_user.${environment}.txt
  db_password:
    file: ./secrets/db_password.${environment}.txt
  db_name:
    file: ./secrets/db_name.${environment}.txt
  jwt_secret:
    file: ./secrets/jwt_secret.${environment}.txt
  pepper_secret:
    file: ./secrets/pepper_secret.${environment}.txt
`);

  console.log("\n✅ Secret generation completed successfully!");
  console.log("🔐 Keep these secrets safe and secure!");
}

// Run if executed directly
if (import.meta.main) {
  try {
    await generateSecrets();
  } catch (error) {
    console.error("❌ Secret generation failed:", error);
    Deno.exit(1);
  }
}