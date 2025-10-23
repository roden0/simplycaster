// ============================================================================
// API Route: Unique Email Validation
// SimplyCaster Centralized Form Validation System
// ============================================================================

import { Handlers } from "$fresh/server.ts";
import { eq, and, ne, sql } from "drizzle-orm";
import { db } from "../../../database/connection.ts";
import { users } from "../../../database/schema.ts";

interface UniqueEmailRequest {
  email: string;
  excludeId?: string; // User ID to exclude from uniqueness check (for updates)
}

interface UniqueEmailResponse {
  unique: boolean;
  email: string;
  reason?: string;
}

export const handler: Handlers = {
  async POST(req, _ctx) {
    try {
      const body: UniqueEmailRequest = await req.json();
      
      if (!body.email || typeof body.email !== 'string') {
        return new Response(
          JSON.stringify({ error: 'Email is required' }),
          { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      const email = body.email.trim().toLowerCase();
      
      // Basic email format validation
      const emailRegex = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
      
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({ 
            unique: false, 
            email,
            reason: 'Invalid email format'
          } as UniqueEmailResponse),
          { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      // Build query conditions
      let whereConditions = and(
        eq(sql`LOWER(${users.email})`, email),
        sql`${users.deletedAt} IS NULL` // Only check active users
      );

      // Exclude specific user ID if provided (for updates)
      if (body.excludeId) {
        whereConditions = and(
          whereConditions,
          ne(users.id, body.excludeId)
        );
      }

      // Check if email exists
      const existingUser = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(whereConditions)
        .limit(1);

      const isUnique = existingUser.length === 0;

      const response: UniqueEmailResponse = {
        unique: isUnique,
        email,
        ...(isUnique ? {} : { reason: 'Email already in use' })
      };

      return new Response(
        JSON.stringify(response),
        { 
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        }
      );

    } catch (error) {
      console.error('Error validating email uniqueness:', error);
      
      return new Response(
        JSON.stringify({ 
          error: 'Internal server error',
          unique: false,
          email: ''
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  },

  // Handle preflight requests for CORS
  async OPTIONS(_req, _ctx) {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
};