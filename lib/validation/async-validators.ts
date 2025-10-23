// ============================================================================
// Async Validation Examples
// SimplyCaster Centralized Form Validation System
// ============================================================================

import type {
  FieldValidator,
  ValidationResult,
  ValidationContext,
} from "./types.ts";
import { createAsyncValidator } from "./async-validation.ts";

// ============================================================================
// Async Validator Examples
// ============================================================================

/**
 * Unique email validator
 * Validates that an email address is not already in use
 */
export const uniqueEmailValidator = createAsyncValidator<string>(
  async (email: string, context: ValidationContext, signal: AbortSignal): Promise<ValidationResult<string>> => {
    // Skip validation if email is empty (let required validator handle it)
    if (!email || email.trim() === '') {
      return { success: true, data: email, errors: [] };
    }

    const trimmedEmail = email.trim().toLowerCase();

    try {
      // Make API request to check email uniqueness
      const response = await fetch('/api/validate/unique-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: trimmedEmail,
          excludeId: context.formData?.id // Exclude current user ID for updates
        }),
        signal, // Pass abort signal for cancellation
      });

      if (!response.ok) {
        // Handle different HTTP status codes
        if (response.status === 429) {
          throw new Error('Rate limited');
        } else if (response.status >= 500) {
          throw new Error('Server error');
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      }

      const result = await response.json();

      if (!result.unique) {
        return {
          success: false,
          errors: [{
            field: context.fieldPath,
            code: 'uniqueEmail',
            message: context.copyManager('validation.emailTaken') || 
              'This email address is already in use',
            params: { email: trimmedEmail }
          }]
        };
      }

      return { success: true, data: trimmedEmail, errors: [] };
    } catch (error) {
      // Let the async framework handle network errors
      throw error;
    }
  },
  {
    timeout: 8000, // 8 second timeout
    maxRetries: 2,
    retryDelay: 1000,
    exponentialBackoff: true,
  }
);

/**
 * Unique slug validator factory
 * Creates a validator that checks if a slug is unique for a specific entity type
 */
export const createUniqueSlugValidator = (entityType: 'room' | 'episode'): FieldValidator<string> => 
  createAsyncValidator<string>(
    async (slug: string, context: ValidationContext, signal: AbortSignal): Promise<ValidationResult<string>> => {
      // Skip validation if slug is empty (let required validator handle it)
      if (!slug || slug.trim() === '') {
        return { success: true, data: slug, errors: [] };
      }

      // Normalize slug (lowercase, replace spaces with hyphens, remove invalid chars)
      const normalizedSlug = slug
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      // Validate slug format
      if (!/^[a-z0-9-]+$/.test(normalizedSlug)) {
        return {
          success: false,
          errors: [{
            field: context.fieldPath,
            code: 'invalidSlugFormat',
            message: 'Slug can only contain lowercase letters, numbers, and hyphens',
            params: { slug: normalizedSlug }
          }]
        };
      }

      try {
        // Make API request to check slug uniqueness
        const response = await fetch('/api/validate/unique-slug', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            slug: normalizedSlug,
            entityType,
            excludeId: context.formData?.id // Exclude current entity ID for updates
          }),
          signal, // Pass abort signal for cancellation
        });

        if (!response.ok) {
          if (response.status === 429) {
            throw new Error('Rate limited');
          } else if (response.status >= 500) {
            throw new Error('Server error');
          } else {
            throw new Error(`HTTP ${response.status}`);
          }
        }

        const result = await response.json();

        if (!result.unique) {
          const entityName = entityType === 'room' ? 'room name' : 'episode title';
          return {
            success: false,
            errors: [{
              field: context.fieldPath,
              code: 'uniqueSlug',
              message: context.copyManager('validation.slugTaken', { entity: entityName }) || 
                `This ${entityName} is already taken`,
              params: { slug: normalizedSlug, entityType }
            }]
          };
        }

        return { success: true, data: normalizedSlug, errors: [] };
      } catch (error) {
        // Let the async framework handle network errors
        throw error;
      }
    },
    {
      timeout: 6000, // 6 second timeout
      maxRetries: 2,
      retryDelay: 800,
      exponentialBackoff: true,
    }
  );

/**
 * Unique room slug validator
 */
export const uniqueRoomSlugValidator = createUniqueSlugValidator('room');

