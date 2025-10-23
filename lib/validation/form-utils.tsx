// ============================================================================
// Form Integration Utilities - Helper functions for Fresh form patterns
// SimplyCaster Centralized Form Validation System
// ============================================================================

/** @jsx h */
/** @jsxFrag Fragment */
import { h, Fragment } from "preact";
import type { JSX } from "preact";
import type { Signal } from "@preact/signals";
import type {
  ValidationError,
  ValidationSchema,
  SerializableValidator,
} from "./types.ts";

// ============================================================================
// Form Component Integration Types
// ============================================================================

/**
 * Props for form field components with validation
 */
export interface ValidatedFieldProps {
  /** Field name */
  name: string;
  /** Current field value */
  value?: any;
  /** Field error message */
  error?: string;
  /** Whether field is currently being validated */
  isValidating?: boolean;
  /** Whether field has been touched/interacted with */
  isTouched?: boolean;
  /** Whether field is required */
  required?: boolean;
  /** Field change handler */
  onChange?: (value: any) => void;
  /** Field blur handler */
  onBlur?: () => void;
  /** Field focus handler */
  onFocus?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
}

/**
 * Props for form components with validation
 */
export interface ValidatedFormProps {
  /** Form submission handler */
  onSubmit?: (data: any) => Promise<void> | void;
  /** Whether form is currently submitting */
  isSubmitting?: boolean;
  /** Whether form is valid */
  isValid?: boolean;
  /** Form-level errors */
  errors?: Record<string, ValidationError[]>;
  /** Additional CSS classes */
  className?: string;
  /** Form children */
  children?: JSX.Element | JSX.Element[];
}

// ============================================================================
// Field Binding Utilities
// ============================================================================

/**
 * Create field props for binding validation state to form components
 */
export function createFieldProps(
  name: string,
  formState: {
    getFieldValue: (name: string) => any;
    getFieldError: (name: string) => string | undefined;
    hasFieldError: (name: string) => boolean;
    isFieldTouched: (name: string) => boolean;
    setFieldValue: (name: string, value: any) => void;
    touchField: (name: string) => void;
  },
  options?: {
    required?: boolean;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
  }
): ValidatedFieldProps {
  return {
    name,
    value: formState.getFieldValue(name),
    error: formState.getFieldError(name),
    isTouched: formState.isFieldTouched(name),
    required: options?.required,
    disabled: options?.disabled,
    placeholder: options?.placeholder,
    className: options?.className,
    onChange: (value: any) => formState.setFieldValue(name, value),
    onBlur: () => formState.touchField(name),
  };
}

/**
 * Create form props for binding validation state to form components
 */
export function createFormProps(
  formState: {
    submitForm: (onSubmit: (data: any) => Promise<void> | void) => Promise<boolean>;
    isSubmitting: boolean;
    isValid: boolean;
    errors: Record<string, ValidationError[]>;
  },
  onSubmit: (data: any) => Promise<void> | void,
  options?: {
    className?: string;
  }
): ValidatedFormProps {
  return {
    onSubmit,
    isSubmitting: formState.isSubmitting,
    isValid: formState.isValid,
    errors: formState.errors,
    className: options?.className,
  };
}

// ============================================================================
// Fresh Form Integration
// ============================================================================

/**
 * Extract form data from Fresh FormData for validation
 */
export function extractFormData(formData: FormData): Record<string, any> {
  const data: Record<string, any> = {};
  
  for (const [key, value] of formData.entries()) {
    if (key.endsWith('[]')) {
      // Handle array fields
      const arrayKey = key.slice(0, -2);
      if (!data[arrayKey]) {
        data[arrayKey] = [];
      }
      data[arrayKey].push(value);
    } else if (data[key]) {
      // Handle multiple values for same key
      if (Array.isArray(data[key])) {
        data[key].push(value);
      } else {
        data[key] = [data[key], value];
      }
    } else {
      data[key] = value;
    }
  }
  
  return data;
}

/**
 * Convert validation errors to Fresh-compatible error format
 */
