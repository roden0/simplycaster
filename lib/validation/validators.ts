// ============================================================================
// Built-in Validation Functions
// SimplyCaster Centralized Form Validation System
// ============================================================================

import type {
  FieldValidator,
  ValidationResult,
  ValidationContext,
} from "./types.ts";

// ============================================================================
// Basic Field Validators
// ============================================================================

/**
 * Required field validator
 * Checks if a value is not empty (null, undefined, empty string, or empty array)
 */
export const requiredValidator: FieldValidator = (value, context) => {
  const isEmpty = value === null || 
                  value === undefined || 
                  (typeof value === 'string' && value.trim() === '') ||
                  (Array.isArray(value) && value.length === 0);

  if (isEmpty) {
    return {
      success: false,
      errors: [{
        field: context?.fieldPath || '',
        code: 'required',
        message: context?.copyManager('validation.required') || 'This field is required'
      }]
    };
  }

  return { success: true, data: value, errors: [] };
};

/**
 * Email validator
 * Validates email format using a comprehensive regex pattern
 */
export const emailValidator: FieldValidator<string> = (value, context) => {
  // Skip validation if value is empty (let required validator handle it)
  if (!value || value.trim() === '') {
    return { success: true, data: value, errors: [] };
  }

  // Comprehensive email regex that handles most valid email formats
  // This regex prevents consecutive dots and other invalid patterns
  const emailRegex = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!emailRegex.test(value.trim())) {
    return {
      success: false,
      errors: [{
        field: context?.fieldPath || '',
        code: 'email',
        message: context?.copyManager('validation.email') || 'Please enter a valid email address'
      }]
    };
  }

  return { success: true, data: value.trim(), errors: [] };
};

/**
 * Minimum length validator factory
 * Creates a validator that checks if string length is at least the specified minimum
 */
export const minLengthValidator = (minLength: number): FieldValidator<string> => 
  (value, context) => {
    // Skip validation if value is empty (let required validator handle it)
    if (!value || value.trim() === '') {
      return { success: true, data: value, errors: [] };
    }

    if (value.length < minLength) {
      return {
        success: false,
        errors: [{
          field: context?.fieldPath || '',
          code: 'minLength',
          message: context?.copyManager('validation.minLength', { min: minLength.toString() }) || 
            `Must be at least ${minLength} characters`,
          params: { min: minLength }
        }]
      };
    }

    return { success: true, data: value, errors: [] };
  };

/**
 * Maximum length validator factory
 * Creates a validator that checks if string length is at most the specified maximum
 */
export const maxLengthValidator = (maxLength: number): FieldValidator<string> => 
  (value, context) => {
    // Skip validation if value is empty (let required validator handle it)
    if (!value || value.trim() === '') {
      return { success: true, data: value, errors: [] };
    }

    if (value.length > maxLength) {
      return {
        success: false,
        errors: [{
          field: context?.fieldPath || '',
          code: 'maxLength',
          message: context?.copyManager('validation.maxLength', { max: maxLength.toString() }) || 
            `Must be less than ${maxLength} characters`,
          params: { max: maxLength }
        }]
      };
    }

    return { success: true, data: value, errors: [] };
  };

/**
 * Pattern validator factory
 * Creates a validator that checks if string matches the specified regex pattern
 */
export const patternValidator = (pattern: RegExp, errorMessage?: string): FieldValidator<string> => 
  (value, context) => {
    // Skip validation if value is empty (let required validator handle it)
    if (!value || value.trim() === '') {
      return { success: true, data: value, errors: [] };
    }

    if (!pattern.test(value)) {
      return {
        success: false,
        errors: [{
          field: context?.fieldPath || '',
          code: 'pattern',
          message: errorMessage || 
            context?.copyManager('validation.pattern') || 
            'Invalid format',
          params: { pattern: pattern.source }
        }]
      };
    }

    return { success: true, data: value, errors: [] };
  };

/**
 * Minimum value validator factory
 * Creates a validator that checks if numeric value is at least the specified minimum
 */
