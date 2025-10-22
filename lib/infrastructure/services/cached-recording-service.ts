/**
 * Cached Recording Service
 * 
 * Implements cache-aside pattern for recording data operations with automatic
 * fallback to database queries and cache invalidation on updates.
 * Includes recording metadata caching and efficient cache warming.
 */

import { Recording, RecordingFile, CreateRecordingData, UpdateRecordingData } from '../../domain/entities/recording.ts';
import { RecordingRepository, RecordingFileRepository } from '../../domain/repositories/recording-repository.ts';
import { CacheService, CacheKeys } from '../../domain/services/cache-service.ts';
import { RedisService } from '../../domain/services/redis-service.ts';
import { RealtimeService } from '../../domain/services/realtime-service.ts';
import { Result, PaginatedResult, PaginationParams } from '../../domain/types/common.ts';

export interface RecordingWithFiles extends Recording {
  files: RecordingFile[];
}

export class CachedRecordingService {
  constructor(
    private recordingRepository: RecordingRepository,
    private recordingFileRepository: RecordingFileRepository,
    private cacheService: CacheService,
    private redisService: RedisService,
    private realtimeService?: RealtimeService
  ) {}

  /**
   * Get recording by ID with cache-aside pattern
   */
  async getRecordingById(id: string): Promise<Recording | null> {
    try {
      // Try cache first
      const cachedRecording = await this.cacheService.getRecordingById(id);
      if (cachedRecording) {
        return cachedRecording;
      }

      // Cache miss - fetch from database
      const result = await this.recordingRepository.findById(id);
      if (result.success && result.data) {
        // Cache the result for future requests with 2-hour TTL
        await this.cacheService.setRecording(result.data);
        return result.data;
      }

      return null;
    } catch (error) {
      console.error(`Error getting recording ${id}:`, error);
      // On cache error, fallback to database only
      const result = await this.recordingRepository.findById(id);
      return result.success ? result.data : null;
    }
  }

  /**
   * Get recording by folder name with cache-aside pattern
   */
  async getRecordingByFolderName(folderName: string): Promise<Recording | null> {
    try {
      // For folder name lookups, we don't have a direct cache key
      // So we go to database and then cache the result
      const result = await this.recordingRepository.findByFolderName(folderName);
      if (result.success && result.data) {
        // Cache the recording for future ID-based lookups
        await this.cacheService.setRecording(result.data);
        return result.data;
      }

      return null;
    } catch (error) {
      console.error(`Error getting recording by folder name ${folderName}:`, error);
      const result = await this.recordingRepository.findByFolderName(folderName);
      return result.success ? result.data : null;
    }
  }

  /**
   * Get recordings by creator with cache-aside pattern
   */
  async getRecordingsByCreator(createdBy: string, params?: PaginationParams): Promise<Recording[]> {
    try {
      // For paginated results, we only cache the first page without pagination
      if (!params || (params.page === 1 && params.limit === 20)) {
        const cachedRecordings = await this.cacheService.getRecordingList(createdBy);
        if (cachedRecordings.length > 0) {
          return cachedRecordings;
        }
      }

      // Cache miss or paginated request - fetch from database
      const result = await this.recordingRepository.findByCreator(createdBy, params);
      if (result.success && result.data.items.length > 0) {
        // Cache the first page results
        if (!params || (params.page === 1 && params.limit === 20)) {
          await this.cacheService.setRecordingList(result.data.items, createdBy);
        }
        
        // Also cache individual recordings
        await Promise.all(result.data.items.map(recording => 
          this.cacheService.setRecording(recording)
        ));
        
        return result.data.items;
      }

      return [];
    } catch (error) {
      console.error(`Error getting recordings for creator ${createdBy}:`, error);
      // On cache error, fallback to database only
      const result = await this.recordingRepository.findByCreator(createdBy, params);
      return result.success ? result.data.items : [];
    }
  }

  /**
   * Get recording files with caching
   */
  async getRecordingFiles(recordingId: string): Promise<RecordingFile[]> {
    try {
      const key = CacheKeys.RECORDING_FILES(recordingId);
      const cachedFiles = await this.redisService.get<RecordingFile[]>(key);
      
      if (cachedFiles !== null) {
        return cachedFiles;
      }

      // Cache miss - fetch from database
      const result = await this.recordingFileRepository.findByRecordingId(recordingId);
      if (result.success && result.data.length > 0) {
        // Cache the files with 2-hour TTL
        await this.redisService.set(key, result.data, 7200);
        return result.data;
      }

      return [];
    } catch (error) {
      console.error(`Error getting recording files for ${recordingId}:`, error);
      const result = await this.recordingFileRepository.findByRecordingId(recordingId);
      return result.success ? result.data : [];
    }
  }

