// ============================================================================
// Validation Hooks - Client-side form integration for Preact
// SimplyCaster Centralized Form Validation System
// ============================================================================

import { signal, computed, type Signal } from "@preact/signals";
import { useEffect, useMemo, useCallback } from "preact/hooks";
import type {
  ValidationResult,
  ValidationError,
  ValidationSchema,
  FieldValidationSchema,
  ValidationContext,
  SerializableValidator,
} from "./types.ts";
import { ValidationEngine } from "./engine.ts";
import { defaultValidatorRegistry } from "./registry.ts";
import { getCopy } from "../copy.ts";
import { 
  AsyncValidationFramework, 
  createDebouncedAsyncValidator,
  type AsyncValidationConfig 
} from "./async-validation.ts";

// ============================================================================
// Debounce Utility
// ============================================================================

/**
 * Debounce function for validation
 */
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// ============================================================================
// Form Validation Hook
// ============================================================================

/**
 * Hook for managing entire form validation state
 */
export function useFormValidation<T extends Record<string, any>>(
  schema: ValidationSchema<T>,
  initialData?: Partial<T>
) {
  // Create signals for form state
  const data = signal<Partial<T>>(initialData || {});
  const errors = signal<Record<string, ValidationError[]>>({});
  const isValidating = signal(false);
  const isSubmitting = signal(false);
  const touchedFields = signal<Set<string>>(new Set());

  // Create validation engine
  const validationEngine = useMemo(
    () => new ValidationEngine(getCopy, defaultValidatorRegistry),
    []
  );

  // Computed values
  const isValid = computed(() => {
    const currentErrors = errors.value;
    return Object.keys(currentErrors).every(field => 
      !currentErrors[field] || currentErrors[field].length === 0
    );
  });

  const hasErrors = computed(() => !isValid.value);

  const fieldErrors = computed(() => {
    const currentErrors = errors.value;
    const result: Record<string, string | undefined> = {};
    
    for (const [field, fieldErrors] of Object.entries(currentErrors)) {
      result[field] = fieldErrors && fieldErrors.length > 0 
        ? fieldErrors[0].message 
        : undefined;
    }
    
    return result;
  });

  // Debounced field validation
  const validateField = useMemo(() => {
    const debounceMs = schema.options?.debounceMs || 300;
    
    return debounce(async (fieldName: string, value: any) => {
      const fieldSchema = schema.fields[fieldName as keyof T];
      if (!fieldSchema) return;

      isValidating.value = true;
      
      const context: ValidationContext = {
        formData: data.value,
        fieldPath: fieldName,
        isSubmitting: isSubmitting.value,
        copyManager: getCopy
      };

      try {
        const result = await validationEngine.validateField(value, fieldSchema, context);
        
        // Update errors for this field
        const currentErrors = { ...errors.value };
        currentErrors[fieldName] = result.errors;
        errors.value = currentErrors;
      } catch (error) {
        console.error(`Field validation failed for ${fieldName}:`, error);
        
        const currentErrors = { ...errors.value };
        currentErrors[fieldName] = [{
          field: fieldName,
          code: 'validationError',
          message: getCopy('errors.validationError'),
          params: { error: error instanceof Error ? error.message : String(error) }
        }];
        errors.value = currentErrors;
      } finally {
        isValidating.value = false;
      }
    }, debounceMs);
  }, [schema, validationEngine]);

  // Set field value and trigger validation
  const setFieldValue = useCallback((fieldName: string, value: any) => {
    // Update data
    const currentData = { ...data.value } as Record<string, any>;
    currentData[fieldName] = value;
    data.value = currentData as Partial<T>;

    // Mark field as touched
    const touched = new Set(touchedFields.value);
    touched.add(fieldName);
    touchedFields.value = touched;

    // Validate field
    validateField(fieldName, value);
  }, [validateField]);

  // Get field value
  const getFieldValue = useCallback((fieldName: string) => {
    return data.value[fieldName];
  }, []);

  // Get field error
  const getFieldError = useCallback((fieldName: string): string | undefined => {
    const fieldErrors = errors.value[fieldName];
    return fieldErrors && fieldErrors.length > 0 ? fieldErrors[0].message : undefined;
  }, []);

  // Check if field has error
  const hasFieldError = useCallback((fieldName: string): boolean => {
    const fieldErrors = errors.value[fieldName];
    return fieldErrors && fieldErrors.length > 0;
  }, []);

  // Check if field is touched
  const isFieldTouched = useCallback((fieldName: string): boolean => {
    return touchedFields.value.has(fieldName);
  }, []);

  // Validate entire form
  const validateForm = useCallback(async (): Promise<ValidationResult<T>> => {
    isValidating.value = true;
    isSubmitting.value = true;
    
    const context: ValidationContext = {
      formData: data.value,
      fieldPath: '',
      isSubmitting: true,
      copyManager: getCopy
    };

    try {
      const result = await validationEngine.validateForm(data.value as T, schema, context);
      
      // Group errors by field
      const errorsByField: Record<string, ValidationError[]> = {};
      result.errors.forEach(error => {
        if (!errorsByField[error.field]) {
          errorsByField[error.field] = [];
        }
        errorsByField[error.field].push(error);
      });
      
      errors.value = errorsByField;
      
      // Mark all fields as touched
      const allFields = new Set([
        ...Object.keys(schema.fields),
        ...Object.keys(data.value)
      ]);
      touchedFields.value = allFields;
      
      return result;
    } catch (error) {
      console.error('Form validation failed:', error);
      
      const errorResult: ValidationResult<T> = {
        success: false,
        errors: [{
          field: '',
          code: 'validationError',
          message: getCopy('errors.validationError'),
          params: { error: error instanceof Error ? error.message : String(error) }
        }],
        warnings: []
      };
      
      return errorResult;
    } finally {
      isValidating.value = false;
      isSubmitting.value = false;
    }
  }, [schema, validationEngine]);

  // Submit form with validation
  const submitForm = useCallback(async (
    onSubmit: (data: T) => Promise<void> | void
  ): Promise<boolean> => {
    const result = await validateForm();
    
    if (result.success && result.data) {
      try {
        await onSubmit(result.data);
        return true;
      } catch (error) {
        console.error('Form submission failed:', error);
        
        // Add submission error
        const currentErrors = { ...errors.value };
        currentErrors[''] = [{
          field: '',
          code: 'submissionError',
          message: getCopy('errors.submissionError'),
          params: { error: error instanceof Error ? error.message : String(error) }
        }];
        errors.value = currentErrors;
        
        return false;
      }
    }
    
    return false;
  }, [validateForm]);

  // Reset form
  const reset = useCallback((newData?: Partial<T>) => {
    data.value = newData || initialData || {};
    errors.value = {};
    touchedFields.value = new Set();
    isValidating.value = false;
    isSubmitting.value = false;
  }, [initialData]);

  // Clear field error
  const clearFieldError = useCallback((fieldName: string) => {
    const currentErrors = { ...errors.value };
    delete currentErrors[fieldName];
    errors.value = currentErrors;
  }, []);

  // Clear all errors
  const clearErrors = useCallback(() => {
    errors.value = {};
  }, []);

  // Touch field (mark as interacted with)
  const touchField = useCallback((fieldName: string) => {
    const touched = new Set(touchedFields.value);
    touched.add(fieldName);
    touchedFields.value = touched;
  }, []);

  // Touch all fields
  const touchAllFields = useCallback(() => {
    const allFields = new Set([
      ...Object.keys(schema.fields),
      ...Object.keys(data.value)
    ]);
    touchedFields.value = allFields;
  }, [schema]);

  return {
    // State signals
    data: data.value,
    errors: errors.value,
    isValidating: isValidating.value,
    isSubmitting: isSubmitting.value,
    isValid: isValid.value,
    hasErrors: hasErrors.value,
    fieldErrors: fieldErrors.value,
    touchedFields: Array.from(touchedFields.value),

    // Field operations
    setFieldValue,
    getFieldValue,
    getFieldError,
    hasFieldError,
    isFieldTouched,
    touchField,
    clearFieldError,

    // Form operations
    validateForm,
    submitForm,
    reset,
    clearErrors,
    touchAllFields,
  };
}