export const minValidator = (minValue: number): FieldValidator<number> => 
  (value, context) => {
    // Skip validation if value is null/undefined (let required validator handle it)
    if (value === null || value === undefined) {
      return { success: true, data: value, errors: [] };
    }

    // Convert to number if it's a string
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    
    if (isNaN(numValue)) {
      return {
        success: false,
        errors: [{
          field: context?.fieldPath || '',
          code: 'invalidNumber',
          message: 'Must be a valid number'
        }]
      };
    }

    if (numValue < minValue) {
      return {
        success: false,
        errors: [{
          field: context?.fieldPath || '',
          code: 'min',
          message: context?.copyManager('validation.min', { min: minValue.toString() }) || 
            `Must be at least ${minValue}`,
          params: { min: minValue }
        }]
      };
    }

    return { success: true, data: numValue, errors: [] };
  };

/**
 * Maximum value validator factory
 * Creates a validator that checks if numeric value is at most the specified maximum
 */
export const maxValidator = (maxValue: number): FieldValidator<number> => 
  (value, context) => {
    // Skip validation if value is null/undefined (let required validator handle it)
    if (value === null || value === undefined) {
      return { success: true, data: value, errors: [] };
    }

    // Convert to number if it's a string
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    
    if (isNaN(numValue)) {
      return {
        success: false,
        errors: [{
          field: context?.fieldPath || '',
          code: 'invalidNumber',
          message: 'Must be a valid number'
        }]
      };
    }

    if (numValue > maxValue) {
      return {
        success: false,
        errors: [{
          field: context?.fieldPath || '',
          code: 'max',
          message: context?.copyManager('validation.max', { max: maxValue.toString() }) || 
            `Must be no more than ${maxValue}`,
          params: { max: maxValue }
        }]
      };
    }

    return { success: true, data: numValue, errors: [] };
  };

// ============================================================================
// Validator Factory Functions for Registry
// ============================================================================

/**
 * Factory function for minLength validator that can be used with registry
 */
export const createMinLengthValidator = (params: { min: number }) => 
  minLengthValidator(params.min);

/**
 * Factory function for maxLength validator that can be used with registry
 */
export const createMaxLengthValidator = (params: { max: number }) => 
  maxLengthValidator(params.max);

/**
 * Factory function for pattern validator that can be used with registry
 */
export const createPatternValidator = (params: { pattern: string; flags?: string; message?: string }) => 
  patternValidator(new RegExp(params.pattern, params.flags), params.message);

/**
 * Factory function for min validator that can be used with registry
 */
export const createMinValidator = (params: { min: number }) => 
  minValidator(params.min);

/**
 * Factory function for max validator that can be used with registry
 */
export const createMaxValidator = (params: { max: number }) => 
  maxValidator(params.max);

// ============================================================================
// File Validation Functions
// ============================================================================

/**
 * File size validator factory
 * Creates a validator that checks if file size is within the specified limit
 */
export const fileSizeValidator = (maxSizeBytes: number): FieldValidator<File> => 
  (file, context) => {
    // Skip validation if no file (let required validator handle it)
    if (!file) {
      return { success: true, data: file, errors: [] };
    }

    // Check if it's actually a File object
    if (!(file instanceof File)) {
      return {
        success: false,
        errors: [{
          field: context?.fieldPath || '',
          code: 'invalidFile',
          message: 'Invalid file object'
        }]
      };
    }

    if (file.size > maxSizeBytes) {
      const maxSizeMB = Math.round(maxSizeBytes / (1024 * 1024));
      const fileSizeMB = Math.round(file.size / (1024 * 1024));
      
      return {
        success: false,
        errors: [{
          field: context?.fieldPath || '',
          code: 'fileSize',
          message: context?.copyManager('validation.fileSize', { max: `${maxSizeMB}MB` }) || 
            `File size must be less than ${maxSizeMB}MB`,
          params: { 
            max: maxSizeBytes, 
            maxMB: maxSizeMB,
            actualSize: file.size,
            actualSizeMB: fileSizeMB
          }
        }]
      };
    }

    return { success: true, data: file, errors: [] };
  };

/**
 * File type validator factory
 * Creates a validator that checks if file MIME type is in the allowed list
 */
