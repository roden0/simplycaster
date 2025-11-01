// ============================================================================
// Complete Host Setup API
// ============================================================================

import { Handlers } from "$fresh/server.ts";
import { getContainer } from "../../../lib/container/global.ts";
import { ServiceKeys } from "../../../lib/container/registry.ts";
import type { CompleteHostSetupUseCase } from "../../../lib/application/use-cases/user/index.ts";

interface CompleteHostSetupRequestBody {
  token: string;
  name?: string;
  password: string;
  confirmPassword: string;
}

export const handler: Handlers = {
  // POST /api/auth/complete-host-setup - Complete host account setup
  async POST(req, _ctx) {
    try {
      // Parse request body
      const body: CompleteHostSetupRequestBody = await req.json();

      // Validate required fields
      if (!body.token || !body.password || !body.confirmPassword) {
        return new Response(
          JSON.stringify({ error: "Token, password, and confirm password are required" }),
          { 
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Get use case
      const container = getContainer();
      const completeSetupUseCase = await container.get<CompleteHostSetupUseCase>(ServiceKeys.COMPLETE_HOST_SETUP_USE_CASE);

      // Execute use case
      const result = await completeSetupUseCase.execute({
        token: body.token,
        name: body.name,
        password: body.password,
        confirmPassword: body.confirmPassword
      });

      if (!result.success) {
        const status = result.error.name === "ValidationError" ? 400 :
                      result.error.name === "AuthenticationError" ? 401 :
                      result.error.name === "NotFoundError" ? 404 : 500;
        
        return new Response(
          JSON.stringify({ error: result.error.message }),
          { 
            status,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: result.data
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );

    } catch (error) {
      console.error("Error completing host setup:", error);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }
};