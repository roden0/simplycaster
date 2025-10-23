// ============================================================================
// Server-Side Validation Middleware
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

// ============================================================================
// Types for Server Validation
// ============================================================================

export interface ValidationMiddlewareOptions {
  /** Whether to abort validation on first error */
  abortEarly?: boolean;
  /** Whether to strip unknown fields from validated data */
  stripUnknown?: boolean;
  /** Whether to allow unknown fields in validated data */
  allowUnknown?: boolean;
  /** Custom error response formatter */
  errorFormatter?: (errors: ValidationError[]) => any;
  /** Custom success response formatter */
  successFormatter?: (data: any) => any;
}

export interface ValidatedRequest<T = any> extends Request {
  validatedData: T;
}

export interface ValidationErrorResponse {
  success: false;
  error: string;
  code: string;
  errors?: ValidationError[];
  field?: string;
}

export interface ValidationSuccessResponse<T = any> {
  success: true;
  data: T;
}

// ============================================================================
// Server Validation Middleware
// ============================================================================

/**
 * Create validation middleware for Fresh routes
 */
export function createValidationMiddleware<T>(
  schema: ValidationSchema<T> | string,
  options: ValidationMiddlewareOptions = {}
) {
  return function validationMiddleware(
    handler: (req: ValidatedRequest<T>, ...args: any[]) => Promise<Response> | Response
  ) {
    return async (req: Request, ...args: any[]): Promise<Response> => {
      try {
        // Initialize validation engine
        const registry = new ValidatorRegistry();
        registerBuiltInValidators(registry);
        const engine = new ValidationEngine(getCopy, registry);

        // Parse request body based on content type
        const contentType = req.headers.get("content-type") || "";
        let requestData: any;

        try {
          if (contentType.includes("application/json")) {
            requestData = await req.json();
          } else if (contentType.includes("application/x-www-form-urlencoded")) {
            const formData = await req.formData();
            requestData = Object.fromEntries(formData.entries());
          } else if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            requestData = {};
            
            // Handle both regular fields and files
            for (const [key, value] of formData.entries()) {
              if (value instanceof File) {
                requestData[key] = value;
              } else {
                // Handle multiple values for the same key
                if (requestData[key]) {
                  if (Array.isArray(requestData[key])) {
                    requestData[key].push(value);
                  } else {
                    requestData[key] = [requestData[key], value];
                  }
                } else {
                  requestData[key] = value;
                }
              }
            }
          } else {
            // Try to parse as JSON for other content types
            const text = await req.text();
            if (text.trim()) {
              try {
                requestData = JSON.parse(text);
              } catch {
                requestData = {};
              }
            } else {
              requestData = {};
            }
          }
        } catch (error) {
          return createErrorResponse({
            success: false,
            error: "Invalid request body format",
            code: "INVALID_REQUEST_BODY"
          }, 400, options.errorFormatter);
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
              ...options
            }
          };
          validationResult = await engine.validateForm<T>(requestData, validationSchema, context);
        }

        // Handle validation failure
        if (!validationResult.success) {
          const errorResponse: ValidationErrorResponse = {
            success: false,
            error: validationResult.errors.length > 0 
              ? validationResult.errors[0].message 
              : "Validation failed",
            code: "VALIDATION_ERROR",
            errors: validationResult.errors
          };

          // Add field for single field errors
          if (validationResult.errors.length === 1) {
            errorResponse.field = validationResult.errors[0].field;
          }

          return createErrorResponse(errorResponse, 400, options.errorFormatter);
        }

        // Create validated request object
        const validatedRequest = req as ValidatedRequest<T>;
        validatedRequest.validatedData = validationResult.data!;

        // Call the original handler with validated data
        return await handler(validatedRequest, ...args);

      } catch (error) {
        console.error("Validation middleware error:", error);
        
        return createErrorResponse({
          success: false,
          error: "Internal validation error",
          code: "VALIDATION_MIDDLEWARE_ERROR"
        }, 500, options.errorFormatter);
      }
    };
  };
}

/**
 * Validate request body against schema (utility function)
 */