export const fileTypeValidator = (allowedTypes: string[]): FieldValidator<File> => 
  (file, context) => {
    // Skip validation if no file (let required validator handle it)
    if (!file) {
      return { success: true, data: file, errors: [] };
    }

    // Check if it's actually a File object
    if (!(file instanceof File)) {
      return {
        success: false,
        errors: [{
          field: context?.fieldPath || '',
          code: 'invalidFile',
          message: 'Invalid file object'
        }]
      };
    }

    if (!allowedTypes.includes(file.type)) {
      // Create human-readable type list
      const typeNames = allowedTypes.map(type => {
        const parts = type.split('/');
        return parts[1]?.toUpperCase() || type;
      }).join(', ');

      return {
        success: false,
        errors: [{
          field: context?.fieldPath || '',
          code: 'fileType',
          message: context?.copyManager('validation.fileType', { types: typeNames }) || 
            `Invalid file type. Please select ${typeNames}`,
          params: { 
            allowedTypes,
            actualType: file.type,
            fileName: file.name
          }
        }]
      };
    }

    return { success: true, data: file, errors: [] };
  };

/**
 * Multiple file type validator factory
 * Creates a validator that checks multiple files against allowed MIME types
 */
export const multipleFileTypeValidator = (allowedTypes: string[]): FieldValidator<File[]> => 
  (files, context) => {
    // Skip validation if no files (let required validator handle it)
    if (!files || files.length === 0) {
      return { success: true, data: files, errors: [] };
    }

    // Check if it's actually an array of File objects
    if (!Array.isArray(files) || !files.every(file => file instanceof File)) {
      return {
        success: false,
        errors: [{
          field: context?.fieldPath || '',
          code: 'invalidFiles',
          message: 'Invalid file objects'
        }]
      };
    }

    const errors = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (!allowedTypes.includes(file.type)) {
        const typeNames = allowedTypes.map(type => {
          const parts = type.split('/');
          return parts[1]?.toUpperCase() || type;
        }).join(', ');

        errors.push({
          field: `${context?.fieldPath || ''}[${i}]`,
          code: 'fileType',
          message: context?.copyManager('validation.fileType', { types: typeNames }) || 
            `Invalid file type. Please select ${typeNames}`,
          params: { 
            allowedTypes,
            actualType: file.type,
            fileName: file.name,
            fileIndex: i
          }
        });
      }
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true, data: files, errors: [] };
  };

/**
 * File extension validator factory
 * Creates a validator that checks if file extension is in the allowed list
 */
export const fileExtensionValidator = (allowedExtensions: string[]): FieldValidator<File> => 
  (file, context) => {
    // Skip validation if no file (let required validator handle it)
    if (!file) {
      return { success: true, data: file, errors: [] };
    }

    // Check if it's actually a File object
    if (!(file instanceof File)) {
      return {
        success: false,
        errors: [{
          field: context?.fieldPath || '',
          code: 'invalidFile',
          message: 'Invalid file object'
        }]
      };
    }

    // Extract file extension
    const fileName = file.name.toLowerCase();
    const extension = fileName.substring(fileName.lastIndexOf('.'));
    
    // Normalize allowed extensions (ensure they start with .)
    const normalizedAllowed = allowedExtensions.map(ext => 
      ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
    );

    if (!normalizedAllowed.includes(extension)) {
      const extNames = normalizedAllowed.map(ext => ext.substring(1).toUpperCase()).join(', ');
      
      return {
        success: false,
        errors: [{
          field: context?.fieldPath || '',
          code: 'fileExtension',
          message: `Invalid file extension. Please select ${extNames} files`,
          params: { 
            allowedExtensions: normalizedAllowed,
            actualExtension: extension,
            fileName: file.name
          }
        }]
      };
    }

    return { success: true, data: file, errors: [] };
  };

// ============================================================================
// File Validator Factory Functions for Registry
// ============================================================================

/**
 * Factory function for file size validator that can be used with registry
 */
export const createFileSizeValidator = (params: { max: number }) => 
  fileSizeValidator(params.max);

/**
 * Factory function for file type validator that can be used with registry
 */
export const createFileTypeValidator = (params: { types: string[] }) => 
  fileTypeValidator(params.types);

/**
 * Factory function for multiple file type validator that can be used with registry
 */
export const createMultipleFileTypeValidator = (params: { types: string[] }) => 
  multipleFileTypeValidator(params.types);

/**
 * Factory function for file extension validator that can be used with registry
 */
export const createFileExtensionValidator = (params: { extensions: string[] }) => 
  fileExtensionValidator(params.extensions);

// ============================================================================
// Password Validation System
// ============================================================================

/**
 * Password complexity requirements interface
 */
