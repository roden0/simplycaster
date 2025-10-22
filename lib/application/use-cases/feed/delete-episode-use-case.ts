/**
 * Delete Episode Use Case
 * 
 * Handles episode deletion with file cleanup and event publishing.
 */

import { FeedEpisodeRepository } from '../../../domain/repositories/feed-episode-repository.ts';
import { UserRepository } from '../../../domain/repositories/user-repository.ts';
import { StorageService } from '../../../domain/services/storage-service.ts';
import { FeedEpisode } from '../../../domain/entities/feed-episode.ts';
import { UserRole, Result, Ok, Err } from '../../../domain/types/common.ts';
import { ValidationError, BusinessRuleError, EntityNotFoundError, AuthorizationError } from '../../../domain/errors/index.ts';
import { EventPublisher } from '../../../domain/types/events.ts';
import { createBaseEvent, generateCorrelationId } from '../../../domain/services/event-utils.ts';
import { EventType, FeedEventData } from '../../../domain/types/events.ts';

/**
 * Input data for deleting an episode
 */
export interface DeleteEpisodeInput {
  episodeId: string;
  deletedBy: string; // User ID of the deleter
  deleteAudioFile?: boolean; // Whether to delete the associated audio file
}

/**
 * Output data from episode deletion
 */
export interface DeleteEpisodeOutput {
  message: string;
  deletedEpisode: {
    id: string;
    title: string;
    slug: string;
  };
}

/**
 * Delete Episode Use Case implementation
 */
export class DeleteEpisodeUseCase {
  constructor(
    private feedEpisodeRepository: FeedEpisodeRepository,
    private userRepository: UserRepository,
    private storageService: StorageService,
    private eventPublisher?: EventPublisher
  ) {}

  /**
   * Execute the delete episode use case
   */
  async execute(input: DeleteEpisodeInput): Promise<Result<DeleteEpisodeOutput>> {
    try {
      // 1. Validate input data
      const validationResult = this.validateInput(input);
      if (!validationResult.success) {
        return Err(validationResult.error);
      }

      // 2. Find the episode to delete
      const episodeResult = await this.feedEpisodeRepository.findById(input.episodeId);
      if (!episodeResult.success) {
        return Err(episodeResult.error);
      }

      if (!episodeResult.data) {
        return Err(new EntityNotFoundError('Episode', input.episodeId));
      }

      const episode = episodeResult.data;

      // 3. Validate deleter permissions
      const deleterValidationResult = await this.validateDeleter(input.deletedBy);
      if (!deleterValidationResult.success) {
        return Err(deleterValidationResult.error);
      }

      // 4. Delete associated audio file if requested
      if (input.deleteAudioFile && episode.audioFilePath) {
        try {
          const deleteFileResult = await this.storageService.deleteFile(episode.audioFilePath);
          if (!deleteFileResult.success) {
            console.error('Failed to delete audio file:', deleteFileResult.error);
            // Don't fail the episode deletion for file deletion errors
          }
        } catch (error) {
          console.error('Error deleting audio file:', error);
        }
      }

      // 5. Delete the episode (soft delete)
      const deleteResult = await this.feedEpisodeRepository.delete(input.episodeId);
      if (!deleteResult.success) {
        return Err(deleteResult.error);
      }

      // 6. Publish episode deleted event
      if (this.eventPublisher) {
        try {
          const correlationId = generateCorrelationId();
          const feedEventData: FeedEventData = {
            episodeId: episode.id,
            title: episode.title,
            slug: episode.slug,
            audioFilePath: episode.audioFilePath,
            durationSeconds: episode.durationSeconds,
            audioSizeBytes: episode.audioSizeBytes,
            publishedAt: episode.publishedAt
          };

          const episodeDeletedEvent = createBaseEvent(
            EventType.EPISODE_DELETED,
            feedEventData,
            {
              correlationId,
              userId: input.deletedBy,
              priority: 'normal',
              source: 'feed-service'
            }
          );

          // Add deletion metadata to event
          episodeDeletedEvent.metadata = {
            ...episodeDeletedEvent.metadata,
            deletedBy: input.deletedBy,
            audioFileDeleted: input.deleteAudioFile || false
          };

          await this.eventPublisher.publish(episodeDeletedEvent);
        } catch (error) {
          // Log event publishing error but don't fail the episode deletion
          console.error('Failed to publish episode deleted event:', error);
        }
      }

      // 7. Prepare success response
      const output: DeleteEpisodeOutput = {
        message: `Episode "${episode.title}" deleted successfully`,
        deletedEpisode: {
          id: episode.id,
          title: episode.title,
          slug: episode.slug
        }
      };

      return Ok(output);

    } catch (error) {
      return Err(new Error(`Failed to delete episode: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Validate input data
   */
  private validateInput(input: DeleteEpisodeInput): Result<void> {
    const errors: string[] = [];

    // Episode ID validation
    if (!input.episodeId || input.episodeId.trim().length === 0) {
      errors.push('Episode ID is required');
    }

    // Deleter validation
    if (!input.deletedBy || input.deletedBy.trim().length === 0) {
      errors.push('Deleter ID is required');
    }

    if (errors.length > 0) {
      return Err(new ValidationError(errors.join('; ')));
    }

    return Ok(undefined);
  }

  /**
   * Validate deleter exists and has proper permissions
   */
  private async validateDeleter(deleterId: string): Promise<Result<any>> {
    const deleterResult = await this.userRepository.findById(deleterId);
    if (!deleterResult.success) {
      return Err(deleterResult.error);
    }

    if (!deleterResult.data) {
      return Err(new EntityNotFoundError('User', deleterId));
    }

    const deleter = deleterResult.data;

    // Check if user is active
    if (!deleter.isActive) {
      return Err(new BusinessRuleError('Deleter account is deactivated'));
    }

    // Check if user has admin role (only admins can delete episodes)
    if (deleter.role !== UserRole.ADMIN) {
      return Err(new AuthorizationError('Only administrators can delete episodes'));
    }

    return Ok(deleter);
  }
}