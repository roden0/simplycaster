// ============================================================================
// API Route: Unique Slug Validation
// SimplyCaster Centralized Form Validation System
// ============================================================================

import { Handlers } from "$fresh/server.ts";
import { eq, and, ne, sql } from "drizzle-orm";
import { db } from "../../../database/connection.ts";
import { rooms, feedEpisodes } from "../../../database/schema.ts";

interface UniqueSlugRequest {
  slug: string;
  entityType: 'room' | 'episode';
  excludeId?: string; // Entity ID to exclude from uniqueness check (for updates)
}

interface UniqueSlugResponse {
  unique: boolean;
  slug: string;
  entityType: string;
  reason?: string;
}

export const handler: Handlers = {
  async POST(req, _ctx) {
    try {
      const body: UniqueSlugRequest = await req.json();
      
      if (!body.slug || typeof body.slug !== 'string') {
        return new Response(
          JSON.stringify({ error: 'Slug is required' }),
          { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (!body.entityType || !['room', 'episode'].includes(body.entityType)) {
        return new Response(
          JSON.stringify({ error: 'Valid entityType is required (room or episode)' }),
          { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      const slug = body.slug.trim().toLowerCase();
      const entityType = body.entityType;
      
      // Validate slug format
      const slugRegex = /^[a-z0-9-]+$/;
      if (!slugRegex.test(slug)) {
        return new Response(
          JSON.stringify({ 
            unique: false, 
            slug,
            entityType,
            reason: 'Invalid slug format. Only lowercase letters, numbers, and hyphens are allowed.'
          } as UniqueSlugResponse),
          { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      // Check minimum length
      if (slug.length < 3) {
        return new Response(
          JSON.stringify({ 
            unique: false, 
            slug,
            entityType,
            reason: 'Slug must be at least 3 characters long.'
          } as UniqueSlugResponse),
          { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      let isUnique = false;

      if (entityType === 'room') {
        // Check room slug uniqueness
        let whereConditions = and(
          eq(rooms.slug, slug),
          sql`${rooms.closedAt} IS NULL` // Only check active rooms
        );

        // Exclude specific room ID if provided (for updates)
        if (body.excludeId) {
          whereConditions = and(
            whereConditions,
            ne(rooms.id, body.excludeId)
          );
        }

        const existingRoom = await db
          .select({ id: rooms.id, slug: rooms.slug })
          .from(rooms)
          .where(whereConditions)
          .limit(1);

        isUnique = existingRoom.length === 0;

      } else if (entityType === 'episode') {
        // Check episode slug uniqueness
        let whereConditions = and(
          eq(feedEpisodes.slug, slug),
          sql`${feedEpisodes.deletedAt} IS NULL` // Only check active episodes
        );

        // Exclude specific episode ID if provided (for updates)
        if (body.excludeId) {
          whereConditions = and(
            whereConditions,
            ne(feedEpisodes.id, body.excludeId)
          );
        }

        const existingEpisode = await db
          .select({ id: feedEpisodes.id, slug: feedEpisodes.slug })
          .from(feedEpisodes)
          .where(whereConditions)
          .limit(1);

        isUnique = existingEpisode.length === 0;
      }

      const response: UniqueSlugResponse = {
        unique: isUnique,
        slug,
        entityType,
        ...(isUnique ? {} : { reason: `${entityType === 'room' ? 'Room name' : 'Episode title'} already in use` })
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
      console.error('Error validating slug uniqueness:', error);
      
      return new Response(
        JSON.stringify({ 
          error: 'Internal server error',
          unique: false,
          slug: '',
          entityType: ''
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