/**
 * Unique episode slug validator
 */
export const uniqueEpisodeSlugValidator = createUniqueSlugValidator('episode');

/**
 * Async file validation for upload scenarios
 * Validates file integrity and scans for malware (simulated)
 */
export const asyncFileValidator = createAsyncValidator<File>(
  async (file: File, context: ValidationContext, signal: AbortSignal): Promise<ValidationResult<File>> => {
    // Skip validation if no file (let required validator handle it)
    if (!file) {
      return { success: true, data: file, errors: [] };
    }

    // Check if it's actually a File object
    if (!(file instanceof File)) {
      return {
        success: false,
        errors: [{
          field: context.fieldPath,
          code: 'invalidFile',
          message: 'Invalid file object'
        }]
      };
    }

    try {
      // Create form data for file upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('validationType', 'integrity');

      // Make API request to validate file
      const response = await fetch('/api/validate/file', {
        method: 'POST',
        body: formData,
        signal, // Pass abort signal for cancellation
      });

      if (!response.ok) {
        if (response.status === 413) {
          return {
            success: false,
            errors: [{
              field: context.fieldPath,
              code: 'fileTooLarge',
              message: 'File is too large for processing',
              params: { fileName: file.name, size: file.size }
            }]
          };
        } else if (response.status === 415) {
          return {
            success: false,
            errors: [{
              field: context.fieldPath,
              code: 'unsupportedFileType',
              message: 'File type is not supported for validation',
              params: { fileName: file.name, type: file.type }
            }]
          };
        } else if (response.status === 429) {
          throw new Error('Rate limited');
        } else if (response.status >= 500) {
          throw new Error('Server error');
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      }

      const result = await response.json();

      // Check validation results
      const errors = [];

      if (!result.integrityValid) {
        errors.push({
          field: context.fieldPath,
          code: 'fileCorrupted',
          message: context.copyManager('validation.fileCorrupted') || 
            'The uploaded file appears to be corrupted',
          params: { fileName: file.name }
        });
      }

      if (result.malwareDetected) {
        errors.push({
          field: context.fieldPath,
          code: 'malwareDetected',
          message: 'File contains malicious content and cannot be uploaded',
          params: { fileName: file.name }
        });
      }

      if (result.metadata && result.metadata.duration && result.metadata.duration > 14400) { // 4 hours
        errors.push({
          field: context.fieldPath,
          code: 'fileTooLong',
          message: 'Audio file is too long (maximum 4 hours)',
          params: { 
            fileName: file.name, 
            duration: result.metadata.duration,
            maxDuration: 14400
          }
        });
      }

      if (errors.length > 0) {
        return { success: false, errors };
      }

      // Add metadata to file if available
      if (result.metadata) {
        // Note: We can't modify the File object, but we can return it with validation success
        // The metadata would be handled by the calling code
        return { 
          success: true, 
          data: file, 
          errors: [],
          warnings: result.warnings ? result.warnings.map((warning: any) => ({
            field: context.fieldPath,
            code: warning.code,
            message: warning.message,
            params: warning.params
          })) : []
        };
      }

      return { success: true, data: file, errors: [] };
    } catch (error) {
      // Let the async framework handle network errors
      throw error;
    }
  },
  {
    timeout: 30000, // 30 second timeout for file processing
    maxRetries: 1, // Only retry once for file uploads
    retryDelay: 2000,
    exponentialBackoff: false,
  }
);

/**
 * Username availability validator
 * Validates that a username is available and meets requirements
 */
export const usernameAvailabilityValidator = createAsyncValidator<string>(
  async (username: string, context: ValidationContext, signal: AbortSignal): Promise<ValidationResult<string>> => {
    // Skip validation if username is empty (let required validator handle it)
    if (!username || username.trim() === '') {
      return { success: true, data: username, errors: [] };
    }

    const trimmedUsername = username.trim().toLowerCase();

    // Basic format validation
    if (!/^[a-z0-9_-]+$/.test(trimmedUsername)) {
      return {
        success: false,
        errors: [{
          field: context.fieldPath,
          code: 'invalidUsernameFormat',
          message: 'Username can only contain letters, numbers, underscores, and hyphens',
          params: { username: trimmedUsername }
        }]
      };
    }

    if (trimmedUsername.length < 3) {
      return {
        success: false,
        errors: [{
          field: context.fieldPath,
          code: 'usernameTooShort',
          message: 'Username must be at least 3 characters long',
          params: { username: trimmedUsername, minLength: 3 }
        }]
      };
    }

    try {
      // Make API request to check username availability
      const response = await fetch('/api/validate/username-availability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          username: trimmedUsername,
          excludeId: context.formData?.id
        }),
        signal,
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limited');
        } else if (response.status >= 500) {
          throw new Error('Server error');
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      }

      const result = await response.json();

      const errors = [];

      if (!result.available) {
        errors.push({
          field: context.fieldPath,
          code: 'usernameUnavailable',
          message: 'This username is already taken',
          params: { username: trimmedUsername }
        });
      }

      if (result.reserved) {
        errors.push({
          field: context.fieldPath,
          code: 'usernameReserved',
          message: 'This username is reserved and cannot be used',
          params: { username: trimmedUsername }
        });
      }

      if (result.inappropriate) {
        errors.push({
          field: context.fieldPath,
          code: 'usernameInappropriate',
          message: 'This username contains inappropriate content',
          params: { username: trimmedUsername }
        });
      }

      if (errors.length > 0) {
        return { success: false, errors };
      }

      return { success: true, data: trimmedUsername, errors: [] };
    } catch (error) {
      throw error;
    }
  },
  {
    timeout: 5000,
    maxRetries: 2,
    retryDelay: 1000,
    exponentialBackoff: true,
  }
);

