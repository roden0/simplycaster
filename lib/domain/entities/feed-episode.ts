/**
 * Feed Episode Entity
 * 
 * Represents a podcast episode in the feed system
 */

import { ValidationError } from '../errors/index.ts';

/**
 * Feed Episode entity interface
 */
export interface FeedEpisode {
  id: string;
  title: string;
  description?: string;
  slug: string;
  audioFilePath: string;
  audioMimeType: string;
  audioSizeBytes: number;
  durationSeconds: number;
  episodeNumber?: number;
  seasonNumber?: number;
  explicit: boolean;
  publishedAt?: Date;
  isPublished: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

/**
 * Data required to create a new feed episode
 */
export interface CreateFeedEpisodeData {
  title: string;
  description?: string;
  slug: string;
  audioFilePath: string;
  audioMimeType: string;
  audioSizeBytes: number;
  durationSeconds: number;
  episodeNumber?: number;
  seasonNumber?: number;
  explicit: boolean;
  publishedAt?: Date;
  isPublished: boolean;
  createdBy: string;
}

/**
 * Data that can be updated for a feed episode
 */
export interface UpdateFeedEpisodeData {
  title?: string;
  description?: string;
  slug?: string;
  episodeNumber?: number;
  seasonNumber?: number;
  explicit?: boolean;
  publishedAt?: Date;
  isPublished?: boolean;
}

/**
 * Feed Episode domain logic
 */
export class FeedEpisodeDomain {
  /**
   * Validate episode title
   */
  static validateTitle(title: string): void {
    if (!title || title.trim().length === 0) {
      throw new ValidationError('Episode title is required');
    }

    if (title.length > 255) {
      throw new ValidationError('Episode title must not exceed 255 characters');
    }
  }

  /**
   * Validate episode slug
   */
  static validateSlug(slug: string): void {
    if (!slug || slug.trim().length === 0) {
      throw new ValidationError('Episode slug is required');
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new ValidationError('Episode slug must contain only lowercase letters, numbers, and hyphens');
    }

    if (slug.startsWith('-') || slug.endsWith('-')) {
      throw new ValidationError('Episode slug cannot start or end with a hyphen');
    }

    if (slug.length > 255) {
      throw new ValidationError('Episode slug must not exceed 255 characters');
    }
  }

  /**
   * Validate audio file path
   */
  static validateAudioFilePath(filePath: string): void {
    if (!filePath || filePath.trim().length === 0) {
      throw new ValidationError('Audio file path is required');
    }
  }

  /**
   * Validate audio size
   */
  static validateAudioSize(sizeBytes: number): void {
    if (!sizeBytes || sizeBytes <= 0) {
      throw new ValidationError('Audio size must be greater than 0');
    }

    // Maximum file size: 500MB
    const maxSizeBytes = 500 * 1024 * 1024;
    if (sizeBytes > maxSizeBytes) {
      throw new ValidationError('Audio file size cannot exceed 500MB');
    }
  }

  /**
   * Validate duration
   */
  static validateDuration(durationSeconds: number): void {
    if (!durationSeconds || durationSeconds <= 0) {
      throw new ValidationError('Duration must be greater than 0 seconds');
    }

    // Maximum duration: 12 hours
    const maxDurationSeconds = 12 * 60 * 60;
    if (durationSeconds > maxDurationSeconds) {
      throw new ValidationError('Episode duration cannot exceed 12 hours');
    }
  }

  /**
   * Validate episode number
   */
  static validateEpisodeNumber(episodeNumber: number): void {
    if (episodeNumber <= 0) {
      throw new ValidationError('Episode number must be greater than 0');
    }

    if (episodeNumber > 9999) {
      throw new ValidationError('Episode number cannot exceed 9999');
    }
  }

  /**
   * Validate season number
   */
  static validateSeasonNumber(seasonNumber: number): void {
    if (seasonNumber <= 0) {
      throw new ValidationError('Season number must be greater than 0');
    }

    if (seasonNumber > 999) {
      throw new ValidationError('Season number cannot exceed 999');
    }
  }

  /**
   * Generate slug from title
   */
  static generateSlugFromTitle(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Check if episode is published
   */
  static isPublished(episode: FeedEpisode): boolean {
    return episode.isPublished && episode.publishedAt !== undefined;
  }

  /**
   * Check if episode is draft
   */
  static isDraft(episode: FeedEpisode): boolean {
    return !episode.isPublished;
  }

  /**
   * Check if episode is deleted
   */
  static isDeleted(episode: FeedEpisode): boolean {
    return episode.deletedAt !== undefined;
  }

  /**
   * Create update data for publishing episode
   */
  static publishEpisode(): UpdateFeedEpisodeData {
    return {
      isPublished: true,
      publishedAt: new Date()
    };
  }

  /**
   * Create update data for unpublishing episode
   */
  static unpublishEpisode(): UpdateFeedEpisodeData {
    return {
      isPublished: false
    };
  }

  /**
   * Format duration for display
   */
  static formatDuration(durationSeconds: number): string {
    const hours = Math.floor(durationSeconds / 3600);
    const minutes = Math.floor((durationSeconds % 3600) / 60);
    const seconds = durationSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Format file size for display
   */
  static formatFileSize(sizeBytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = sizeBytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}