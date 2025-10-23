// ============================================================================
// API Endpoint Validation Utilities
// SimplyCaster Centralized Form Validation System
// ============================================================================

import type { 
  ValidationSchema, 
  ValidationResult, 
  ValidationError,
  ValidationContext 
} from "./types.ts";
import { ValidationEngine } from "./engine.ts";
import { ValidatorRegistry } from "./registry.ts";
import { registerBuiltInValidators } from "./validators.ts";
import { getCopy } from "../copy.ts";
import { parseRequestBody, createErrorResponse, createSuccessResponse } from "./server-middleware.ts";

// ============================================================================
// Types for API Validation
// ============================================================================

export interface APIValidationOptions {
  /** Whether to sanitize input data */
  sanitize?: boolean;
  /** Whether to strip unknown fields */
  stripUnknown?: boolean;
  /** Whether to allow unknown fields */
  allowUnknown?: boolean;
  /** Maximum file size in bytes */
  maxFileSize?: number;
  /** Allowed file types (MIME types) */
  allowedFileTypes?: string[];
  /** Custom sanitization functions */
  sanitizers?: Record<string, (value: any) => any>;
}

export interface FileValidationOptions {
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Allowed MIME types */
  allowedTypes?: string[];
  /** Allowed file extensions */
  allowedExtensions?: string[];
  /** Whether to validate file content (not just extension) */
  validateContent?: boolean;
}

export interface SanitizationResult<T = any> {
  success: boolean;
  data?: T;
  errors: ValidationError[];
  sanitized: boolean;
}

// ============================================================================
// API Request Validation Functions
// ============================================================================

/**
 * Validate API request body with sanitization
 */
export async function validateAPIRequest<T>(
  req: Request,
  schema: ValidationSchema<T> | string,
  options: APIValidationOptions = {}
): Promise<ValidationResult<T>> {
  try {
    // Initialize validation engine
    const registry = new ValidatorRegistry();
    registerBuiltInValidators(registry);
    const engine = new ValidationEngine(getCopy, registry);

    // Parse request body
    let requestData = await parseRequestBody(req);

    // Sanitize input data if requested
    if (options.sanitize) {
      const sanitizationResult = await sanitizeRequestData(requestData, options);
      if (!sanitizationResult.success) {
        return {
          success: false,
          errors: sanitizationResult.errors,
          warnings: []
        };
      }
      requestData = sanitizationResult.data;
    }

    // Create validation context
    const context: ValidationContext = {
      formData: requestData,
      fieldPath: "",
      isSubmitting: true,
      copyManager: getCopy
    };

    // Validate request data
    let validationResult: ValidationResult<T>;
    
    if (typeof schema === 'string') {
      validationResult = await engine.validateFromSchema<T>(requestData, schema);
    } else {
      // Merge options into schema
      const validationSchema = {
        ...schema,
        options: {
          ...schema.options,
          stripUnknown: options.stripUnknown,
          allowUnknown: options.allowUnknown
        }
      };
      validationResult = await engine.validateForm<T>(requestData, validationSchema, context);
    }

    return validationResult;

  } catch (error) {
    console.error("API request validation error:", error);
    
    return {
      success: false,
      errors: [{
        field: "",
        code: "API_VALIDATION_ERROR",
        message: getCopy("errors.validationError"),
        params: { error: error instanceof Error ? error.message : String(error) }
      }],
      warnings: []
    };
  }
}

/**
 * Validate file uploads in multipart requests
 */
export async function validateFileUploads(
  req: Request,
  fileFields: string[],
  options: FileValidationOptions = {}
): Promise<ValidationResult<Record<string, File | File[]>>> {
  try {
    const contentType = req.headers.get("content-type") || "";
    
    if (!contentType.includes("multipart/form-data")) {
      return {
        success: false,
        errors: [{
          field: "",
          code: "INVALID_CONTENT_TYPE",
          message: "Request must be multipart/form-data for file uploads",
          params: {}
        }],
        warnings: []
      };
    }

    const formData = await req.formData();
    const files: Record<string, File | File[]> = {};
    const errors: ValidationError[] = [];

    // Validate each file field
    for (const fieldName of fileFields) {
      const fileValues = formData.getAll(fieldName);
      const fileList: File[] = [];

      for (const value of fileValues) {
        if (value instanceof File) {
          // Validate individual file
          const fileValidation = await validateSingleFile(value, fieldName, options);
          if (!fileValidation.success) {
            errors.push(...fileValidation.errors);
          } else {
            fileList.push(value);
          }
        }
      }

      // Store files (single file or array)
      if (fileList.length === 1) {
        files[fieldName] = fileList[0];
      } else if (fileList.length > 1) {
        files[fieldName] = fileList;
      }
    }

    return {
      success: errors.length === 0,
      data: errors.length === 0 ? files : undefined,
      errors,
      warnings: []
    };

  } catch (error) {
    console.error("File upload validation error:", error);
    
    return {
      success: false,
      errors: [{
        field: "",
        code: "FILE_VALIDATION_ERROR",
        message: getCopy("errors.fileUploadError"),
        params: { error: error instanceof Error ? error.message : String(error) }
      }],
      warnings: []
    };
  }
}

