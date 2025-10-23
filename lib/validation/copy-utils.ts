/**
 * Validation-specific copy management utilities
 * Provides specialized functions for retrieving and interpolating validation messages
 */

import { getCopy, getCopySection } from '../copy.ts';
import type { ValidationContext, ValidationError } from './types.ts';

/**
 * Validation message interpolation context
 */
export interface ValidationMessageContext {
  field?: string;
  value?: unknown;
  min?: number;
  max?: number | string; // Allow string for file sizes like "100MB"
  length?: number;
  minLength?: number;
  maxLength?: number;
  format?: string;
  type?: string;
  types?: string;
  extensions?: string;
  condition?: string;
  dependentField?: string;
  dependentValue?: unknown;
  [key: string]: unknown;
}

/**
 * Extended validation context with additional properties for copy management
 */
export interface ExtendedValidationContext extends ValidationContext {
  /** Context name for context-specific messages (e.g., 'user', 'room', 'episode') */
  context?: string;
}

/**
 * Get validation message with context-aware fallbacks
 */
export function getValidationMessage(
  key: string,
  context?: ValidationMessageContext,
  validationContext?: ExtendedValidationContext
): string {
  // Try context-specific message first
  if (validationContext?.context) {
    const contextKey = `validation.contexts.${validationContext.context}.${key}`;
    const contextMessage = getCopy(contextKey, context as Record<string, string | number>);
    if (contextMessage !== contextKey) {
      return contextMessage;
    }
  }

  // Try general validation message
  const generalKey = `validation.${key}`;
  const generalMessage = getCopy(generalKey, context as Record<string, string | number>);
  if (generalMessage !== generalKey) {
    return generalMessage;
  }

  // Try fallback message
  const fallbackKey = `validation.fallback.${key}`;
  const fallbackMessage = getCopy(fallbackKey, context as Record<string, string | number>);
  if (fallbackMessage !== fallbackKey) {
    return fallbackMessage;
  }

  // Final fallback
  return getCopy('validation.fallback.generic', context as Record<string, string | number>);
}

/**
 * Get parameterized validation message with automatic context building
 */
export function getParameterizedValidationMessage(
  key: string,
  params: Record<string, unknown>,
  validationContext?: ExtendedValidationContext
): string {
  const context: ValidationMessageContext = {
    ...params,
  };

  // Convert common parameter names to expected format
  if ('minLength' in params) context.min = params.minLength as number;
  if ('maxLength' in params) context.max = params.maxLength as number;
  if ('minimum' in params) context.min = params.minimum as number;
  if ('maximum' in params) context.max = params.maximum as number;

  return getValidationMessage(key, context, validationContext);
}

/**
 * Get validation message for a specific field with field name interpolation
 */
export function getFieldValidationMessage(
  fieldName: string,
  key: string,
  context?: ValidationMessageContext,
  validationContext?: ExtendedValidationContext
): string {
  const fieldContext = {
    ...context,
    field: fieldName,
  };

  return getValidationMessage(key, fieldContext, validationContext);
}

/**
 * Convert validation error to localized message
 */
export function formatValidationError(
  error: ValidationError,
  validationContext?: ExtendedValidationContext
): string {
  const context: ValidationMessageContext = {
    field: error.field,
    ...error.params,
  };

  return getValidationMessage(error.code, context, validationContext);
}

/**
 * Get all validation messages for a specific context
 */
export function getContextValidationMessages(contextName: string): Record<string, string> {
  return getCopySection(`validation.contexts.${contextName}`);
}

/**
 * Get validation message with custom interpolation
 */
export function getCustomValidationMessage(
  template: string,
  variables: Record<string, unknown>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    return value !== undefined ? String(value) : match;
  });
}

/**
 * Build validation message context from validation parameters
 */
export function buildValidationContext(
  field: string,
  value: unknown,
  params?: Record<string, unknown>
): ValidationMessageContext {
  return {
    field,
    value,
    ...params,
  };
}

/**
 * Get async validation messages
 */
export function getAsyncValidationMessage(
  state: 'validating' | 'failed' | 'timeout' | 'error',
  context?: ValidationMessageContext,
  validationContext?: ExtendedValidationContext
): string {
  // Map states to the correct keys in copy.json
  const keyMap = {
    validating: 'async',
    failed: 'asyncFailed',
    timeout: 'asyncTimeout',
    error: 'asyncError',
  };
  
  const key = keyMap[state];
  return getValidationMessage(key, context, validationContext);
}

/**
 * Get server validation error message
 */
export function getServerValidationMessage(
  error: string | Error,
  context?: ValidationMessageContext,
  validationContext?: ExtendedValidationContext
): string {
  const errorMessage = error instanceof Error ? error.message : error;
  const messageContext = {
    ...context,
    error: errorMessage,
  };

  return getValidationMessage('serverError', messageContext, validationContext);
}

/**
 * Get conditional validation message
 */
export function getConditionalValidationMessage(
  condition: string,
  dependentField?: string,
  dependentValue?: unknown,
  validationContext?: ExtendedValidationContext
): string {
  const context: ValidationMessageContext = {
    condition,
    field: dependentField,
    value: dependentValue,
    dependentField,
    dependentValue,
  };

  if (dependentField && dependentValue !== undefined) {
    return getValidationMessage('conditionalValue', context, validationContext);
  }

  return getValidationMessage('conditional', context, validationContext);
}

/**
 * Get array validation message
 */
export function getArrayValidationMessage(
  type: 'minLength' | 'maxLength' | 'length' | 'unique',
  params: { min?: number; max?: number; length?: number },
  validationContext?: ExtendedValidationContext
): string {
  const key = `array${type.charAt(0).toUpperCase() + type.slice(1)}`;
  return getValidationMessage(key, params, validationContext);
}

/**
 * Get file validation message
 */
export function getFileValidationMessage(
  type: 'size' | 'type' | 'extension',
  params: { max?: string | number; types?: string; extensions?: string },
  validationContext?: ExtendedValidationContext
): string {
  const key = `file${type.charAt(0).toUpperCase() + type.slice(1)}`;
  return getValidationMessage(key, params, validationContext);
}

/**
 * Validation message utilities for common use cases
 */
export const validationMessages = {
  required: (field?: string, context?: ExtendedValidationContext) =>
    getFieldValidationMessage(field || '', 'required', undefined, context),

  email: (field?: string, context?: ExtendedValidationContext) =>
    getFieldValidationMessage(field || '', 'email', undefined, context),

  minLength: (min: number, field?: string, context?: ExtendedValidationContext) =>
    getFieldValidationMessage(field || '', 'minLength', { min }, context),

  maxLength: (max: number, field?: string, context?: ExtendedValidationContext) =>
    getFieldValidationMessage(field || '', 'maxLength', { max }, context),

  range: (min: number, max: number, field?: string, context?: ExtendedValidationContext) =>
    getFieldValidationMessage(field || '', 'range', { min, max }, context),

  pattern: (field?: string, context?: ExtendedValidationContext) =>
    getFieldValidationMessage(field || '', 'pattern', undefined, context),

  unique: (field?: string, context?: ExtendedValidationContext) =>
    getFieldValidationMessage(field || '', 'unique', undefined, context),

  custom: (message: string, variables?: Record<string, unknown>) =>
    getCustomValidationMessage(message, variables || {}),
};

/**
 * Export validation copy section for convenience
 */
export const validationCopy = getCopySection('validation');