// ============================================================================
// Field Validation Hook
// ============================================================================

/**
 * Hook for single field validation scenarios
 */
export function useFieldValidation<T>(
  validators: SerializableValidator[],
  initialValue?: T,
  options?: {
    debounceMs?: number;
    validateOnMount?: boolean;
  }
) {
  // Create signals for field state
  const value = signal<T | undefined>(initialValue);
  const error = signal<string | undefined>(undefined);
  const isValidating = signal(false);
  const isTouched = signal(false);

  // Create validation engine
  const validationEngine = useMemo(
    () => new ValidationEngine(getCopy, defaultValidatorRegistry),
    []
  );

  // Computed values
  const hasError = computed(() => !!error.value);
  const isValid = computed(() => !error.value);

  // Debounced validation
  const validate = useMemo(() => {
    const debounceMs = options?.debounceMs || 300;
    
    return debounce(async (val: T) => {
      if (validators.length === 0) return;

      isValidating.value = true;
      
      const fieldSchema: FieldValidationSchema = { validators };
      const context: ValidationContext = {
        formData: {},
        fieldPath: '',
        isSubmitting: false,
        copyManager: getCopy
      };

      try {
        const result = await validationEngine.validateField(val, fieldSchema, context);
        error.value = result.errors.length > 0 ? result.errors[0].message : undefined;
      } catch (err) {
        console.error('Field validation failed:', err);
        error.value = getCopy('errors.validationError');
      } finally {
        isValidating.value = false;
      }
    }, debounceMs);
  }, [validators, validationEngine, options?.debounceMs]);

  // Update value and trigger validation
  const setValue = useCallback((newValue: T) => {
    value.value = newValue;
    isTouched.value = true;
    validate(newValue);
  }, [validate]);

  // Validate current value immediately
  const validateNow = useCallback(async (): Promise<boolean> => {
    if (validators.length === 0 || value.value === undefined) return true;

    isValidating.value = true;
    
    const fieldSchema: FieldValidationSchema = { validators };
    const context: ValidationContext = {
      formData: {},
      fieldPath: '',
      isSubmitting: false,
      copyManager: getCopy
    };

    try {
      const result = await validationEngine.validateField(value.value, fieldSchema, context);
      error.value = result.errors.length > 0 ? result.errors[0].message : undefined;
      return result.success;
    } catch (err) {
      console.error('Field validation failed:', err);
      error.value = getCopy('errors.validationError');
      return false;
    } finally {
      isValidating.value = false;
    }
  }, [validators, validationEngine]);

  // Clear error
  const clearError = useCallback(() => {
    error.value = undefined;
  }, []);

  // Reset field
  const reset = useCallback((newValue?: T) => {
    value.value = newValue || initialValue;
    error.value = undefined;
    isTouched.value = false;
    isValidating.value = false;
  }, [initialValue]);

  // Touch field
  const touch = useCallback(() => {
    isTouched.value = true;
  }, []);

  // Validate on mount if requested
  useEffect(() => {
    if (options?.validateOnMount && value.value !== undefined) {
      validateNow();
    }
  }, []);

  return {
    // State
    value: value.value,
    error: error.value,
    isValidating: isValidating.value,
    isTouched: isTouched.value,
    hasError: hasError.value,
    isValid: isValid.value,

    // Operations
    setValue,
    validateNow,
    clearError,
    reset,
    touch,
  };
}

