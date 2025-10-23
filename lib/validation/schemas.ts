// ============================================================================
// Validation Schema Examples
// SimplyCaster Centralized Form Validation System
// ============================================================================

import { SchemaBuilder } from "./schema-builder.ts";
import type { ValidationSchema, FieldValidationSchema } from "./types.ts";

// ============================================================================
// Type Definitions for Form Data
// ============================================================================

/**
 * User registration form data
 */
export interface UserRegistrationData {
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
}

/**
 * Episode upload form data
 */
export interface EpisodeUploadData {
  title: string;
  description?: string;
  file: File;
  episodeNumber?: number;
}

/**
 * Room creation form data
 */
export interface RoomCreationData {
  name: string;
  slug?: string;
  maxParticipants?: number;
  allowVideo?: boolean;
  description?: string;
}

/**
 * Guest invitation form data
 */
export interface GuestInviteData {
  email: string;
  displayName: string;
  roomId: string;
  message?: string;
}

/**
 * Guest invitation form data (extended)
 */
export interface GuestInvitationData {
  roomId: string;
  guestEmail: string;
  guestName?: string;
  customMessage?: string;
  expiresInHours: number;
}

/**
 * Login form data
 */
export interface LoginData {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * Password reset form data
 */
export interface PasswordResetData {
  email: string;
}

/**
 * Password change form data
 */
export interface PasswordChangeData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

// ============================================================================
// User Registration Schema
// ============================================================================

/**
 * Validation schema for user registration
 * Includes email uniqueness check, password complexity, and confirmation matching
 */
export const userRegistrationSchema = SchemaBuilder.create<UserRegistrationData>()
  .field('email', [
    { type: 'required' },
    { type: 'email' },
    { type: 'uniqueEmail', async: true }
  ], { required: true })
  .field('password', [
    { type: 'required' },
    { type: 'minLength', params: { min: 8 } },
    { type: 'password', params: { 
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSymbols: false,
      minLength: 8
    }}
  ], { required: true })
  .field('confirmPassword', [
    { type: 'required' },
    { type: 'matchField', params: { field: 'password' } }
  ], { required: true, dependsOn: ['password'] })
  .field('fullName', [
    { type: 'required' },
    { type: 'minLength', params: { min: 2 } },
    { type: 'maxLength', params: { max: 50 } },
    { type: 'pattern', params: { 
      pattern: '^[a-zA-Z\\s\\-\\.]+$',
      message: 'Name can only contain letters, spaces, hyphens, and periods'
    }}
  ], { required: true })
  .formValidator({
    type: 'passwordsMatch',
    params: { fields: ['password', 'confirmPassword'] }
  })
  .options({ 
    debounceMs: 300, 
    abortEarly: false,
    stripUnknown: true
  })
  .build();

// ============================================================================
// Episode Upload Schema
// ============================================================================

/**
 * Validation schema for episode upload
 * Includes file validation for audio formats and metadata validation
 */
export const episodeUploadSchema = SchemaBuilder.create<EpisodeUploadData>()
  .field('title', [
    { type: 'required' },
    { type: 'minLength', params: { min: 1 } },
    { type: 'maxLength', params: { max: 255 } }
  ], { required: true })
  .field('description', [
    { type: 'maxLength', params: { max: 1000 } }
  ])
  .field('file', [
    { type: 'required' },
    { type: 'fileType', params: { 
      types: ['audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/wav'],
      message: 'Please select a valid audio file (MP3, OGG, WebM, or WAV)'
    }},
    { type: 'fileSize', params: { 
      max: 104857600, // 100MB
      message: 'File size must be less than 100MB'
    }}
  ], { required: true })
  .field('episodeNumber', [
    { type: 'min', params: { min: 1 } },
    { type: 'max', params: { max: 9999 } }
  ])
  .options({
    debounceMs: 500,
    abortEarly: false,
    stripUnknown: true
  })
  .build();

// ============================================================================
// Room Creation Schema
// ============================================================================

/**
 * Validation schema for room creation
 * Includes slug uniqueness check and participant limits
 */
export const roomCreationSchema = SchemaBuilder.create<RoomCreationData>()
  .field('name', [
    { type: 'required' },
    { type: 'minLength', params: { min: 1 } },
    { type: 'maxLength', params: { max: 100 } }
  ], { required: true })
  .field('slug', [
    { type: 'pattern', params: { 
      pattern: '^[a-z0-9-]+$',
      message: 'Slug can only contain lowercase letters, numbers, and hyphens'
    }},
    { type: 'minLength', params: { min: 3 } },
    { type: 'maxLength', params: { max: 50 } },
    { type: 'uniqueSlug', async: true, params: { entity: 'room' } }
  ])
  .field('maxParticipants', [
    { type: 'min', params: { min: 1 } },
    { type: 'max', params: { max: 100 } }
  ])
  .field('allowVideo', [])
  .field('description', [
    { type: 'maxLength', params: { max: 500 } }
  ])
  .options({
    debounceMs: 300,
    abortEarly: false,
    stripUnknown: true
  })
  .build();

// ============================================================================
// Guest Invitation Schema
// ============================================================================

/**
 * Validation schema for guest invitation
 * Includes email validation and room existence check
 */
export const guestInviteSchema = SchemaBuilder.create<GuestInviteData>()
  .field('email', [
    { type: 'required' },
    { type: 'email' }
  ], { required: true })
  .field('displayName', [
    { type: 'required' },
    { type: 'minLength', params: { min: 1 } },
    { type: 'maxLength', params: { max: 50 } }
  ], { required: true })
  .field('roomId', [
    { type: 'required' },
    { type: 'pattern', params: { 
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      message: 'Invalid room ID format'
    }}
  ], { required: true })
  .field('message', [
    { type: 'maxLength', params: { max: 200 } }
  ])
  .options({
    debounceMs: 300,
    abortEarly: false,
    stripUnknown: true
  })
  .build();

/**
 * Validation schema for guest invitation (extended)
 * Includes room selection, email validation, and expiration settings
 */
export const guestInvitationSchema = SchemaBuilder.create<GuestInvitationData>()
  .field('roomId', [
    { type: 'required' },
    { type: 'pattern', params: { 
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      message: 'Please select a valid room'
    }}
  ], { required: true })
  .field('guestEmail', [
    { type: 'required' },
    { type: 'email' }
  ], { required: true })
  .field('guestName', [
    { type: 'minLength', params: { min: 1 } },
    { type: 'maxLength', params: { max: 100 } }
  ])
  .field('customMessage', [
    { type: 'maxLength', params: { max: 500 } }
  ])
  .field('expiresInHours', [
    { type: 'required' },
    { type: 'min', params: { min: 1 } },
    { type: 'max', params: { max: 168 } } // Max 1 week
  ], { required: true })
  .options({
    debounceMs: 300,
    abortEarly: false,
    stripUnknown: true
  })
  .build();

// ============================================================================
// Login Schema
// ============================================================================

/**
 * Validation schema for user login
 * Simple email and password validation
 */
export const loginSchema = SchemaBuilder.create<LoginData>()
  .field('email', [
    { type: 'required' },
    { type: 'email' }
  ], { required: true })
  .field('password', [
    { type: 'required' },
    { type: 'minLength', params: { min: 1 } }
  ], { required: true })
  .field('rememberMe', [])
  .options({
    debounceMs: 200,
    abortEarly: true,
    stripUnknown: true
  })
  .build();

// ============================================================================
// Password Reset Schema
// ============================================================================

/**
 * Validation schema for password reset request
 */
export const passwordResetSchema = SchemaBuilder.create<PasswordResetData>()
  .field('email', [
    { type: 'required' },
    { type: 'email' }
  ], { required: true })
  .options({
    debounceMs: 300,
    abortEarly: true,
    stripUnknown: true
  })
  .build();

// ============================================================================
// Password Change Schema
// ============================================================================

/**
 * Validation schema for password change
 * Includes current password verification and new password confirmation
 */
export const passwordChangeSchema = SchemaBuilder.create<PasswordChangeData>()
  .field('currentPassword', [
    { type: 'required' },
    { type: 'minLength', params: { min: 1 } }
  ], { required: true })
  .field('newPassword', [
    { type: 'required' },
    { type: 'minLength', params: { min: 8 } },
    { type: 'password', params: { 
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSymbols: false,
      minLength: 8
    }}
  ], { required: true })
  .field('confirmPassword', [
    { type: 'required' },
    { type: 'matchField', params: { field: 'newPassword' } }
  ], { required: true, dependsOn: ['newPassword'] })
  .formValidator({
    type: 'passwordsMatch',
    params: { fields: ['newPassword', 'confirmPassword'] }
  })
  .formValidator({
    type: 'passwordsDifferent',
    params: { fields: ['currentPassword', 'newPassword'] }
  })
  .options({
    debounceMs: 300,
    abortEarly: false,
    stripUnknown: true
  })
  .build();

// ============================================================================
// Schema Registry
// ============================================================================

/**
 * Registry of all predefined validation schemas
 */
export const validationSchemas = {
  userRegistration: userRegistrationSchema,
  episodeUpload: episodeUploadSchema,
  roomCreation: roomCreationSchema,
  guestInvite: guestInviteSchema,
  guestInvitation: guestInvitationSchema,
  login: loginSchema,
  passwordReset: passwordResetSchema,
  passwordChange: passwordChangeSchema,
} as const;

/**
 * Type for schema names
 */
export type SchemaName = keyof typeof validationSchemas;

/**
 * Get a predefined validation schema by name
 */
export function getValidationSchema<T extends SchemaName>(
  name: T
): typeof validationSchemas[T] {
  return validationSchemas[name];
}

/**
 * Get all available schema names
 */
export function getSchemaNames(): SchemaName[] {
  return Object.keys(validationSchemas) as SchemaName[];
}

/**
 * Check if a schema name exists
 */
export function hasSchema(name: string): name is SchemaName {
  return name in validationSchemas;
}

// ============================================================================
// Schema Utilities
// ============================================================================

/**
 * Create a partial schema for updating existing data
 * Makes all fields optional except those specified as required
 */
export function createUpdateSchema<T>(
  baseSchema: ValidationSchema<T>,
  requiredFields: (keyof T)[] = []
): ValidationSchema<Partial<T>> {
  const builder = SchemaBuilder.create<Partial<T>>();
  
  // Copy all fields but make them optional unless specified
  for (const [fieldName, fieldSchema] of Object.entries(baseSchema.fields)) {
    const typedFieldSchema = fieldSchema as FieldValidationSchema;
    const isRequired = requiredFields.includes(fieldName as keyof T);
    builder.field(
      fieldName as keyof Partial<T>,
      typedFieldSchema.validators,
      {
        required: isRequired,
        dependsOn: typedFieldSchema.dependsOn
      }
    );
  }
  
  // Copy form validators
  if (baseSchema.formValidators) {
    for (const validator of baseSchema.formValidators) {
      builder.formValidator(validator);
    }
  }
  
  // Copy options
  if (baseSchema.options) {
    builder.options(baseSchema.options);
  }
  
  return builder.build();
}

/**
 * Create a schema for a subset of fields
 */
export function createPartialSchema<T, K extends keyof T>(
  baseSchema: ValidationSchema<T>,
  fields: K[]
): ValidationSchema<Pick<T, K>> {
  const builder = SchemaBuilder.create<Pick<T, K>>();
  
  // Only include specified fields
  for (const fieldName of fields) {
    const fieldSchema = baseSchema.fields[fieldName] as FieldValidationSchema;
    if (fieldSchema) {
      builder.field(
        fieldName,
        fieldSchema.validators,
        {
          required: fieldSchema.required,
          dependsOn: fieldSchema.dependsOn?.filter(dep => fields.includes(dep as K))
        }
      );
    }
  }
  
  // Copy options
  if (baseSchema.options) {
    builder.options(baseSchema.options);
  }
  
  return builder.build();
}

// ============================================================================
// Example Usage and Documentation
// ============================================================================

/**
 * Example: Creating a custom schema
 * 
 * ```typescript
 * const customSchema = SchemaBuilder.create<MyFormData>()
 *   .field('email', [
 *     { type: 'required' },
 *     { type: 'email' }
 *   ], { required: true })
 *   .field('age', [
 *     { type: 'min', params: { min: 18 } },
 *     { type: 'max', params: { max: 120 } }
 *   ])
 *   .options({ debounceMs: 300 })
 *   .build();
 * ```
 */

/**
 * Example: Using predefined schemas
 * 
 * ```typescript
 * import { getValidationSchema } from './schemas.ts';
 * 
 * const schema = getValidationSchema('userRegistration');
 * const engine = createValidationEngine();
 * const result = await engine.validateForm(formData, schema);
 * ```
 */

/**
 * Example: Creating update schemas
 * 
 * ```typescript
 * const updateSchema = createUpdateSchema(
 *   userRegistrationSchema,
 *   ['email'] // Only email is required for updates
 * );
 * ```
 */