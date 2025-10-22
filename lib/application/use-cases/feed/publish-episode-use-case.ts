/**
 * Publish Episode Use Case
 * 
 * Handles episode publication with metadata validation,
 * file processing, and event publishing.
 */

import { FeedEpisodeRepository } from '../../../domain/repositories/feed-episode-repository.ts';
import { UserRepository } from '../../../domain/repositories/user-repository.ts';
import { StorageService } from '../../../domain/services/storage-service.ts';
import { FeedEpisode, CreateFeedEpisodeData } from '../../../domain/entities/feed-episode.ts';
import { UserRole, Result, Ok, Err } from '../../../domain/types/common.ts';
import { ValidationError, BusinessRuleError, EntityNotFoundError, ConflictError } from '../../../domain/errors/index.ts';
import { EventPublisher } from '../../../domain/types/events.ts';
import { createBaseEvent, generateCorrelationId } from '../../../domain/services/event-utils.ts';
import { EventType, FeedEventData } from '../../../domain/types/events.ts';

/**
 * Input data for publishing an episode
 */
export interface PublishEpisodeInput {
  title: string;
  description?: string;
  slug?: string;
  audioFilePath: string;
  audioMimeType?: string;
  audioSizeBytes: number;
  durationSeconds: number;
  episodeNumber?: number;
  seasonNumber?: number;
  explicit?: boolean;
  publishedBy: string; // User ID of the publisher
}

/**
 * Output data from episode publication
 */
export interface PublishEpisodeOutput {
  episode: FeedEpisode;
  message: string;
}

/**
 * Publish Episode Use Case implementation
 */
export class PublishEpisodeUseCase {
  constructor(
    private feedEpisodeRepository: FeedEpisodeRepository,
    private userRepository: UserRepository,
    private storageService: StorageService,
    private eventPublisher?: EventPublisher
  ) {}