export function formatErrorsForFresh(
  errors: ValidationError[]
): Record<string, string[]> {
  const formattedErrors: Record<string, string[]> = {};
  
  for (const error of errors) {
    if (!formattedErrors[error.field]) {
      formattedErrors[error.field] = [];
    }
    formattedErrors[error.field].push(error.message);
  }
  
  return formattedErrors;
}

/**
 * Create server-side validation handler for Fresh routes
 */
export function createValidationHandler<T>(
  schema: ValidationSchema<T>,
  validationEngine: any
) {
  return async (formData: FormData): Promise<{
    success: boolean;
    data?: T;
    errors?: Record<string, string[]>;
  }> => {
    try {
      const data = extractFormData(formData);
      const result = await validationEngine.validateForm(data, schema);
      
      if (result.success) {
        return {
          success: true,
          data: result.data,
        };
      } else {
        return {
          success: false,
          errors: formatErrorsForFresh(result.errors),
        };
      }
    } catch (error) {
      console.error('Server validation failed:', error);
      return {
        success: false,
        errors: {
          '': ['Validation failed. Please try again.']
        }
      };
    }
  };
}

// ============================================================================
// Accessibility Helpers
// ============================================================================

/**
 * Generate accessibility attributes for form fields
 */
export function createAccessibilityProps(
  fieldName: string,
  error?: string,
  required?: boolean,
  describedBy?: string
): Record<string, any> {
  const props: Record<string, any> = {
    id: fieldName,
    name: fieldName,
  };

  if (required) {
    props['aria-required'] = 'true';
    props.required = true;
  }

  if (error) {
    props['aria-invalid'] = 'true';
    props['aria-describedby'] = `${fieldName}-error`;
  }

  if (describedBy) {
    props['aria-describedby'] = props['aria-describedby'] 
      ? `${props['aria-describedby']} ${describedBy}`
      : describedBy;
  }

  return props;
}

/**
 * Generate error message element with proper accessibility
 */
export function createErrorElement(
  fieldName: string,
  error?: string,
  className?: string
): JSX.Element | null {
  if (!error) return null;

  return (
    <div
      id={`${fieldName}-error`}
      className={className || "text-red-600 text-sm mt-1"}
      role="alert"
      aria-live="polite"
    >
      {error}
    </div>
  );
}

/**
 * Generate field description element with proper accessibility
 */
export function createDescriptionElement(
  fieldName: string,
  description: string,
  className?: string
): JSX.Element {
  return (
    <div
      id={`${fieldName}-description`}
      className={className || "text-gray-600 text-sm mt-1"}
    >
      {description}
    </div>
  );
}

// ============================================================================
// Validation State Binding
// ============================================================================

/**
 * Bind validation state to Preact signals for reactive updates
 */
export function bindValidationToSignals<T>(
  formValidation: {
    data: T;
    errors: Record<string, ValidationError[]>;
    isValidating: boolean;
    isSubmitting: boolean;
    isValid: boolean;
    fieldErrors: Record<string, string | undefined>;
  }
) {
  return {
    data: formValidation.data,
    errors: formValidation.errors,
    isValidating: formValidation.isValidating,
    isSubmitting: formValidation.isSubmitting,
    isValid: formValidation.isValid,
    fieldErrors: formValidation.fieldErrors,
  };
}

/**
 * Create field validation binding for individual fields
 */
export function createFieldBinding(
  fieldName: string,
  validators: SerializableValidator[],
  formState?: {
    setFieldValue: (name: string, value: any) => void;
    getFieldValue: (name: string) => any;
    getFieldError: (name: string) => string | undefined;
    touchField: (name: string) => void;
  }
) {
  if (formState) {
    // Use form-level validation
    return {
      value: formState.getFieldValue(fieldName),
      error: formState.getFieldError(fieldName),
      onChange: (value: any) => formState.setFieldValue(fieldName, value),
      onBlur: () => formState.touchField(fieldName),
    };
  }

  // Return standalone field validation setup
  return {
    validators,
    fieldName,
  };
}

// ============================================================================
// Form Component Helpers
// ============================================================================

/**
 * Create a validated input component wrapper
 */
