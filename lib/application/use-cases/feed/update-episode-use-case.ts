/**
 * Update Episode Use Case
 * 
 * Handles episode updates with metadata validation and event publishing.
 */

import { FeedEpisodeRepository } from '../../../domain/repositories/feed-episode-repository.ts';
import { UserRepository } from '../../../domain/repositories/user-repository.ts';
import { FeedEpisode, UpdateFeedEpisodeData } from '../../../domain/entities/feed-episode.ts';
import { UserRole, Result, Ok, Err } from '../../../domain/types/common.ts';
import { ValidationError, BusinessRuleError, EntityNotFoundError, AuthorizationError } from '../../../domain/errors/index.ts';
import { EventPublisher } from '../../../domain/types/events.ts';
import { createBaseEvent, generateCorrelationId } from '../../../domain/services/event-utils.ts';
import { EventType, FeedEventData } from '../../../domain/types/events.ts';

/**
 * Input data for updating an episode
 */
export interface UpdateEpisodeInput {
  episodeId: string;
  title?: string;
  description?: string;
  slug?: string;
  episodeNumber?: number;
  seasonNumber?: number;
  explicit?: boolean;
  isPublished?: boolean;
  updatedBy: string; // User ID of the updater
}

/**
 * Output data from episode update
 */
export interface UpdateEpisodeOutput {
  episode: FeedEpisode;
  message: string;
  changedFields: string[];
}

/**
 * Update Episode Use Case implementation
 */
export class UpdateEpisodeUseCase {
  constructor(
    private feedEpisodeRepository: FeedEpisodeRepository,
    private userRepository: UserRepository,
    private eventPublisher?: EventPublisher
  ) {}