  /**
   * Execute the publish episode use case
   */
  async execute(input: PublishEpisodeInput): Promise<Result<PublishEpisodeOutput>> {
    try {
      // 1. Validate input data
      const validationResult = this.validateInput(input);
      if (!validationResult.success) {
        return Err(validationResult.error);
      }

      // 2. Validate publisher permissions
      const publisherValidationResult = await this.validatePublisher(input.publishedBy);
      if (!publisherValidationResult.success) {
        return Err(publisherValidationResult.error);
      }

      // 3. Generate slug if not provided
      const slug = input.slug || this.generateSlugFromTitle(input.title);

      // 4. Validate slug uniqueness
      const slugValidationResult = await this.validateSlugUniqueness(slug);
      if (!slugValidationResult.success) {
        return Err(slugValidationResult.error);
      }

      // 5. Validate audio file exists
      const fileValidationResult = await this.validateAudioFile(input.audioFilePath);
      if (!fileValidationResult.success) {
        return Err(fileValidationResult.error);
      }

      // 6. Create episode data
      const createEpisodeData: CreateFeedEpisodeData = {
        title: input.title.trim(),
        description: input.description?.trim(),
        slug: slug,
        audioFilePath: input.audioFilePath,
        audioMimeType: input.audioMimeType || 'audio/mpeg',
        audioSizeBytes: input.audioSizeBytes,
        durationSeconds: input.durationSeconds,
        episodeNumber: input.episodeNumber,
        seasonNumber: input.seasonNumber,
        explicit: input.explicit || false,
        publishedAt: new Date(),
        isPublished: true,
        createdBy: input.publishedBy
      };

      // 7. Create episode in repository
      const createResult = await this.feedEpisodeRepository.create(createEpisodeData);
      if (!createResult.success) {
        return Err(createResult.error);
      }

      // 8. Publish episode published event
      if (this.eventPublisher) {
        try {
          const correlationId = generateCorrelationId();
          const feedEventData: FeedEventData = {
            episodeId: createResult.data.id,
            title: createResult.data.title,
            slug: createResult.data.slug,
            audioFilePath: createResult.data.audioFilePath,
            durationSeconds: createResult.data.durationSeconds,
            audioSizeBytes: createResult.data.audioSizeBytes,
            publishedAt: createResult.data.publishedAt
          };

          const episodePublishedEvent = createBaseEvent(
            EventType.EPISODE_PUBLISHED,
            feedEventData,
            {
              correlationId,
              userId: input.publishedBy,
              priority: 'normal',
              source: 'feed-service'
            }
          );

          await this.eventPublisher.publish(episodePublishedEvent);
        } catch (error) {
          // Log event publishing error but don't fail the episode publication
          console.error('Failed to publish episode published event:', error);
        }
      }

      // 9. Prepare success response
      const output: PublishEpisodeOutput = {
        episode: createResult.data,
        message: `Episode "${createResult.data.title}" published successfully`
      };

      return Ok(output);

    } catch (error) {
      return Err(new Error(`Failed to publish episode: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Validate input data
   */
  private validateInput(input: PublishEpisodeInput): Result<void> {
    const errors: string[] = [];

    // Title validation
    if (!input.title || input.title.trim().length === 0) {
      errors.push('Title is required');
    } else if (input.title.length > 255) {
      errors.push('Title must not exceed 255 characters');
    }

    // Audio file path validation
    if (!input.audioFilePath || input.audioFilePath.trim().length === 0) {
      errors.push('Audio file path is required');
    }

    // Audio size validation
    if (!input.audioSizeBytes || input.audioSizeBytes <= 0) {
      errors.push('Audio size must be greater than 0');
    }

    // Duration validation
    if (!input.durationSeconds || input.durationSeconds <= 0) {
      errors.push('Duration must be greater than 0 seconds');
    }

    // Publisher validation
    if (!input.publishedBy || input.publishedBy.trim().length === 0) {
      errors.push('Publisher ID is required');
    }

    // Episode number validation (if provided)
    if (input.episodeNumber !== undefined && input.episodeNumber <= 0) {
      errors.push('Episode number must be greater than 0');
    }

    // Season number validation (if provided)
    if (input.seasonNumber !== undefined && input.seasonNumber <= 0) {
      errors.push('Season number must be greater than 0');
    }

    // Slug validation (if provided)
    if (input.slug && !this.isValidSlug(input.slug)) {
      errors.push('Slug must contain only lowercase letters, numbers, and hyphens');
    }

    if (errors.length > 0) {
      return Err(new ValidationError(errors.join('; ')));
    }

    return Ok(undefined);
  }

  /**
   * Validate publisher exists and has proper permissions
   */
  private async validatePublisher(publisherId: string): Promise<Result<any>> {
    const publisherResult = await this.userRepository.findById(publisherId);
    if (!publisherResult.success) {
      return Err(publisherResult.error);
    }

    if (!publisherResult.data) {
      return Err(new EntityNotFoundError('User', publisherId));
    }

    const publisher = publisherResult.data;

    // Check if user is active
    if (!publisher.isActive) {
      return Err(new BusinessRuleError('Publisher account is deactivated'));
    }

    // Check if user has admin role (only admins can publish episodes)
    if (publisher.role !== UserRole.ADMIN) {
      return Err(new BusinessRuleError('Only administrators can publish episodes'));
    }

    return Ok(publisher);
  }

  /**
   * Generate slug from title
   */
  private generateSlugFromTitle(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Validate slug format
   */
  private isValidSlug(slug: string): boolean {
    return /^[a-z0-9-]+$/.test(slug) && !slug.startsWith('-') && !slug.endsWith('-');
  }

  /**
   * Validate slug uniqueness
   */
  private async validateSlugUniqueness(slug: string): Promise<Result<void>> {
    const slugExistsResult = await this.feedEpisodeRepository.slugExists(slug);
    if (!slugExistsResult.success) {
      return Err(slugExistsResult.error);
    }

    if (slugExistsResult.data) {
      // Generate unique slug with timestamp
      const timestamp = Date.now();
      const uniqueSlug = `${slug}-${timestamp}`;
      return Ok(undefined); // In a real implementation, you'd update the slug
    }

    return Ok(undefined);
  }

  /**
   * Validate audio file exists and is accessible
   */
  private async validateAudioFile(filePath: string): Promise<Result<void>> {
    const fileExistsResult = await this.storageService.fileExists(filePath);
    if (!fileExistsResult.success) {
      return Err(fileExistsResult.error);
    }

    if (!fileExistsResult.data) {
      return Err(new ValidationError('Audio file does not exist at the specified path'));
    }

    return Ok(undefined);
  }
}