  /**
   * Get recording with files (cached)
   */
  async getRecordingWithFiles(id: string): Promise<RecordingWithFiles | null> {
    try {
      const recording = await this.getRecordingById(id);
      if (!recording) {
        return null;
      }

      const files = await this.getRecordingFiles(id);
      
      return {
        ...recording,
        files
      };
    } catch (error) {
      console.error(`Error getting recording with files ${id}:`, error);
      return null;
    }
  }

  /**
   * Create recording and cache the result
   */
  async createRecording(recordingData: CreateRecordingData): Promise<Recording | null> {
    try {
      const result = await this.recordingRepository.create(recordingData);
      if (!result.success) {
        return null;
      }
      
      const recording = result.data;
      
      // Cache the newly created recording
      await this.cacheService.setRecording(recording);
      
      // Invalidate recording lists to ensure they include the new recording
      await this.cacheService.invalidateRecordingList(recordingData.createdBy);
      
      return recording;
    } catch (error) {
      console.error('Error creating recording:', error);
      throw error;
    }
  }

  /**
   * Update recording and invalidate cache
   */
  async updateRecording(id: string, updateData: UpdateRecordingData): Promise<Recording | null> {
    try {
      const result = await this.recordingRepository.update(id, updateData);
      if (!result.success) {
        return null;
      }
      
      const updatedRecording = result.data;
      
      // Invalidate cache to ensure consistency
      await this.cacheService.invalidateRecording(id);
      
      // Cache the updated recording
      await this.cacheService.setRecording(updatedRecording);
      
      // Invalidate recording lists that might include this recording
      await this.cacheService.invalidateRecordingList(updatedRecording.createdBy);
      
      return updatedRecording;
    } catch (error) {
      console.error(`Error updating recording ${id}:`, error);
      
      // On error, still invalidate cache to prevent stale data
      try {
        await this.cacheService.invalidateRecording(id);
      } catch (cacheError) {
        console.error(`Error invalidating cache for recording ${id}:`, cacheError);
      }
      
      throw error;
    }
  }

  /**
   * Delete recording and invalidate cache
   */
  async deleteRecording(id: string): Promise<boolean> {
    try {
      // Get recording first to know which creator's list to invalidate
      const recording = await this.getRecordingById(id);
      
      const result = await this.recordingRepository.delete(id);
      if (!result.success) {
        return false;
      }
      
      // Invalidate cache
      await this.cacheService.invalidateRecording(id);
      
      // Invalidate recording lists
      if (recording) {
        await this.cacheService.invalidateRecordingList(recording.createdBy);
      }
      
      return true;
    } catch (error) {
      console.error(`Error deleting recording ${id}:`, error);
      
      // On error, still invalidate cache to prevent stale data
      try {
        await this.cacheService.invalidateRecording(id);
      } catch (cacheError) {
        console.error(`Error invalidating cache for recording ${id}:`, cacheError);
      }
      
      throw error;
    }
  }

  /**
   * Get recording statistics (cached)
   */
  async getRecordingStats(createdBy: string): Promise<{
    totalRecordings: number;
    totalDuration: number;
    totalSize: number;
  }> {
    try {
      const key = `recording:stats:${createdBy}`;
      const cachedStats = await this.redisService.get<{
        totalRecordings: number;
        totalDuration: number;
        totalSize: number;
      }>(key);
      
      if (cachedStats !== null) {
        return cachedStats;
      }

      // Cache miss - calculate from recordings
      const recordings = await this.getRecordingsByCreator(createdBy);
      
      const stats = {
        totalRecordings: recordings.length,
        totalDuration: recordings.reduce((sum, r) => sum + (r.durationSeconds || 0), 0),
        totalSize: recordings.reduce((sum, r) => sum + (r.totalSizeBytes || 0), 0)
      };
      
      // Cache stats with 1-hour TTL
      await this.redisService.set(key, stats, 3600);
      
      return stats;
    } catch (error) {
      console.error(`Error getting recording stats for ${createdBy}:`, error);
      return {
        totalRecordings: 0,
        totalDuration: 0,
        totalSize: 0
      };
    }
  }

