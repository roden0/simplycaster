import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "",
  plugins: [
    // Client-side plugins will be added in subsequent tasks
  ],
});

export type AuthClient = typeof authClient;