export function createValidatedInput(
  type: string = 'text'
): (props: ValidatedFieldProps & JSX.HTMLAttributes<HTMLInputElement>) => JSX.Element {
  return function ValidatedInput(props) {
    const {
      name,
      value,
      error,
      isValidating,
      isTouched,
      required,
      onChange,
      onBlur,
      onFocus,
      className,
      disabled,
      placeholder,
      ...inputProps
    } = props;

    const baseClassName = "w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500";
    const errorClassName = error ? "border-red-500 focus:ring-red-500" : "border-gray-300";
    const finalClassName = `${baseClassName} ${errorClassName} ${className || ''}`.trim();

    const accessibilityProps = createAccessibilityProps(name, error, required);

    return (
      <div className="space-y-1">
        <input
          {...inputProps}
          {...accessibilityProps}
          type={type}
          value={value || ''}
          className={finalClassName}
          disabled={disabled || isValidating}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.currentTarget.value)}
          onBlur={() => onBlur?.()}
          onFocus={() => onFocus?.()}
        />
        {isValidating && (
          <div className="text-blue-600 text-sm">
            Validating...
          </div>
        )}
        {createErrorElement(name, error)}
      </div>
    );
  };
}

/**
 * Create a validated textarea component wrapper
 */
export function createValidatedTextarea(): (
  props: ValidatedFieldProps & JSX.HTMLAttributes<HTMLTextAreaElement>
) => JSX.Element {
  return function ValidatedTextarea(props) {
    const {
      name,
      value,
      error,
      isValidating,
      isTouched,
      required,
      onChange,
      onBlur,
      onFocus,
      className,
      disabled,
      placeholder,
      ...textareaProps
    } = props;

    const baseClassName = "w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500";
    const errorClassName = error ? "border-red-500 focus:ring-red-500" : "border-gray-300";
    const finalClassName = `${baseClassName} ${errorClassName} ${className || ''}`.trim();

    const accessibilityProps = createAccessibilityProps(name, error, required);

    return (
      <div className="space-y-1">
        <textarea
          {...textareaProps}
          {...accessibilityProps}
          value={value || ''}
          className={finalClassName}
          disabled={disabled || isValidating}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.currentTarget.value)}
          onBlur={() => onBlur?.()}
          onFocus={() => onFocus?.()}
        />
        {isValidating && (
          <div className="text-blue-600 text-sm">
            Validating...
          </div>
        )}
        {createErrorElement(name, error)}
      </div>
    );
  };
}

/**
 * Create a validated select component wrapper
 */
export function createValidatedSelect(): (
  props: ValidatedFieldProps & JSX.HTMLAttributes<HTMLSelectElement> & {
    options: Array<{ value: string; label: string; disabled?: boolean }>;
  }
) => JSX.Element {
  return function ValidatedSelect(props) {
    const {
      name,
      value,
      error,
      isValidating,
      isTouched,
      required,
      onChange,
      onBlur,
      onFocus,
      className,
      disabled,
      options,
      ...selectProps
    } = props;

    const baseClassName = "w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500";
    const errorClassName = error ? "border-red-500 focus:ring-red-500" : "border-gray-300";
    const finalClassName = `${baseClassName} ${errorClassName} ${className || ''}`.trim();

    const accessibilityProps = createAccessibilityProps(name, error, required);

    return (
      <div className="space-y-1">
        <select
          {...selectProps}
          {...accessibilityProps}
          value={value || ''}
          className={finalClassName}
          disabled={disabled || isValidating}
          onChange={(e) => onChange?.(e.currentTarget.value)}
          onBlur={() => onBlur?.()}
          onFocus={() => onFocus?.()}
        >
          {!required && (
            <option value="">Select an option...</option>
          )}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
        {isValidating && (
          <div className="text-blue-600 text-sm">
            Validating...
          </div>
        )}
        {createErrorElement(name, error)}
      </div>
    );
  };
}

// ============================================================================
// Export Convenience Components
// ============================================================================

export const ValidatedTextInput = createValidatedInput('text');
export const ValidatedEmailInput = createValidatedInput('email');
export const ValidatedPasswordInput = createValidatedInput('password');
export const ValidatedNumberInput = createValidatedInput('number');
export const ValidatedTextarea = createValidatedTextarea();
export const ValidatedSelect = createValidatedSelect();