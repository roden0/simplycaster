// ============================================================================
// SimplyCaster Secrets Management
// Secure handling of Docker secrets and environment variables
// ============================================================================

/**
 * Reads a Docker secret from the filesystem
 * @param secretName - Name of the secret file
 * @returns The secret value as a string, trimmed of whitespace
 */
export async function readSecret(secretName: string): Promise<string | null> {
  try {
    const secretPath = `/run/secrets/${secretName}`;
    const content = await Deno.readTextFile(secretPath);
    return content.trim();
  } catch (error) {
    // Secret file doesn't exist or can't be read
    return null;
  }
}

/**
 * Gets a configuration value from environment variable or Docker secret
 * @param envVar - Environment variable name
 * @param secretName - Docker secret name (optional)
 * @param defaultValue - Default value if neither env var nor secret exists
 * @returns The configuration value
 */
export async function getConfig(
  envVar: string,
  secretName?: string,
  defaultValue?: string
): Promise<string | null> {
  // First try environment variable
  const envValue = Deno.env.get(envVar);
  if (envValue) {
    return envValue;
  }

  // Then try Docker secret
  if (secretName) {
    const secretValue = await readSecret(secretName);
    if (secretValue) {
      return secretValue;
    }
  }

  // Finally return default value
  return defaultValue || null;
}

/**
 * Constructs database URL from secrets or environment variables
 * @returns Complete PostgreSQL connection URL
 */
export async function getDatabaseUrl(): Promise<string> {
  // First check if DATABASE_URL is directly provided
  const directUrl = await getConfig("DATABASE_URL");
  if (directUrl) {
    return directUrl;
  }

  // Construct from individual components
  const dbUser = await getConfig("DB_USER", "db_user", "app");
  const dbPassword = await getConfig("DB_PASSWORD", "db_password", "secret");
  const dbName = await getConfig("DB_NAME", "db_name", "appdb");
  const dbHost = await getConfig("DB_HOST", undefined, "localhost");
  const dbPort = await getConfig("DB_PORT", undefined, "5432");

  if (!dbUser || !dbPassword || !dbName) {
    throw new Error(
      "Database configuration incomplete. Please provide DATABASE_URL or " +
      "ensure all database secrets/environment variables are set."
    );
  }

  return `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
}

/**
 * Gets JWT secret from environment or Docker secret
 * @returns JWT secret for token signing
 */
export async function getJwtSecret(): Promise<string> {
  const secret = await getConfig("JWT_SECRET", "jwt_secret");
  
  if (!secret) {
    throw new Error(
      "JWT_SECRET is required. Please set JWT_SECRET environment variable " +
      "or provide jwt_secret Docker secret."
    );
  }

  if (secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be at least 32 characters long for security."
    );
  }

  return secret;
}

/**
 * Gets password pepper from environment or Docker secret
 * @returns Global pepper for password hashing
 */
export async function getPepperSecret(): Promise<string> {
  const pepper = await getConfig("PEPPER_SECRET", "pepper_secret");
  
  if (!pepper) {
    throw new Error(
      "PEPPER_SECRET is required for password hashing. Please set PEPPER_SECRET " +
      "environment variable or provide pepper_secret Docker secret."
    );
  }

  if (pepper.length < 32) {
    throw new Error(
      "PEPPER_SECRET must be at least 32 characters long for security."
    );
  }

  return pepper;
}

/**
 * Validates that all required secrets are available
 * @returns Promise that resolves if all secrets are valid
 */
export async function validateSecrets(): Promise<void> {
  try {
    await getDatabaseUrl();
    await getJwtSecret();
    await getPepperSecret();
    console.log("✅ All required secrets validated successfully");
  } catch (error) {
    console.error("❌ Secret validation failed:", error.message);
    throw error;
  }
}