export interface PasswordRequirements {
  /** Minimum password length */
  minLength?: number;
  /** Maximum password length */
  maxLength?: number;
  /** Require at least one uppercase letter */
  requireUppercase?: boolean;
  /** Require at least one lowercase letter */
  requireLowercase?: boolean;
  /** Require at least one digit */
  requireDigit?: boolean;
  /** Require at least one special character */
  requireSpecialChar?: boolean;
  /** Custom special characters (default: !@#$%^&*()_+-=[]{}|;:,.<>?) */
  specialChars?: string;
  /** Disallow common passwords */
  disallowCommon?: boolean;
  /** Disallow sequences like 123, abc */
  disallowSequences?: boolean;
}

/**
 * Default password requirements
 */
const DEFAULT_PASSWORD_REQUIREMENTS: Required<PasswordRequirements> = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecialChar: false,
  specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  disallowCommon: true,
  disallowSequences: true
};

/**
 * Common weak passwords to disallow
 */
const COMMON_PASSWORDS = [
  'password', 'password123', '123456', '123456789', 'qwerty', 'abc123',
  'password1', 'admin', 'letmein', 'welcome', 'monkey', '1234567890',
  'dragon', 'master', 'hello', 'freedom', 'whatever', 'qazwsx',
  'trustno1', 'jordan', 'hunter', 'buster', 'soccer', 'harley',
  'batman', 'andrew', 'tigger', 'sunshine', 'iloveyou', '2000',
  'charlie', 'robert', 'thomas', 'hockey', 'ranger', 'daniel',
  'starwars', 'klaster', '112233', 'george', 'asshole', 'computer',
  'michelle', 'jessica', 'pepper', '1111', 'zxcvbn', '555555',
  '11111111', '131313', 'freedom', '777777', 'pass', 'maggie'
];

/**
 * Password validator factory
 * Creates a validator that checks password complexity against specified requirements
 */
export const passwordValidator = (requirements: PasswordRequirements = {}): FieldValidator<string> => 
  (password, context) => {
    // Skip validation if password is empty (let required validator handle it)
    if (!password || password.trim() === '') {
      return { success: true, data: password, errors: [] };
    }

    const reqs = { ...DEFAULT_PASSWORD_REQUIREMENTS, ...requirements };
    const errors = [];

    // Check minimum length
    if (password.length < reqs.minLength) {
      errors.push({
        field: context?.fieldPath || '',
        code: 'passwordMinLength',
        message: `Password must be at least ${reqs.minLength} characters long`,
        params: { minLength: reqs.minLength, actualLength: password.length }
      });
    }

    // Check maximum length
    if (password.length > reqs.maxLength) {
      errors.push({
        field: context?.fieldPath || '',
        code: 'passwordMaxLength',
        message: `Password must be no more than ${reqs.maxLength} characters long`,
        params: { maxLength: reqs.maxLength, actualLength: password.length }
      });
    }

    // Check uppercase requirement
    if (reqs.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push({
        field: context?.fieldPath || '',
        code: 'passwordUppercase',
        message: 'Password must contain at least one uppercase letter'
      });
    }

    // Check lowercase requirement
    if (reqs.requireLowercase && !/[a-z]/.test(password)) {
      errors.push({
        field: context?.fieldPath || '',
        code: 'passwordLowercase',
        message: 'Password must contain at least one lowercase letter'
      });
    }

    // Check digit requirement
    if (reqs.requireDigit && !/\d/.test(password)) {
      errors.push({
        field: context?.fieldPath || '',
        code: 'passwordDigit',
        message: 'Password must contain at least one number'
      });
    }

    // Check special character requirement
    if (reqs.requireSpecialChar) {
      const specialCharRegex = new RegExp(`[${reqs.specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`);
      if (!specialCharRegex.test(password)) {
        errors.push({
          field: context?.fieldPath || '',
          code: 'passwordSpecialChar',
          message: `Password must contain at least one special character (${reqs.specialChars})`
        });
      }
    }

    // Check against common passwords
    if (reqs.disallowCommon && COMMON_PASSWORDS.includes(password.toLowerCase())) {
      errors.push({
        field: context?.fieldPath || '',
        code: 'passwordCommon',
        message: 'This password is too common. Please choose a more secure password'
      });
    }

    // Check for sequences
    if (reqs.disallowSequences) {
      // Check for numeric sequences (123, 321, etc.)
      if (/(?:012|123|234|345|456|567|678|789|890|987|876|765|654|543|432|321|210)/.test(password)) {
        errors.push({
          field: context?.fieldPath || '',
          code: 'passwordSequence',
          message: 'Password should not contain sequential numbers'
        });
      }

      // Check for alphabetic sequences (abc, cba, etc.)
      if (/(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|zyx|yxw|xwv|wvu|vut|uts|tsr|srq|rqp|qpo|pon|onm|nml|mlk|lkj|kji|jih|ihg|hgf|gfe|fed|edc|dcb|cba)/i.test(password)) {
        errors.push({
          field: context?.fieldPath || '',
          code: 'passwordSequence',
          message: 'Password should not contain sequential letters'
        });
      }

      // Check for repeated characters (aaa, 111, etc.)
      if (/(.)\1{2,}/.test(password)) {
        errors.push({
          field: context?.fieldPath || '',
          code: 'passwordRepeated',
          message: 'Password should not contain repeated characters'
        });
      }
    }

    // If there are errors, use the generic complexity message from copy manager
    if (errors.length > 0) {
      // Try to get the generic message first, fall back to specific errors
      const genericMessage = context?.copyManager('validation.passwordComplexity');
      if (genericMessage && genericMessage !== 'validation.passwordComplexity') {
        return {
          success: false,
          errors: [{
            field: context?.fieldPath || '',
            code: 'passwordComplexity',
            message: genericMessage,
            params: { requirements: reqs, specificErrors: errors }
          }]
        };
      } else {
        return { success: false, errors };
      }
    }

    return { success: true, data: password, errors: [] };
  };