  /**
   * Execute the update episode use case
   */
  async execute(input: UpdateEpisodeInput): Promise<Result<UpdateEpisodeOutput>> {
    try {
      // 1. Validate input data
      const validationResult = this.validateInput(input);
      if (!validationResult.success) {
        return Err(validationResult.error);
      }

      // 2. Find the episode to update
      const episodeResult = await this.feedEpisodeRepository.findById(input.episodeId);
      if (!episodeResult.success) {
        return Err(episodeResult.error);
      }

      if (!episodeResult.data) {
        return Err(new EntityNotFoundError('Episode', input.episodeId));
      }

      const currentEpisode = episodeResult.data;

      // 3. Validate updater permissions
      const updaterValidationResult = await this.validateUpdater(input.updatedBy);
      if (!updaterValidationResult.success) {
        return Err(updaterValidationResult.error);
      }

      // 4. Prepare update data
      const updateDataResult = await this.prepareUpdateData(currentEpisode, input);
      if (!updateDataResult.success) {
        return Err(updateDataResult.error);
      }

      const { updateData, changedFields } = updateDataResult.data;

      // 5. Perform the update
      const updateResult = await this.feedEpisodeRepository.update(input.episodeId, updateData);
      if (!updateResult.success) {
        return Err(updateResult.error);
      }

      // 6. Publish episode updated event (only if there were actual changes)
      if (this.eventPublisher && changedFields.length > 0) {
        try {
          const correlationId = generateCorrelationId();
          const feedEventData: FeedEventData = {
            episodeId: updateResult.data.id,
            title: updateResult.data.title,
            slug: updateResult.data.slug,
            audioFilePath: updateResult.data.audioFilePath,
            durationSeconds: updateResult.data.durationSeconds,
            audioSizeBytes: updateResult.data.audioSizeBytes,
            publishedAt: updateResult.data.publishedAt
          };

          const episodeUpdatedEvent = createBaseEvent(
            EventType.EPISODE_UPDATED,
            feedEventData,
            {
              correlationId,
              userId: input.updatedBy,
              priority: 'normal',
              source: 'feed-service'
            }
          );

          // Add changed fields to event metadata
          episodeUpdatedEvent.metadata = {
            ...episodeUpdatedEvent.metadata,
            changedFields: changedFields,
            updatedBy: input.updatedBy
          };

          await this.eventPublisher.publish(episodeUpdatedEvent);
        } catch (error) {
          // Log event publishing error but don't fail the episode update
          console.error('Failed to publish episode updated event:', error);
        }
      }

      // 7. Prepare success response
      const output: UpdateEpisodeOutput = {
        episode: updateResult.data,
        message: `Episode "${updateResult.data.title}" updated successfully`,
        changedFields
      };

      return Ok(output);

    } catch (error) {
      return Err(new Error(`Failed to update episode: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Validate input data
   */
  private validateInput(input: UpdateEpisodeInput): Result<void> {
    const errors: string[] = [];

    // Episode ID validation
    if (!input.episodeId || input.episodeId.trim().length === 0) {
      errors.push('Episode ID is required');
    }

    // Updater validation
    if (!input.updatedBy || input.updatedBy.trim().length === 0) {
      errors.push('Updater ID is required');
    }

    // Title validation (if provided)
    if (input.title !== undefined) {
      if (input.title.trim().length === 0) {
        errors.push('Title cannot be empty');
      } else if (input.title.length > 255) {
        errors.push('Title must not exceed 255 characters');
      }
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
    if (input.slug !== undefined && !this.isValidSlug(input.slug)) {
      errors.push('Slug must contain only lowercase letters, numbers, and hyphens');
    }

    if (errors.length > 0) {
      return Err(new ValidationError(errors.join('; ')));
    }

    return Ok(undefined);
  }

  /**
   * Validate updater exists and has proper permissions
   */
  private async validateUpdater(updaterId: string): Promise<Result<any>> {
    const updaterResult = await this.userRepository.findById(updaterId);
    if (!updaterResult.success) {
      return Err(updaterResult.error);
    }

    if (!updaterResult.data) {
      return Err(new EntityNotFoundError('User', updaterId));
    }

    const updater = updaterResult.data;

    // Check if user is active
    if (!updater.isActive) {
      return Err(new BusinessRuleError('Updater account is deactivated'));
    }

    // Check if user has admin role (only admins can update episodes)
    if (updater.role !== UserRole.ADMIN) {
      return Err(new AuthorizationError('Only administrators can update episodes'));
    }

    return Ok(updater);
  }

  /**
   * Validate slug format
   */
  private isValidSlug(slug: string): boolean {
    return /^[a-z0-9-]+$/.test(slug) && !slug.startsWith('-') && !slug.endsWith('-');
  }

  /**
   * Prepare update data
   */
  private async prepareUpdateData(
    currentEpisode: FeedEpisode,
    input: UpdateEpisodeInput
  ): Promise<Result<{ updateData: UpdateFeedEpisodeData; changedFields: string[] }>> {
    try {
      const updateData: UpdateFeedEpisodeData = {};
      const changedFields: string[] = [];

      // Title update
      if (input.title && input.title !== currentEpisode.title) {
        updateData.title = input.title.trim();
        changedFields.push('title');
      }

      // Description update
      if (input.description !== undefined && input.description !== currentEpisode.description) {
        updateData.description = input.description.trim() || null;
        changedFields.push('description');
      }

      // Slug update
      if (input.slug && input.slug !== currentEpisode.slug) {
        // Check slug uniqueness
        const slugExistsResult = await this.feedEpisodeRepository.slugExists(input.slug, currentEpisode.id);
        if (!slugExistsResult.success) {
          return Err(slugExistsResult.error);
        }
        if (slugExistsResult.data) {
          return Err(new ValidationError('Slug is already in use by another episode'));
        }

        updateData.slug = input.slug;
        changedFields.push('slug');
      }

      // Episode number update
      if (input.episodeNumber !== undefined && input.episodeNumber !== currentEpisode.episodeNumber) {
        updateData.episodeNumber = input.episodeNumber;
        changedFields.push('episodeNumber');
      }

      // Season number update
      if (input.seasonNumber !== undefined && input.seasonNumber !== currentEpisode.seasonNumber) {
        updateData.seasonNumber = input.seasonNumber;
        changedFields.push('seasonNumber');
      }

      // Explicit flag update
      if (input.explicit !== undefined && input.explicit !== currentEpisode.explicit) {
        updateData.explicit = input.explicit;
        changedFields.push('explicit');
      }

      // Publication status update
      if (input.isPublished !== undefined && input.isPublished !== currentEpisode.isPublished) {
        updateData.isPublished = input.isPublished;
        if (input.isPublished && !currentEpisode.publishedAt) {
          updateData.publishedAt = new Date();
        }
        changedFields.push('isPublished');
      }

      return Ok({ updateData, changedFields });

    } catch (error) {
      return Err(new Error(`Failed to prepare update data: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
}