/**
 * Validate a single file
 */
export async function validateSingleFile(
  file: File,
  fieldName: string,
  options: FileValidationOptions = {}
): Promise<ValidationResult<File>> {
  const errors: ValidationError[] = [];

  // Validate file size
  if (options.maxSize && file.size > options.maxSize) {
    const maxSizeMB = Math.round(options.maxSize / (1024 * 1024));
    errors.push({
      field: fieldName,
      code: "FILE_TOO_LARGE",
      message: getCopy("validation.fileSize", { max: `${maxSizeMB}MB` }),
      params: { maxSize: options.maxSize, actualSize: file.size }
    });
  }

  // Validate MIME type
  if (options.allowedTypes && !options.allowedTypes.includes(file.type)) {
    errors.push({
      field: fieldName,
      code: "INVALID_FILE_TYPE",
      message: getCopy("validation.fileType", { types: options.allowedTypes.join(", ") }),
      params: { allowedTypes: options.allowedTypes, actualType: file.type }
    });
  }

  // Validate file extension
  if (options.allowedExtensions) {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !options.allowedExtensions.includes(fileExtension)) {
      errors.push({
        field: fieldName,
        code: "INVALID_FILE_EXTENSION",
        message: getCopy("validation.fileExtension", { extensions: options.allowedExtensions.join(", ") }),
        params: { allowedExtensions: options.allowedExtensions, actualExtension: fileExtension }
      });
    }
  }

  // Validate file content if requested
  if (options.validateContent && errors.length === 0) {
    const contentValidation = await validateFileContent(file, fieldName);
    if (!contentValidation.success) {
      errors.push(...contentValidation.errors);
    }
  }

  return {
    success: errors.length === 0,
    data: errors.length === 0 ? file : undefined,
    errors,
    warnings: []
  };
}

/**
 * Validate file content (basic checks)
 */
export async function validateFileContent(
  file: File,
  fieldName: string
): Promise<ValidationResult<File>> {
  try {
    // Read first few bytes to check file signature
    const buffer = await file.slice(0, 16).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    // Check for common file signatures
    const isValidFile = await checkFileSignature(bytes, file.type);
    
    if (!isValidFile) {
      return {
        success: false,
        errors: [{
          field: fieldName,
          code: "INVALID_FILE_CONTENT",
          message: getCopy("validation.custom.fileCorrupted"),
          params: { fileName: file.name, mimeType: file.type }
        }],
        warnings: []
      };
    }

    return {
      success: true,
      data: file,
      errors: [],
      warnings: []
    };

  } catch (error) {
    return {
      success: false,
      errors: [{
        field: fieldName,
        code: "FILE_CONTENT_VALIDATION_ERROR",
        message: getCopy("errors.validationError"),
        params: { error: error instanceof Error ? error.message : String(error) }
      }],
      warnings: []
    };
  }
}

/**
 * Check file signature against MIME type
 */
async function checkFileSignature(bytes: Uint8Array, mimeType: string): Promise<boolean> {
  // Common file signatures
  const signatures: Record<string, number[][]> = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
    'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
    'audio/mpeg': [[0xFF, 0xFB], [0xFF, 0xF3], [0xFF, 0xF2], [0x49, 0x44, 0x33]], // MP3
    'audio/ogg': [[0x4F, 0x67, 0x67, 0x53]], // OGG
    'video/webm': [[0x1A, 0x45, 0xDF, 0xA3]], // WebM
    'audio/webm': [[0x1A, 0x45, 0xDF, 0xA3]], // WebM audio
  };

  const expectedSignatures = signatures[mimeType];
  if (!expectedSignatures) {
    // If we don't have a signature for this MIME type, assume it's valid
    return true;
  }

  // Check if any of the expected signatures match
  return expectedSignatures.some(signature => {
    if (bytes.length < signature.length) return false;
    return signature.every((byte, index) => bytes[index] === byte);
  });
}

