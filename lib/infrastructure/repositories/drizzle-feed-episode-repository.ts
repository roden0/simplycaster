/**
 * Drizzle Feed Episode Repository Implementation
 * 
 * Implements FeedEpisodeRepository using Drizzle ORM for PostgreSQL
 */

import { Database } from '../../../database/connection.ts';
import { feedEpisodes } from '../../../database/schema.ts';
import { FeedEpisodeRepository } from '../../domain/repositories/feed-episode-repository.ts';
import { FeedEpisode, CreateFeedEpisodeData, UpdateFeedEpisodeData } from '../../domain/entities/feed-episode.ts';
import { Result, PaginationParams, PaginatedResult } from '../../domain/types/common.ts';
import { eq, desc, asc, count, and, isNull, sql } from 'drizzle-orm';

/**
 * Drizzle implementation of FeedEpisodeRepository
 */
export class DrizzleFeedEpisodeRepository implements FeedEpisodeRepository {
  constructor(private db: Database) {}

  /**
   * Create a new feed episode
   */
  async create(data: CreateFeedEpisodeData): Promise<Result<FeedEpisode>> {
    try {
      const [episode] = await this.db
        .insert(feedEpisodes)
        .values({
          title: data.title,
          description: data.description,
          slug: data.slug,
          audioFilePath: data.audioFilePath,
          audioMimeType: data.audioMimeType,
          audioSizeBytes: data.audioSizeBytes,
          durationSeconds: data.durationSeconds,
          episodeNumber: data.episodeNumber,
          seasonNumber: data.seasonNumber,
          explicit: data.explicit || false,
          publishedAt: data.publishedAt,
          isPublished: data.isPublished || false,
          createdBy: data.createdBy,
        })
        .returning();

      return {
        success: true,
        data: this.mapToEntity(episode),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create feed episode',
      };
    }
  }

  /**
   * Find episode by ID
   */
  async findById(id: string): Promise<Result<FeedEpisode | null>> {
    try {
      const [episode] = await this.db
        .select()
        .from(feedEpisodes)
        .where(and(
          eq(feedEpisodes.id, id),
          isNull(feedEpisodes.deletedAt)
        ))
        .limit(1);

      return {
        success: true,
        data: episode ? this.mapToEntity(episode) : null,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to find feed episode',
      };
    }
  }

  /**
   * Find episode by slug
   */
  async findBySlug(slug: string): Promise<Result<FeedEpisode | null>> {
    try {
      const [episode] = await this.db
        .select()
        .from(feedEpisodes)
        .where(and(
          eq(feedEpisodes.slug, slug),
          isNull(feedEpisodes.deletedAt)
        ))
        .limit(1);

      return {
        success: true,
        data: episode ? this.mapToEntity(episode) : null,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to find feed episode by slug',
      };
    }
  }