// ============================================================================
// Async Field Validation Hook
// ============================================================================

/**
 * Hook for async field validation with loading states
 */
export function useAsyncFieldValidation<T>(
  asyncValidators: SerializableValidator[],
  initialValue?: T,
  options?: {
    debounceMs?: number;
    timeout?: number;
  }
) {
  // Create signals for async field state
  const value = signal<T | undefined>(initialValue);
  const error = signal<string | undefined>(undefined);
  const isValidating = signal(false);
  const isTouched = signal(false);
  const lastValidationId = signal<string>('');

  // Create validation engine
  const validationEngine = useMemo(
    () => new ValidationEngine(getCopy, defaultValidatorRegistry),
    []
  );

  // Computed values
  const hasError = computed(() => !!error.value);
  const isValid = computed(() => !error.value && !isValidating.value);

  // Debounced async validation
  const validate = useMemo(() => {
    const debounceMs = options?.debounceMs || 500; // Longer debounce for async
    const timeout = options?.timeout || 10000; // 10 second timeout
    
    return debounce(async (val: T) => {
      if (asyncValidators.length === 0) return;

      const validationId = crypto.randomUUID();
      lastValidationId.value = validationId;
      isValidating.value = true;
      
      const fieldSchema: FieldValidationSchema = { validators: asyncValidators };
      const context: ValidationContext = {
        formData: {},
        fieldPath: '',
        isSubmitting: false,
        copyManager: getCopy
      };

      try {
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Validation timeout')), timeout);
        });

        // Race validation against timeout
        const validationPromise = validationEngine.validateField(val, fieldSchema, context);
        const result = await Promise.race([validationPromise, timeoutPromise]);

        // Only update if this is still the latest validation
        if (lastValidationId.value === validationId) {
          error.value = result.errors.length > 0 ? result.errors[0].message : undefined;
        }
      } catch (err) {
        // Only update if this is still the latest validation
        if (lastValidationId.value === validationId) {
          console.error('Async field validation failed:', err);
          const errorMessage = err instanceof Error ? err.message : String(err);
          if (errorMessage === 'Validation timeout') {
            error.value = getCopy('errors.validationTimeout');
          } else {
            error.value = getCopy('errors.validationError');
          }
        }
      } finally {
        // Only update if this is still the latest validation
        if (lastValidationId.value === validationId) {
          isValidating.value = false;
        }
      }
    }, debounceMs);
  }, [asyncValidators, validationEngine, options?.debounceMs, options?.timeout]);

  // Update value and trigger validation
  const setValue = useCallback((newValue: T) => {
    value.value = newValue;
    isTouched.value = true;
    validate(newValue);
  }, [validate]);

  // Cancel ongoing validation
  const cancelValidation = useCallback(() => {
    lastValidationId.value = crypto.randomUUID(); // Invalidate current validation
    isValidating.value = false;
  }, []);

  // Reset field
  const reset = useCallback((newValue?: T) => {
    cancelValidation();
    value.value = newValue || initialValue;
    error.value = undefined;
    isTouched.value = false;
  }, [initialValue, cancelValidation]);

  return {
    // State
    value: value.value,
    error: error.value,
    isValidating: isValidating.value,
    isTouched: isTouched.value,
    hasError: hasError.value,
    isValid: isValid.value,

    // Operations
    setValue,
    cancelValidation,
    reset,
    touch: () => { isTouched.value = true; },
    clearError: () => { error.value = undefined; },
  };
}

