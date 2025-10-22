/**
 * File System Storage Service Implementation
 * 
 * Implements StorageService interface using the local file system
 * for recording and feed file management.
 */

import { StorageService, FileMetadata } from '../../domain/services/storage-service.ts';
import { Result, Ok, Err } from '../../domain/types/common.ts';
import { InfrastructureError } from '../../domain/errors/index.ts';

/**
 * File system implementation of StorageService
 */
export class FileSystemStorageService implements StorageService {
  private readonly recordingsBasePath: string;
  private readonly feedBasePath: string;

  constructor(
    recordingsBasePath: string = './storage/recordings',
    feedBasePath: string = './storage/feed'
  ) {
    this.recordingsBasePath = recordingsBasePath;
    this.feedBasePath = feedBasePath;
    
    // Ensure base directories exist
    this.ensureDirectoryExists(this.recordingsBasePath);
    this.ensureDirectoryExists(this.feedBasePath);
  }

  /**
   * Save a recording file to storage
   */
  async saveRecordingFile(folderName: string, fileName: string, data: Uint8Array): Promise<Result<FileMetadata>> {
    try {
      const folderPath = `${this.recordingsBasePath}/${folderName}`;
      const filePath = `${folderPath}/${fileName}`;
      
      // Ensure folder exists
      await this.ensureDirectoryExists(folderPath);
      
      // Write file
      await Deno.writeFile(filePath, data);
      
      // Calculate checksum
      const checksumResult = await this.calculateChecksum(data);
      if (!checksumResult.success) {
        return Err(checksumResult.error);
      }
      
      // Get file stats
      const stat = await Deno.stat(filePath);
      
      const metadata: FileMetadata = {
        fileName,
        filePath: `recordings/${folderName}/${fileName}`,
        sizeBytes: stat.size,
        mimeType: this.getMimeType(fileName),
        checksumSha256: checksumResult.data,
        createdAt: stat.birthtime || new Date()
      };
      
      return Ok(metadata);
    } catch (error) {
      return Err(new InfrastructureError(`Failed to save recording file: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Get a recording file from storage
   */
  async getRecordingFile(folderName: string, fileName: string): Promise<Result<Uint8Array>> {
    try {
      const filePath = `${this.recordingsBasePath}/${folderName}/${fileName}`;
      
      // Check if file exists
      const existsResult = await this.recordingFileExists(folderName, fileName);
      if (!existsResult.success) {
        return Err(existsResult.error);
      }
      if (!existsResult.data) {
        return Err(new InfrastructureError(`Recording file not found: ${folderName}/${fileName}`));
      }
      
      const data = await Deno.readFile(filePath);
      return Ok(data);
    } catch (error) {
      return Err(new InfrastructureError(`Failed to get recording file: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Delete a recording file from storage
   */
  async deleteRecordingFile(folderName: string, fileName: string): Promise<Result<void>> {
    try {
      const filePath = `${this.recordingsBasePath}/${folderName}/${fileName}`;
      
      // Check if file exists
      const existsResult = await this.recordingFileExists(folderName, fileName);
      if (!existsResult.success) {
        return Err(existsResult.error);
      }
      if (!existsResult.data) {
        return Ok(undefined); // File doesn't exist, consider it deleted
      }
      
      await Deno.remove(filePath);
      return Ok(undefined);
    } catch (error) {
      return Err(new InfrastructureError(`Failed to delete recording file: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Delete an entire recording folder
   */
  async deleteRecordingFolder(folderName: string): Promise<Result<void>> {
    try {
      const folderPath = `${this.recordingsBasePath}/${folderName}`;
      
      try {
        await Deno.stat(folderPath);
      } catch {
        return Ok(undefined); // Folder doesn't exist, consider it deleted
      }
      
      await Deno.remove(folderPath, { recursive: true });
      return Ok(undefined);
    } catch (error) {
      return Err(new InfrastructureError(`Failed to delete recording folder: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * List files in a recording folder
   */
  async listRecordingFiles(folderName: string): Promise<Result<FileMetadata[]>> {
    try {
      const folderPath = `${this.recordingsBasePath}/${folderName}`;
      
      try {
        await Deno.stat(folderPath);
      } catch {
        return Ok([]); // Folder doesn't exist, return empty list
      }
      
      const files: FileMetadata[] = [];
      
      for await (const entry of Deno.readDir(folderPath)) {
        if (entry.isFile) {
          const filePath = `${folderPath}/${entry.name}`;
          const stat = await Deno.stat(filePath);
          
          files.push({
            fileName: entry.name,
            filePath: `recordings/${folderName}/${entry.name}`,
            sizeBytes: stat.size,
            mimeType: this.getMimeType(entry.name),
            createdAt: stat.birthtime || new Date()
          });
        }
      }
      
      return Ok(files);
    } catch (error) {
      return Err(new InfrastructureError(`Failed to list recording files: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Check if recording file exists
   */
  async recordingFileExists(folderName: string, fileName: string): Promise<Result<boolean>> {
    try {
      const filePath = `${this.recordingsBasePath}/${folderName}/${fileName}`;
      
      try {
        const stat = await Deno.stat(filePath);
        return Ok(stat.isFile);
      } catch {
        return Ok(false);
      }
    } catch (error) {
      return Err(new InfrastructureError(`Failed to check recording file existence: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Get file metadata without reading content
   */
  async getFileMetadata(folderName: string, fileName: string): Promise<Result<FileMetadata>> {
    try {
      const filePath = `${this.recordingsBasePath}/${folderName}/${fileName}`;
      
      const stat = await Deno.stat(filePath);
      
      const metadata: FileMetadata = {
        fileName,
        filePath: `recordings/${folderName}/${fileName}`,
        sizeBytes: stat.size,
        mimeType: this.getMimeType(fileName),
        createdAt: stat.birthtime || new Date()
      };
      
      return Ok(metadata);
    } catch (error) {
      return Err(new InfrastructureError(`Failed to get file metadata: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Save a feed episode file to storage
   */
  async saveFeedFile(fileName: string, data: Uint8Array): Promise<Result<FileMetadata>> {
    try {
      const filePath = `${this.feedBasePath}/${fileName}`;
      
      // Write file
      await Deno.writeFile(filePath, data);
      
      // Calculate checksum
      const checksumResult = await this.calculateChecksum(data);
      if (!checksumResult.success) {
        return Err(checksumResult.error);
      }
      
      // Get file stats
      const stat = await Deno.stat(filePath);
      
      const metadata: FileMetadata = {
        fileName,
        filePath: `feed/${fileName}`,
        sizeBytes: stat.size,
        mimeType: this.getMimeType(fileName),
        checksumSha256: checksumResult.data,
        createdAt: stat.birthtime || new Date()
      };
      
      return Ok(metadata);
    } catch (error) {
      return Err(new InfrastructureError(`Failed to save feed file: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Get a feed episode file from storage
   */
  async getFeedFile(fileName: string): Promise<Result<Uint8Array>> {
    try {
      const filePath = `${this.feedBasePath}/${fileName}`;
      
      try {
        await Deno.stat(filePath);
      } catch {
        return Err(new InfrastructureError(`Feed file not found: ${fileName}`));
      }
      
      const data = await Deno.readFile(filePath);
      return Ok(data);
    } catch (error) {
      return Err(new InfrastructureError(`Failed to get feed file: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Delete a feed episode file from storage
   */
  async deleteFeedFile(fileName: string): Promise<Result<void>> {
    try {
      const filePath = `${this.feedBasePath}/${fileName}`;
      
      try {
        await Deno.stat(filePath);
      } catch {
        return Ok(undefined); // File doesn't exist, consider it deleted
      }
      
      await Deno.remove(filePath);
      return Ok(undefined);
    } catch (error) {
      return Err(new InfrastructureError(`Failed to delete feed file: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * List all feed files
   */
  async listFeedFiles(): Promise<Result<FileMetadata[]>> {
    try {
      const files: FileMetadata[] = [];
      
      try {
        await Deno.stat(this.feedBasePath);
      } catch {
        return Ok([]); // Directory doesn't exist, return empty list
      }
      
      for await (const entry of Deno.readDir(this.feedBasePath)) {
        if (entry.isFile) {
          const filePath = `${this.feedBasePath}/${entry.name}`;
          const stat = await Deno.stat(filePath);
          
          files.push({
            fileName: entry.name,
            filePath: `feed/${entry.name}`,
            sizeBytes: stat.size,
            mimeType: this.getMimeType(entry.name),
            createdAt: stat.birthtime || new Date()
          });
        }
      }
      
      return Ok(files);
    } catch (error) {
      return Err(new InfrastructureError(`Failed to list feed files: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Calculate checksum for file data
   */
  async calculateChecksum(data: Uint8Array): Promise<Result<string>> {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return Ok(hashHex);
    } catch (error) {
      return Err(new InfrastructureError(`Failed to calculate checksum: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Verify file integrity using checksum
   */
  async verifyFileIntegrity(folderName: string, fileName: string, expectedChecksum: string): Promise<Result<boolean>> {
    try {
      // Get file data
      const fileResult = await this.getRecordingFile(folderName, fileName);
      if (!fileResult.success) {
        return Err(fileResult.error);
      }
      
      // Calculate checksum
      const checksumResult = await this.calculateChecksum(fileResult.data);
      if (!checksumResult.success) {
        return Err(checksumResult.error);
      }
      
      // Compare checksums
      const isValid = checksumResult.data === expectedChecksum;
      return Ok(isValid);
    } catch (error) {
      return Err(new InfrastructureError(`Failed to verify file integrity: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Ensure directory exists, create if it doesn't
   */
  private async ensureDirectoryExists(path: string): Promise<void> {
    try {
      await Deno.stat(path);
    } catch {
      await Deno.mkdir(path, { recursive: true });
    }
  }

  /**
   * Get MIME type based on file extension
   */
  private getMimeType(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'webm': 'audio/webm',
      'ogg': 'audio/ogg',
      'flac': 'audio/flac',
      'm4a': 'audio/mp4',
      'aac': 'audio/aac'
    };
    
    return mimeTypes[extension || ''] || 'application/octet-stream';
  }
}