  /**
   * Find all published episodes
   */
  async findPublished(params?: PaginationParams): Promise<Result<PaginatedResult<FeedEpisode>>> {
    try {
      const limit = params?.limit || 20;
      const offset = params?.offset || 0;

      const episodes = await this.db
        .select()
        .from(feedEpisodes)
        .where(and(
          eq(feedEpisodes.isPublished, true),
          isNull(feedEpisodes.deletedAt)
        ))
        .orderBy(desc(feedEpisodes.publishedAt))
        .limit(limit)
        .offset(offset);

      const [totalResult] = await this.db
        .select({ count: count() })
        .from(feedEpisodes)
        .where(and(
          eq(feedEpisodes.isPublished, true),
          isNull(feedEpisodes.deletedAt)
        ));

      return {
        success: true,
        data: {
          items: episodes.map(episode => this.mapToEntity(episode)),
          total: totalResult.count,
          limit,
          offset,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to find published episodes',
      };
    }
  }

  /**
   * Find all episodes (including unpublished)
   */
  async findAll(params?: PaginationParams): Promise<Result<PaginatedResult<FeedEpisode>>> {
    try {
      const limit = params?.limit || 20;
      const offset = params?.offset || 0;

      const episodes = await this.db
        .select()
        .from(feedEpisodes)
        .where(isNull(feedEpisodes.deletedAt))
        .orderBy(desc(feedEpisodes.createdAt))
        .limit(limit)
        .offset(offset);

      const [totalResult] = await this.db
        .select({ count: count() })
        .from(feedEpisodes)
        .where(isNull(feedEpisodes.deletedAt));

      return {
        success: true,
        data: {
          items: episodes.map(episode => this.mapToEntity(episode)),
          total: totalResult.count,
          limit,
          offset,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to find episodes',
      };
    }
  }

  /**
   * Update episode
   */
  async update(id: string, data: UpdateFeedEpisodeData): Promise<Result<FeedEpisode>> {
    try {
      const updateData: any = {
        updatedAt: new Date(),
      };

      // Only update provided fields
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.slug !== undefined) updateData.slug = data.slug;
      if (data.audioFilePath !== undefined) updateData.audioFilePath = data.audioFilePath;
      if (data.audioMimeType !== undefined) updateData.audioMimeType = data.audioMimeType;
      if (data.audioSizeBytes !== undefined) updateData.audioSizeBytes = data.audioSizeBytes;
      if (data.durationSeconds !== undefined) updateData.durationSeconds = data.durationSeconds;
      if (data.episodeNumber !== undefined) updateData.episodeNumber = data.episodeNumber;
      if (data.seasonNumber !== undefined) updateData.seasonNumber = data.seasonNumber;
      if (data.explicit !== undefined) updateData.explicit = data.explicit;
      if (data.publishedAt !== undefined) updateData.publishedAt = data.publishedAt;
      if (data.isPublished !== undefined) updateData.isPublished = data.isPublished;

      const [episode] = await this.db
        .update(feedEpisodes)
        .set(updateData)
        .where(and(
          eq(feedEpisodes.id, id),
          isNull(feedEpisodes.deletedAt)
        ))
        .returning();

      if (!episode) {
        return {
          success: false,
          error: 'Feed episode not found',
        };
      }

      return {
        success: true,
        data: this.mapToEntity(episode),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update feed episode',
      };
    }
  }

  /**
   * Delete episode (soft delete)
   */
  async delete(id: string): Promise<Result<void>> {
    try {
      const [episode] = await this.db
        .update(feedEpisodes)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(feedEpisodes.id, id),
          isNull(feedEpisodes.deletedAt)
        ))
        .returning();

      if (!episode) {
        return {
          success: false,
          error: 'Feed episode not found',
        };
      }

      return {
        success: true,
        data: undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete feed episode',
      };
    }
  }

  /**
   * Check if slug exists
   */
  async slugExists(slug: string, excludeId?: string): Promise<Result<boolean>> {
    try {
      const conditions = [
        eq(feedEpisodes.slug, slug),
        isNull(feedEpisodes.deletedAt),
      ];

      if (excludeId) {
        conditions.push(sql`${feedEpisodes.id} != ${excludeId}`);
      }

      const [result] = await this.db
        .select({ count: count() })
        .from(feedEpisodes)
        .where(and(...conditions));

      return {
        success: true,
        data: result.count > 0,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check slug existence',
      };
    }
  }

  /**
   * Find episodes by season
   */
  async findBySeason(seasonNumber: number, params?: PaginationParams): Promise<Result<PaginatedResult<FeedEpisode>>> {
    try {
      const limit = params?.limit || 20;
      const offset = params?.offset || 0;

      const episodes = await this.db
        .select()
        .from(feedEpisodes)
        .where(and(
          eq(feedEpisodes.seasonNumber, seasonNumber),
          isNull(feedEpisodes.deletedAt)
        ))
        .orderBy(asc(feedEpisodes.episodeNumber))
        .limit(limit)
        .offset(offset);

      const [totalResult] = await this.db
        .select({ count: count() })
        .from(feedEpisodes)
        .where(and(
          eq(feedEpisodes.seasonNumber, seasonNumber),
          isNull(feedEpisodes.deletedAt)
        ));

      return {
        success: true,
        data: {
          items: episodes.map(episode => this.mapToEntity(episode)),
          total: totalResult.count,
          limit,
          offset,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to find episodes by season',
      };
    }
  }

  /**
   * Get episode count
   */
  async count(): Promise<Result<number>> {
    try {
      const [result] = await this.db
        .select({ count: count() })
        .from(feedEpisodes)
        .where(isNull(feedEpisodes.deletedAt));

      return {
        success: true,
        data: result.count,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to count episodes',
      };
    }
  }

  /**
   * Get published episode count
   */
  async countPublished(): Promise<Result<number>> {
    try {
      const [result] = await this.db
        .select({ count: count() })
        .from(feedEpisodes)
        .where(and(
          eq(feedEpisodes.isPublished, true),
          isNull(feedEpisodes.deletedAt)
        ));

      return {
        success: true,
        data: result.count,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to count published episodes',
      };
    }
  }

  /**
   * Map database record to domain entity
   */
  private mapToEntity(record: any): FeedEpisode {
    return {
      id: record.id,
      title: record.title,
      description: record.description,
      slug: record.slug,
      audioFilePath: record.audioFilePath,
      audioMimeType: record.audioMimeType,
      audioSizeBytes: record.audioSizeBytes,
      durationSeconds: record.durationSeconds,
      episodeNumber: record.episodeNumber,
      seasonNumber: record.seasonNumber,
      explicit: record.explicit,
      publishedAt: record.publishedAt,
      isPublished: record.isPublished,
      createdBy: record.createdBy,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      deletedAt: record.deletedAt,
    };
  }
}