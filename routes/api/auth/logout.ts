/**
 * Authentication Logout Route
 * 
 * Handles user logout by clearing authentication tokens
 */

import { define } from "../../../utils.ts";

export const handler = define.handlers({
  POST(_req) {
    try {
      // Clear the authentication cookie
      return new Response(
        JSON.stringify({
          success: true,
          message: "Logged out successfully"
        }),
        {
          status: 200,
          headers: { 
            "Content-Type": "application/json",
            // Clear the auth cookie
            "Set-Cookie": "auth_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
          }
        }
      );

    } catch (error) {
      console.error("Logout route error:", error);
      
      return new Response(
        JSON.stringify({
          success: false,
          error: "Internal server error",
          code: "INTERNAL_ERROR"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }
});