/**
 * Match field validator factory
 * Creates a validator that checks if a field value matches another field's value
 * Commonly used for password confirmation
 */
export const matchFieldValidator = (targetFieldName: string, customMessage?: string): FieldValidator<string> => 
  (value, context) => {
    // Skip validation if value is empty (let required validator handle it)
    if (!value || value.trim() === '') {
      return { success: true, data: value, errors: [] };
    }

    if (!context?.formData) {
      return {
        success: false,
        errors: [{
          field: context?.fieldPath || '',
          code: 'matchFieldNoContext',
          message: 'Cannot validate field match without form context'
        }]
      };
    }

    const targetValue = context.formData[targetFieldName];
    
    if (value !== targetValue) {
      const message = customMessage || 
        context?.copyManager('validation.passwordsMatch') || 
        `Must match ${targetFieldName}`;
        
      return {
        success: false,
        errors: [{
          field: context?.fieldPath || '',
          code: 'matchField',
          message,
          params: { targetField: targetFieldName }
        }]
      };
    }

    return { success: true, data: value, errors: [] };
  };

/**
 * Password strength calculator
 * Returns a strength score from 0-100 and feedback
 */
export function calculatePasswordStrength(password: string): {
  score: number;
  feedback: string[];
  level: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong';
} {
  if (!password) {
    return { score: 0, feedback: ['Password is required'], level: 'very-weak' };
  }

  let score = 0;
  const feedback: string[] = [];

  // Length scoring
  if (password.length >= 8) score += 25;
  else feedback.push('Use at least 8 characters');

  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 10;

  // Character variety scoring
  if (/[a-z]/.test(password)) score += 10;
  else feedback.push('Add lowercase letters');

  if (/[A-Z]/.test(password)) score += 10;
  else feedback.push('Add uppercase letters');

  if (/\d/.test(password)) score += 10;
  else feedback.push('Add numbers');

  if (/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) score += 15;
  else feedback.push('Add special characters');

  // Pattern penalties
  if (/(.)\1{2,}/.test(password)) {
    score -= 10;
    feedback.push('Avoid repeated characters');
  }

  if (COMMON_PASSWORDS.includes(password.toLowerCase())) {
    score -= 25;
    feedback.push('Avoid common passwords');
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(100, score));

  // Determine level
  let level: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong';
  if (score < 20) level = 'very-weak';
  else if (score < 40) level = 'weak';
  else if (score < 60) level = 'fair';
  else if (score < 80) level = 'good';
  else level = 'strong';

  return { score, feedback, level };
}

// ============================================================================
// Password Validator Factory Functions for Registry
// ============================================================================

/**
 * Factory function for password validator that can be used with registry
 */
export const createPasswordValidator = (params: PasswordRequirements = {}) => 
  passwordValidator(params);

/**
 * Factory function for match field validator that can be used with registry
 */
export const createMatchFieldValidator = (params: { field: string; message?: string }) => 
  matchFieldValidator(params.field, params.message);

