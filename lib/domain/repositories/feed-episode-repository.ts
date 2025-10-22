/**
 * Feed Episode Repository Interface
 * 
 * Defines the contract for feed episode data access operations
 */

import { FeedEpisode, CreateFeedEpisodeData, UpdateFeedEpisodeData } from '../entities/feed-episode.ts';
import { Result, PaginationParams, PaginatedResult } from '../types/common.ts';

/**
 * Feed Episode Repository interface
 */
export interface FeedEpisodeRepository {
  /**
   * Create a new feed episode
   */
  create(data: CreateFeedEpisodeData): Promise<Result<FeedEpisode>>;

  /**
   * Find episode by ID
   */
  findById(id: string): Promise<Result<FeedEpisode | null>>;

  /**
   * Find episode by slug
   */
  findBySlug(slug: string): Promise<Result<FeedEpisode | null>>;

  /**
   * Find all published episodes
   */
  findPublished(params?: PaginationParams): Promise<Result<PaginatedResult<FeedEpisode>>>;

  /**
   * Find all episodes (including unpublished)
   */
  findAll(params?: PaginationParams): Promise<Result<PaginatedResult<FeedEpisode>>>;

  /**
   * Update episode
   */
  update(id: string, data: UpdateFeedEpisodeData): Promise<Result<FeedEpisode>>;

  /**
   * Delete episode (soft delete)
   */
  delete(id: string): Promise<Result<void>>;

  /**
   * Check if slug exists
   */
  slugExists(slug: string, excludeId?: string): Promise<Result<boolean>>;

  /**
   * Find episodes by season
   */
  findBySeason(seasonNumber: number, params?: PaginationParams): Promise<Result<PaginatedResult<FeedEpisode>>>;

  /**
   * Get episode count
   */
  count(): Promise<Result<number>>;

  /**
   * Get published episode count
   */
  countPublished(): Promise<Result<number>>;
}