export async function validateRequestBody<T>(
  req: Request,
  schema: ValidationSchema<T> | string,
  options: ValidationMiddlewareOptions = {}
): Promise<ValidationResult<T>> {
  try {
    // Initialize validation engine
    const registry = new ValidatorRegistry();
    registerBuiltInValidators(registry);
    const engine = new ValidationEngine(getCopy, registry);

    // Parse request body
    const requestData = await parseRequestBody(req);

    // Create validation context
    const context: ValidationContext = {
      formData: requestData,
      fieldPath: "",
      isSubmitting: true,
      copyManager: getCopy
    };

    // Validate request data
    if (typeof schema === 'string') {
      return await engine.validateFromSchema<T>(requestData, schema);
    } else {
      // Merge options into schema
      const validationSchema = {
        ...schema,
        options: {
          ...schema.options,
          ...options
        }
      };
      return await engine.validateForm<T>(requestData, validationSchema, context);
    }

  } catch (error) {
    console.error("Request body validation error:", error);
    
    return {
      success: false,
      errors: [{
        field: "",
        code: "VALIDATION_ERROR",
        message: "Failed to validate request body",
        params: { error: error instanceof Error ? error.message : String(error) }
      }],
      warnings: []
    };
  }
}

/**
 * Create standardized error response
 */
export function createErrorResponse(
  errorData: ValidationErrorResponse,
  status: number,
  customFormatter?: (errors: ValidationError[]) => any
): Response {
  let responseBody: any;

  if (customFormatter && errorData.errors) {
    responseBody = customFormatter(errorData.errors);
  } else {
    responseBody = errorData;
  }

  return new Response(
    JSON.stringify(responseBody),
    {
      status,
      headers: { "Content-Type": "application/json" }
    }
  );
}

/**
 * Create standardized success response
 */
export function createSuccessResponse<T>(
  data: T,
  status: number = 200,
  customFormatter?: (data: T) => any
): Response {
  let responseBody: any;

  if (customFormatter) {
    responseBody = customFormatter(data);
  } else {
    responseBody = {
      success: true,
      data
    };
  }

  return new Response(
    JSON.stringify(responseBody),
    {
      status,
      headers: { "Content-Type": "application/json" }
    }
  );
}

/**
 * Parse request body based on content type
 */
export async function parseRequestBody(req: Request): Promise<any> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return await req.json();
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await req.formData();
    return Object.fromEntries(formData.entries());
  } else if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const result: any = {};
    
    // Handle both regular fields and files
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        result[key] = value;
      } else {
        // Handle multiple values for the same key
        if (result[key]) {
          if (Array.isArray(result[key])) {
            result[key].push(value);
          } else {
            result[key] = [result[key], value];
          }
        } else {
          result[key] = value;
        }
      }
    }
    
    return result;
  } else {
    // Try to parse as JSON for other content types
    const text = await req.text();
    if (text.trim()) {
      try {
        return JSON.parse(text);
      } catch {
        return {};
      }
    } else {
      return {};
    }
  }
}

// ============================================================================
// Convenience Functions for Common Validation Patterns
// ============================================================================

/**
 * Validate JSON request body
 */
export function validateJSON<T>(schema: ValidationSchema<T> | string, options?: ValidationMiddlewareOptions) {
  return createValidationMiddleware(schema, {
    ...options,
    errorFormatter: options?.errorFormatter || ((errors) => ({
      success: false,
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      errors: errors.map(error => ({
        field: error.field,
        message: error.message,
        code: error.code
      }))
    }))
  });
}

/**
 * Validate form data request
 */
export function validateFormData<T>(schema: ValidationSchema<T> | string, options?: ValidationMiddlewareOptions) {
  return createValidationMiddleware(schema, {
    stripUnknown: true,
    ...options
  });
}

/**
 * Validate multipart form data (with file uploads)
 */
export function validateMultipartData<T>(schema: ValidationSchema<T> | string, options?: ValidationMiddlewareOptions) {
  return createValidationMiddleware(schema, {
    allowUnknown: true, // Allow files and other multipart data
    ...options
  });
}