// ============================================================================
// Built-in Validator Registration
// ============================================================================

import { ValidatorRegistry, defaultValidatorRegistry } from "./registry.ts";

/**
 * Register all built-in validators with a registry
 */
export function registerBuiltInValidators(registry: ValidatorRegistry): void {
  // Basic field validators
  registry.register('required', requiredValidator, {
    description: 'Validates that a field has a value',
    examples: ['{ type: "required" }']
  });

  registry.register('email', emailValidator, {
    description: 'Validates email format',
    examples: ['{ type: "email" }']
  });

  // Parameterized validators (use the factory functions directly)
  registry.register('minLength', createMinLengthValidator as any, {
    description: 'Validates minimum string length',
    parameterSchema: { min: 'number' },
    examples: ['{ type: "minLength", params: { min: 8 } }']
  });

  registry.register('maxLength', createMaxLengthValidator as any, {
    description: 'Validates maximum string length',
    parameterSchema: { max: 'number' },
    examples: ['{ type: "maxLength", params: { max: 255 } }']
  });

  registry.register('pattern', createPatternValidator as any, {
    description: 'Validates string against regex pattern',
    parameterSchema: { pattern: 'string', flags: 'string?', message: 'string?' },
    examples: [
      '{ type: "pattern", params: { pattern: "^[a-zA-Z]+$", message: "Only letters allowed" } }'
    ]
  });

  registry.register('min', createMinValidator as any, {
    description: 'Validates minimum numeric value',
    parameterSchema: { min: 'number' },
    examples: ['{ type: "min", params: { min: 0 } }']
  });

  registry.register('max', createMaxValidator as any, {
    description: 'Validates maximum numeric value',
    parameterSchema: { max: 'number' },
    examples: ['{ type: "max", params: { max: 100 } }']
  });

  // File validators
  registry.register('fileSize', createFileSizeValidator as any, {
    description: 'Validates file size limit',
    parameterSchema: { max: 'number' },
    examples: ['{ type: "fileSize", params: { max: 10485760 } } // 10MB']
  });

  registry.register('fileType', createFileTypeValidator as any, {
    description: 'Validates file MIME type',
    parameterSchema: { types: 'string[]' },
    examples: ['{ type: "fileType", params: { types: ["image/jpeg", "image/png"] } }']
  });

  registry.register('multipleFileType', createMultipleFileTypeValidator as any, {
    description: 'Validates multiple files MIME types',
    parameterSchema: { types: 'string[]' },
    examples: ['{ type: "multipleFileType", params: { types: ["audio/mpeg", "audio/ogg"] } }']
  });

  registry.register('fileExtension', createFileExtensionValidator as any, {
    description: 'Validates file extension',
    parameterSchema: { extensions: 'string[]' },
    examples: ['{ type: "fileExtension", params: { extensions: [".jpg", ".png"] } }']
  });

  // Password validators
  registry.register('password', createPasswordValidator as any, {
    description: 'Validates password complexity',
    parameterSchema: {
      minLength: 'number?',
      maxLength: 'number?',
      requireUppercase: 'boolean?',
      requireLowercase: 'boolean?',
      requireDigit: 'boolean?',
      requireSpecialChar: 'boolean?',
      specialChars: 'string?',
      disallowCommon: 'boolean?',
      disallowSequences: 'boolean?'
    },
    examples: [
      '{ type: "password" }',
      '{ type: "password", params: { minLength: 12, requireSpecialChar: true } }'
    ]
  });

  registry.register('matchField', createMatchFieldValidator as any, {
    description: 'Validates that field matches another field value',
    parameterSchema: { field: 'string', message: 'string?' },
    examples: ['{ type: "matchField", params: { field: "password" } }']
  });
}

/**
 * Get a pre-configured registry with all built-in validators
 */
export function createRegistryWithBuiltIns(): ValidatorRegistry {
  const registry = new ValidatorRegistry();
  registerBuiltInValidators(registry);
  return registry;
}

/**
 * Register async validators with the default registry
 * This is called lazily to avoid circular dependencies
 */
export function registerAsyncValidatorsWithDefault(): void {
  // Import async validators dynamically to avoid circular dependencies
  import("./async-validators.ts").then(({ registerAsyncValidators }) => {
    registerAsyncValidators(defaultValidatorRegistry);
  }).catch(error => {
    console.warn('Failed to register async validators:', error);
  });
}