// ============================================================================
// Input Sanitization Functions
// ============================================================================

/**
 * Sanitize request data to prevent injection attacks
 */
export async function sanitizeRequestData<T>(
  data: T,
  options: APIValidationOptions = {}
): Promise<SanitizationResult<T>> {
  try {
    const sanitized = await sanitizeObject(data, options.sanitizers || {});
    
    return {
      success: true,
      data: sanitized,
      errors: [],
      sanitized: true
    };

  } catch (error) {
    return {
      success: false,
      errors: [{
        field: "",
        code: "SANITIZATION_ERROR",
        message: getCopy("errors.validationError"),
        params: { error: error instanceof Error ? error.message : String(error) }
      }],
      sanitized: false
    };
  }
}

/**
 * Recursively sanitize an object
 */
async function sanitizeObject(obj: any, customSanitizers: Record<string, (value: any) => any>): Promise<any> {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (obj instanceof File) {
    return obj; // Don't sanitize files
  }

  if (Array.isArray(obj)) {
    return Promise.all(obj.map(item => sanitizeObject(item, customSanitizers)));
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const sanitizedKey = sanitizeString(key);
      
      // Apply custom sanitizer if available
      if (customSanitizers[key]) {
        sanitized[sanitizedKey] = customSanitizers[key](value);
      } else {
        sanitized[sanitizedKey] = await sanitizeObject(value, customSanitizers);
      }
    }
    
    return sanitized;
  }

  return obj;
}

/**
 * Sanitize string input to prevent XSS and injection attacks
 */
function sanitizeString(str: string): string {
  if (typeof str !== 'string') {
    return str;
  }

  return str
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters except newlines and tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Trim whitespace
    .trim();
}

/**
 * Sanitize HTML content (basic)
 */
export function sanitizeHTML(html: string): string {
  if (typeof html !== 'string') {
    return html;
  }

  return html
    // Remove script tags
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove on* event handlers
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    // Remove javascript: URLs
    .replace(/javascript:/gi, '')
    // Remove data: URLs (except images)
    .replace(/data:(?!image\/)/gi, '')
    // Basic sanitization
    .replace(/[<>]/g, (match) => match === '<' ? '&lt;' : '&gt;');
}

/**
 * Sanitize SQL input (basic protection)
 */
export function sanitizeSQL(input: string): string {
  if (typeof input !== 'string') {
    return input;
  }

  return input
    // Remove SQL comment markers
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
    // Remove common SQL injection patterns
    .replace(/;\s*(drop|delete|insert|update|create|alter|exec|execute)\s+/gi, '')
    // Escape single quotes
    .replace(/'/g, "''");
}

// ============================================================================
// Response Helper Functions
// ============================================================================

/**
 * Create API error response with validation errors
 */
export function createAPIErrorResponse(
  errors: ValidationError[],
  message: string = "Validation failed",
  status: number = 400
): Response {
  const errorResponse: any = {
    success: false,
    error: message,
    code: "VALIDATION_ERROR",
    errors: errors.map(error => ({
      field: error.field,
      message: error.message,
      code: error.code,
      params: error.params
    }))
  };

  // Add field for single field errors
  if (errors.length === 1) {
    errorResponse.field = errors[0].field;
  }

  return createErrorResponse(errorResponse, status);
}

/**
 * Create API success response with validated data
 */
export function createAPISuccessResponse<T>(
  data: T,
  message?: string,
  status: number = 200
): Response {
  const successResponse = {
    success: true,
    data,
    ...(message && { message })
  };

  return createSuccessResponse(successResponse, status);
}

// ============================================================================
// Common Validation Schemas for API Endpoints
// ============================================================================

/**
 * Common file upload validation options
 */
export const commonFileValidation: FileValidationOptions = {
  maxSize: 100 * 1024 * 1024, // 100MB
  allowedTypes: ['audio/mpeg', 'audio/ogg', 'audio/webm', 'image/jpeg', 'image/png'],
  validateContent: true
};

/**
 * Audio file validation options
 */
export const audioFileValidation: FileValidationOptions = {
  maxSize: 100 * 1024 * 1024, // 100MB
  allowedTypes: ['audio/mpeg', 'audio/ogg', 'audio/webm'],
  allowedExtensions: ['mp3', 'ogg', 'webm'],
  validateContent: true
};

/**
 * Image file validation options
 */
export const imageFileValidation: FileValidationOptions = {
  maxSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/gif'],
  allowedExtensions: ['jpg', 'jpeg', 'png', 'gif'],
  validateContent: true
};