  /**
   * Invalidate recording stats cache
   */
  async invalidateRecordingStats(createdBy: string): Promise<void> {
    try {
      const key = `recording:stats:${createdBy}`;
      await this.redisService.del(key);
    } catch (error) {
      console.error(`Error invalidating recording stats for ${createdBy}:`, error);
    }
  }

  /**
   * Broadcast recording progress update
   */
  async broadcastRecordingProgress(recordingId: string, progress: {
    status: string;
    durationSeconds?: number;
    totalSizeBytes?: number;
    participantCount?: number;
  }): Promise<void> {
    try {
      if (!this.realtimeService) {
        return;
      }

      const recording = await this.getRecordingById(recordingId);
      if (!recording) {
        console.error(`Recording ${recordingId} not found for progress broadcast`);
        return;
      }

      // Create a room event for recording progress
      const event = {
        type: 'recording_progress',
        data: {
          recordingId,
          ...progress,
          updatedAt: new Date()
        },
        timestamp: new Date()
      };

      await this.realtimeService.broadcastRoomEvent(recording.roomId, event);
    } catch (error) {
      console.error(`Error broadcasting recording progress for ${recordingId}:`, error);
    }
  }

  /**
   * Update recording with progress broadcasting
   */
  async updateRecordingWithProgress(id: string, updateData: UpdateRecordingData): Promise<Recording | null> {
    try {
      const updatedRecording = await this.updateRecording(id, updateData);
      
      if (updatedRecording && this.realtimeService) {
        // Broadcast progress update
        await this.broadcastRecordingProgress(id, {
          status: updatedRecording.status,
          durationSeconds: updatedRecording.durationSeconds,
          totalSizeBytes: updatedRecording.totalSizeBytes,
          participantCount: updatedRecording.participantCount
        });
      }
      
      return updatedRecording;
    } catch (error) {
      console.error(`Error updating recording with progress ${id}:`, error);
      throw error;
    }
  }

  /**
   * Warm recording cache with frequently accessed recordings
   */
  async warmRecordingCache(recordingIds: string[]): Promise<void> {
    try {
      const recordings = await Promise.all(
        recordingIds.map(async id => {
          const result = await this.recordingRepository.findById(id);
          return result.success ? result.data : null;
        })
      );

      // Cache all found recordings
      await Promise.all(
        recordings
          .filter((recording): recording is Recording => recording !== null)
          .map(recording => this.cacheService.setRecording(recording))
      );

      console.log(`Warmed cache for ${recordings.filter(r => r !== null).length} recordings`);
    } catch (error) {
      console.error('Error warming recording cache:', error);
    }
  }

  /**
   * Warm recording list cache for active users
   */
  async warmRecordingListCache(userIds: string[]): Promise<void> {
    try {
      for (const userId of userIds) {
        const result = await this.recordingRepository.findByCreator(userId, { page: 1, limit: 20 });
        if (result.success && result.data.items.length > 0) {
          await this.cacheService.setRecordingList(result.data.items, userId);
          
          // Also cache individual recordings
          await Promise.all(result.data.items.map(recording => 
            this.cacheService.setRecording(recording)
          ));
        }
      }
      
      console.log(`Warmed recording list cache for ${userIds.length} users`);
    } catch (error) {
      console.error('Error warming recording list cache:', error);
    }
  }

  /**
   * Warm recording files cache for frequently accessed recordings
   */
  async warmRecordingFilesCache(recordingIds: string[]): Promise<void> {
    try {
      for (const recordingId of recordingIds) {
        const result = await this.recordingFileRepository.findByRecordingId(recordingId);
        if (result.success && result.data.length > 0) {
          const key = CacheKeys.RECORDING_FILES(recordingId);
          await this.redisService.set(key, result.data, 7200); // 2 hours
        }
      }
      
      console.log(`Warmed recording files cache for ${recordingIds.length} recordings`);
    } catch (error) {
      console.error('Error warming recording files cache:', error);
    }
  }

  /**
   * Invalidate all recording cache entries
   */
  async invalidateAllRecordingCache(): Promise<void> {
    try {
      await this.cacheService.invalidatePattern('recording:*');
      console.log('Invalidated all recording cache entries');
    } catch (error) {
      console.error('Error invalidating all recording cache:', error);
    }
  }
}