import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../../database/connection.ts";

// Basic Better Auth configuration
// Full configuration will be completed in subsequent tasks
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Will be enabled after migration
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  plugins: [
    // JWT plugin for API token compatibility
    // Will be configured in subsequent tasks
  ],
});

// Types will be properly inferred after Better Auth is fully configured
export type Session = any; // TODO: Replace with proper type after configuration
export type User = any; // TODO: Replace with proper type after configuration