// ============================================================================
// Factory Functions for Registry
// ============================================================================

/**
 * Factory function for unique slug validator that can be used with registry
 */
export const createUniqueSlugValidatorFactory = (params: { entity: 'room' | 'episode' }) => 
  createUniqueSlugValidator(params.entity);

/**
 * Factory function for async file validator that can be used with registry
 */
export const createAsyncFileValidatorFactory = (params: { 
  maxDuration?: number;
  enableMalwareScan?: boolean;
  enableIntegrityCheck?: boolean;
} = {}) => {
  // For now, return the standard async file validator
  // In the future, this could be customized based on params
  return asyncFileValidator;
};

// ============================================================================
// Async Validator Registration Helper
// ============================================================================

import type { ValidatorRegistry } from "./registry.ts";

/**
 * Register all async validators with a registry
 */
export function registerAsyncValidators(registry: ValidatorRegistry): void {
  // Unique validators
  registry.registerAsync('uniqueEmail', uniqueEmailValidator, {
    description: 'Validates that an email address is not already in use',
    async: true,
    examples: ['{ type: "uniqueEmail", async: true }']
  });

  registry.registerAsync('uniqueSlug', createUniqueSlugValidatorFactory as any, {
    description: 'Validates that a slug is unique for the specified entity type',
    async: true,
    parameterSchema: { entity: '"room" | "episode"' },
    examples: [
      '{ type: "uniqueSlug", async: true, params: { entity: "room" } }',
      '{ type: "uniqueSlug", async: true, params: { entity: "episode" } }'
    ]
  });

  registry.registerAsync('uniqueRoomSlug', uniqueRoomSlugValidator, {
    description: 'Validates that a room slug is unique',
    async: true,
    examples: ['{ type: "uniqueRoomSlug", async: true }']
  });

  registry.registerAsync('uniqueEpisodeSlug', uniqueEpisodeSlugValidator, {
    description: 'Validates that an episode slug is unique',
    async: true,
    examples: ['{ type: "uniqueEpisodeSlug", async: true }']
  });

  // File validators
  registry.registerAsync('asyncFile', createAsyncFileValidatorFactory as any, {
    description: 'Validates file integrity and scans for malware',
    async: true,
    parameterSchema: { 
      maxDuration: 'number?',
      enableMalwareScan: 'boolean?',
      enableIntegrityCheck: 'boolean?'
    },
    examples: [
      '{ type: "asyncFile", async: true }',
      '{ type: "asyncFile", async: true, params: { maxDuration: 7200 } }'
    ]
  });

  // Username validator
  registry.registerAsync('usernameAvailability', usernameAvailabilityValidator, {
    description: 'Validates username availability and appropriateness',
    async: true,
    examples: ['{ type: "usernameAvailability", async: true }']
  });
}