// ============================================================================
// Enhanced Async Field Validation Hook with Framework Integration
// ============================================================================

/**
 * Enhanced async field validation hook using the async validation framework
 */
export function useEnhancedAsyncFieldValidation<T>(
  asyncValidators: SerializableValidator[],
  initialValue?: T,
  config?: AsyncValidationConfig & {
    debounceMs?: number;
  }
) {
  // Create signals for enhanced async field state
  const value = signal<T | undefined>(initialValue);
  const error = signal<string | undefined>(undefined);
  const isValidating = signal(false);
  const isTouched = signal(false);
  const retryAttempts = signal(0);
  const lastValidationId = signal<string>('');
  const validationDuration = signal<number>(0);
  const isCancelled = signal(false);
  const isTimedOut = signal(false);

  // Create async validation framework
  const asyncFramework = useMemo(
    () => new AsyncValidationFramework(config),
    [config]
  );

  // Create validation engine
  const validationEngine = useMemo(
    () => new ValidationEngine(getCopy, defaultValidatorRegistry),
    []
  );

  // Computed values
  const hasError = computed(() => !!error.value);
  const isValid = computed(() => !error.value && !isValidating.value && isTouched.value);
  const canRetry = computed(() => hasError.value && !isValidating.value && retryAttempts.value < (config?.maxRetries || 3));

  // Enhanced async validation with framework
  const validate = useMemo(() => {
    if (asyncValidators.length === 0) {
      return async (_val: T) => {};
    }

    // Create a composite validator from all async validators
    const compositeValidator = async (val: T, context?: ValidationContext) => {
      const fieldSchema: FieldValidationSchema = { validators: asyncValidators };
      const validationContext = context || {
        formData: {},
        fieldPath: 'field',
        isSubmitting: false,
        copyManager: getCopy
      };
      return validationEngine.validateField(val, fieldSchema, validationContext);
    };

    // Use debounced async validator if debounce is configured
    const finalValidator = config?.debounceMs 
      ? createDebouncedAsyncValidator(compositeValidator, config.debounceMs, config)
      : compositeValidator;

    return async (val: T) => {
      const validationId = crypto.randomUUID();
      lastValidationId.value = validationId;
      isValidating.value = true;
      isCancelled.value = false;
      isTimedOut.value = false;
      
      const startTime = Date.now();
      const context: ValidationContext = {
        formData: {},
        fieldPath: 'field',
        isSubmitting: false,
        copyManager: getCopy
      };

      try {
        const result = await asyncFramework.executeValidator(finalValidator, val, context, config);
        
        // Only update if this is still the latest validation
        if (lastValidationId.value === validationId) {
          validationDuration.value = Date.now() - startTime;
          
          if (result.cancelled) {
            isCancelled.value = true;
            error.value = undefined;
          } else if (result.timedOut) {
            isTimedOut.value = true;
            error.value = 'Validation timed out. Please try again.';
          } else {
            error.value = result.errors.length > 0 ? result.errors[0].message : undefined;
            retryAttempts.value = result.retryAttempts || 0;
          }
        }
      } catch (err) {
        // Only update if this is still the latest validation
        if (lastValidationId.value === validationId) {
          console.error('Enhanced async field validation failed:', err);
          error.value = getCopy('errors.validationError') || 'Validation failed';
          validationDuration.value = Date.now() - startTime;
        }
      } finally {
        // Only update if this is still the latest validation
        if (lastValidationId.value === validationId) {
          isValidating.value = false;
        }
      }
    };
  }, [asyncValidators, validationEngine, asyncFramework, config]);

  // Update value and trigger validation
  const setValue = useCallback((newValue: T) => {
    value.value = newValue;
    isTouched.value = true;
    validate(newValue);
  }, [validate]);

  // Cancel ongoing validation
  const cancelValidation = useCallback(() => {
    asyncFramework.cancelValidation('field');
    lastValidationId.value = crypto.randomUUID(); // Invalidate current validation
    isValidating.value = false;
    isCancelled.value = true;
  }, [asyncFramework]);

  // Retry validation
  const retry = useCallback(() => {
    if (canRetry.value && value.value !== undefined) {
      error.value = undefined;
      validate(value.value);
    }
  }, [canRetry, validate]);

  // Reset field
  const reset = useCallback((newValue?: T) => {
    cancelValidation();
    value.value = newValue || initialValue;
    error.value = undefined;
    isTouched.value = false;
    retryAttempts.value = 0;
    isCancelled.value = false;
    isTimedOut.value = false;
    validationDuration.value = 0;
  }, [initialValue, cancelValidation]);

  return {
    // State
    value: value.value,
    error: error.value,
    isValidating: isValidating.value,
    isTouched: isTouched.value,
    hasError: hasError.value,
    isValid: isValid.value,
    retryAttempts: retryAttempts.value,
    canRetry: canRetry.value,
    isCancelled: isCancelled.value,
    isTimedOut: isTimedOut.value,
    validationDuration: validationDuration.value,

    // Operations
    setValue,
    cancelValidation,
    retry,
    reset,
    touch: () => { isTouched.value = true; },
    clearError: () => { error.value = undefined; },
  };
}