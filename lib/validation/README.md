# SimplyCaster Validation System

A comprehensive, type-safe, serializable form validation system integrated with the copy manager for consistent error messaging across client and server.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [Built-in Validators](#built-in-validators)
- [Schema Definition](#schema-definition)
- [Client-Side Integration](#client-side-integration)
- [Server-Side Integration](#server-side-integration)
- [Async Validation](#async-validation)
- [Custom Validators](#custom-validators)
- [Error Handling](#error-handling)
- [Testing](#testing)
- [Migration Guide](#migration-guide)
- [API Reference](#api-reference)

## Overview

The validation system provides:

- **Type-safe validation schemas** with full TypeScript support and inference
- **Serializable validation rules** for seamless client-server communication
- **Copy manager integration** for consistent, localizable error messages
- **Field-level and form-level validation** with cross-field dependencies
- **Async validation support** for external data validation (uniqueness checks, etc.)
- **Extensible validator registry** for custom validation logic
- **Client-side Preact hooks** for reactive form validation with debouncing
- **Form component integration** utilities with accessibility support
- **Server-side validation middleware** for Fresh routes with automatic error handling
- **API endpoint validation utilities** with file upload and multipart data support
- **Input sanitization** to prevent XSS and injection attacks
- **Real-time validation feedback** with loading states and error recovery

## Quick Start

### Basic Form Validation

```typescript
import { 
  ValidationEngine, 
  SchemaBuilder,
  useFormValidation 
} from "./lib/validation/index.ts";

// 1. Define validation schema using SchemaBuilder
const loginSchema = SchemaBuilder.create<{
  email: string;
  password: string;
}>()
  .field('email', [
    { type: 'required' },
    { type: 'email' }
  ], { required: true })
  .field('password', [
    { type: 'required' },
    { type: 'minLength', params: { min: 8 } }
  ], { required: true })
  .options({ debounceMs: 300 })
  .build();

// 2. Use in Preact component
function LoginForm() {
  const form = useFormValidation(loginSchema, {
    email: '',
    password: ''
  });

  const handleSubmit = async (data: { email: string; password: string }) => {
    // Handle successful validation
    console.log('Login data:', data);
  };

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      form.submitForm(handleSubmit);
    }}>
      <input
        type="email"
        value={form.getFieldValue('email')}
        onChange={(e) => form.setFieldValue('email', e.target.value)}
        onBlur={() => form.touchField('email')}
        aria-invalid={form.hasFieldError('email')}
        aria-describedby={form.hasFieldError('email') ? 'email-error' : undefined}
      />
      {form.hasFieldError('email') && (
        <div id="email-error" role="alert" className="error">
          {form.getFieldError('email')}
        </div>
      )}
      
      <input
        type="password"
        value={form.getFieldValue('password')}
        onChange={(e) => form.setFieldValue('password', e.target.value)}
        onBlur={() => form.touchField('password')}
        aria-invalid={form.hasFieldError('password')}
        aria-describedby={form.hasFieldError('password') ? 'password-error' : undefined}
      />
      {form.hasFieldError('password') && (
        <div id="password-error" role="alert" className="error">
          {form.getFieldError('password')}
        </div>
      )}
      
      <button 
        type="submit" 
        disabled={!form.isValid || form.isSubmitting}
        aria-describedby="submit-status"
      >
        {form.isSubmitting ? 'Signing in...' : 'Sign In'}
      </button>
      
      {form.isSubmitting && (
        <div id="submit-status" aria-live="polite">
          Validating credentials...
        </div>
      )}
    </form>
  );
}
```

### Server-Side Validation

```typescript
import { validateJSON } from "./lib/validation/index.ts";
import { loginSchema } from "./lib/validation/schemas.ts";

// Fresh route handler with validation middleware
export const handler = define.handlers({
  POST: validateJSON(loginSchema)(
    async (req: ValidatedRequest<LoginData>) => {
      // Access validated and sanitized data
      const { email, password } = req.validatedData;
      
      // Perform authentication
      const user = await authenticateUser(email, password);
      
      return createAPISuccessResponse({ user });
    }
  )
});
```

## Core Concepts

### ValidationEngine

The main orchestrator for validation operations. Handles both synchronous and asynchronous validation with proper error aggregation and copy manager integration.

**Key Methods:**
- `validateField<T>(value, schema, context)` - Validate a single field with context
- `validateForm<T>(data, schema, context?)` - Validate entire form with cross-field validation
- `validateFromSchema<T>(data, serializedSchema)` - Validate from JSON-serialized schema

**Features:**
- Automatic error message localization via copy manager
- Support for validation context (form data, field dependencies)
- Async validation with proper loading states
- Schema serialization for client-server communication

### ValidatorRegistry

Centralized registry for all validation functions. Supports both synchronous and asynchronous validators with automatic type checking.

**Key Methods:**
- `register(type, validator)` - Register synchronous validators
- `registerAsync(type, validator)` - Register asynchronous validators  
- `get(type)` - Retrieve validator by type
- `isAsync(type)` - Check if validator requires async execution
- `registerBuiltInValidators()` - Register all built-in validators

### SchemaBuilder

Fluent API for building type-safe validation schemas with full TypeScript inference.

```typescript
const schema = SchemaBuilder.create<UserData>()
  .field('email', [{ type: 'required' }, { type: 'email' }], { required: true })
  .field('password', [{ type: 'minLength', params: { min: 8 } }])
  .formValidator({ type: 'passwordsMatch', params: { fields: ['password', 'confirmPassword'] } })
  .options({ debounceMs: 300, abortEarly: false })
  .build();
```

### Core Types

**ValidationResult<T>**
```typescript
interface ValidationResult<T = any> {
  success: boolean;
  data?: T;
  errors: ValidationError[];
  warnings?: ValidationWarning[];
}
```

**ValidationError**
```typescript
interface ValidationError {
  field: string;        // Field path (e.g., 'email', 'user.profile.name')
  code: string;         // Error code for copy manager lookup
  message: string;      // Localized error message
  params?: Record<string, any>; // Parameters for message interpolation
}
```

**ValidationSchema<T>**
```typescript
interface ValidationSchema<T = any> {
  fields: Record<keyof T, FieldValidationSchema>;
  formValidators?: SerializableValidator[];  // Cross-field validation
  options?: ValidationOptions;
}
```

**ValidationContext**
```typescript
interface ValidationContext {
  formData: Record<string, any>;  // Complete form data for cross-field validation
  fieldPath: string;              // Current field being validated
  isSubmitting: boolean;          // Whether form is being submitted
  copyManager: CopyManager;       // For error message localization
}
```

## Built-in Validators

The validation system includes comprehensive built-in validators for common use cases:

### Basic Field Validators

#### `required`
Validates that a field has a non-empty value.

```typescript
{ type: 'required' }
```

**Validates:** `null`, `undefined`, empty strings, empty arrays
**Copy key:** `validation.required`
**Example:** "This field is required"

#### `email`
Validates email address format using RFC-compliant regex.

```typescript
{ type: 'email' }
```

**Copy key:** `validation.email`
**Example:** "Please enter a valid email address"

#### `minLength` / `maxLength`
Validates string length constraints.

```typescript
{ type: 'minLength', params: { min: 8 } }
{ type: 'maxLength', params: { max: 255 } }
```

**Parameters:**
- `min: number` - Minimum length
- `max: number` - Maximum length

**Copy keys:** `validation.minLength`, `validation.maxLength`
**Examples:** 
- "Must be at least {{min}} characters"
- "Must be less than {{max}} characters"

#### `min` / `max`
Validates numeric range constraints.

```typescript
{ type: 'min', params: { min: 0 } }
{ type: 'max', params: { max: 100 } }
```

**Parameters:**
- `min: number` - Minimum value
- `max: number` - Maximum value

**Copy keys:** `validation.min`, `validation.max`

#### `pattern`
Validates against a regular expression pattern.

```typescript
{ type: 'pattern', params: { pattern: '^[a-zA-Z0-9-]+$', flags: 'i' } }
```

**Parameters:**
- `pattern: string` - Regular expression pattern
- `flags?: string` - Regex flags (optional)

**Copy key:** `validation.pattern`

### File Validators

#### `fileSize`
Validates file size limits.

```typescript
{ type: 'fileSize', params: { max: 10485760 } } // 10MB
```

**Parameters:**
- `max: number` - Maximum size in bytes

**Copy key:** `validation.fileSize`
**Example:** "File size must be less than {{max}}"

#### `fileType`
Validates file MIME types.

```typescript
{ type: 'fileType', params: { types: ['image/jpeg', 'image/png'] } }
{ type: 'fileType', params: { types: ['audio/mpeg', 'audio/ogg', 'audio/webm'] } }
```

**Parameters:**
- `types: string[]` - Array of allowed MIME types

**Copy key:** `validation.fileType`
**Example:** "Invalid file type. Please select {{types}}"

### Password Validators

#### `password`
Validates password complexity with configurable requirements.

```typescript
{ 
  type: 'password', 
  params: { 
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSymbols: false
  } 
}
```

**Parameters:**
- `minLength?: number` - Minimum length (default: 8)
- `requireUppercase?: boolean` - Require uppercase letters
- `requireLowercase?: boolean` - Require lowercase letters  
- `requireNumbers?: boolean` - Require numeric characters
- `requireSymbols?: boolean` - Require special symbols

**Copy key:** `validation.passwordComplexity`

#### `matchField`
Validates that a field matches another field (e.g., password confirmation).

```typescript
{ type: 'matchField', params: { field: 'password' } }
```

**Parameters:**
- `field: string` - Name of field to match against

**Copy key:** `validation.passwordsMatch`
**Example:** "Passwords must match"

### Async Validators

#### `uniqueEmail`
Validates email uniqueness against the database.

```typescript
{ type: 'uniqueEmail', async: true }
```

**Copy key:** `validation.emailTaken`
**Example:** "This email address is already in use"

#### `uniqueSlug`
Validates slug uniqueness for rooms, episodes, etc.

```typescript
{ type: 'uniqueSlug', params: { entityType: 'room' }, async: true }
```

**Parameters:**
- `entityType: string` - Type of entity ('room', 'episode', etc.)

**Copy key:** `validation.slugTaken`

### Form-Level Validators

#### `passwordsMatch`
Cross-field validator ensuring password fields match.

```typescript
// In schema formValidators array
{ 
  type: 'passwordsMatch', 
  params: { 
    fields: ['password', 'confirmPassword'] 
  } 
}
```

**Parameters:**
- `fields: string[]` - Array of field names to compare

## Schema Definition

### Using SchemaBuilder (Recommended)

```typescript
import { SchemaBuilder } from "./lib/validation/index.ts";

// User registration with complex validation
const userRegistrationSchema = SchemaBuilder.create<{
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  profileImage?: File;
}>()
  .field('email', [
    { type: 'required' },
    { type: 'email' },
    { type: 'uniqueEmail', async: true }
  ], { required: true })
  .field('password', [
    { type: 'required' },
    { type: 'password', params: { 
      minLength: 8,
      requireUppercase: true,
      requireNumbers: true 
    }}
  ], { required: true })
  .field('confirmPassword', [
    { type: 'required' },
    { type: 'matchField', params: { field: 'password' } }
  ], { required: true, dependsOn: ['password'] })
  .field('fullName', [
    { type: 'required' },
    { type: 'minLength', params: { min: 2 } },
    { type: 'maxLength', params: { max: 50 } }
  ], { required: true })
  .field('profileImage', [
    { type: 'fileSize', params: { max: 5242880 } }, // 5MB
    { type: 'fileType', params: { types: ['image/jpeg', 'image/png'] } }
  ])
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
```

### Manual Schema Definition

```typescript
import { ValidationSchema } from "./lib/validation/index.ts";

const episodeUploadSchema: ValidationSchema<EpisodeData> = {
  fields: {
    title: {
      validators: [
        { type: 'required' },
        { type: 'minLength', params: { min: 1 } },
        { type: 'maxLength', params: { max: 255 } }
      ],
      required: true
    },
    description: {
      validators: [
        { type: 'maxLength', params: { max: 1000 } }
      ]
    },
    audioFile: {
      validators: [
        { type: 'required' },
        { type: 'fileType', params: { 
          types: ['audio/mpeg', 'audio/ogg', 'audio/webm'] 
        }},
        { type: 'fileSize', params: { max: 104857600 } } // 100MB
      ],
      required: true
    },
    episodeNumber: {
      validators: [
        { type: 'min', params: { min: 1 } },
        { type: 'max', params: { max: 9999 } }
      ]
    }
  },
  options: {
    debounceMs: 500,
    stripUnknown: true
  }
};
```

### Schema Serialization

Schemas can be serialized for client-server communication:

```typescript
// Serialize schema to JSON
const serialized = SchemaBuilder.serialize(schema);

// Send to client
const response = {
  validationSchema: serialized,
  formData: initialData
};

// Deserialize on client
const clientSchema = SchemaBuilder.deserialize<UserData>(serialized);
```

## Integration with Copy Manager

Error messages are automatically retrieved from the copy manager with support for parameter interpolation:

### Copy Configuration

```json
{
  "validation": {
    "required": "This field is required",
    "email": "Please enter a valid email address",
    "minLength": "Must be at least {{min}} characters",
    "maxLength": "Must be less than {{max}} characters",
    "passwordComplexity": "Password must contain uppercase, lowercase, and numbers",
    "passwordsMatch": "Passwords must match",
    "fileSize": "File size must be less than {{max}}",
    "fileType": "Invalid file type. Please select {{types}}",
    "uniqueEmail": "This email address is already in use",
    "uniqueSlug": "This name is already taken",
    "min": "Must be at least {{min}}",
    "max": "Must be no more than {{max}}",
    "pattern": "Invalid format",
    "custom": {
      "passwordWeak": "Password is too weak. Try adding more characters or symbols",
      "fileCorrupted": "The uploaded file appears to be corrupted",
      "networkError": "Unable to validate. Please check your connection and try again"
    }
  }
}
```

### Message Interpolation

Parameters from validators are automatically interpolated into error messages:

```typescript
// Validator with parameters
{ type: 'minLength', params: { min: 8 } }

// Copy template
"Must be at least {{min}} characters"

// Final message
"Must be at least 8 characters"
```

### Fallback Messages

If a copy key is not found, the system provides sensible fallback messages:

```typescript
const error = {
  field: 'email',
  code: 'email',
  message: context?.copyManager.getCopy('validation.email') || 'Please enter a valid email address'
};
```

## Client-Side Integration

### useFormValidation Hook

The primary hook for managing form validation state with automatic debouncing, error handling, and accessibility support.

```typescript
import { useFormValidation } from "./lib/validation/index.ts";
import { userRegistrationSchema } from "./lib/validation/schemas.ts";

function RegistrationForm() {
  const form = useFormValidation(userRegistrationSchema, {
    email: '',
    password: '',
    confirmPassword: '',
    fullName: ''
  });

  const handleSubmit = async (data: UserRegistrationData) => {
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        // Handle success
        console.log('Registration successful');
      } else {
        // Handle server errors
        const errors = await response.json();
        form.setServerErrors(errors);
      }
    } catch (error) {
      form.setSubmissionError('Network error. Please try again.');
    }
  };

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      form.submitForm(handleSubmit);
    }}>
      {/* Email field with async validation */}
      <div className="field-group">
        <label htmlFor="email">Email Address *</label>
        <input
          id="email"
          type="email"
          value={form.getFieldValue('email')}
          onChange={(e) => form.setFieldValue('email', e.target.value)}
          onBlur={() => form.touchField('email')}
          aria-invalid={form.hasFieldError('email')}
          aria-describedby={form.hasFieldError('email') ? 'email-error' : 'email-help'}
          disabled={form.isFieldValidating('email')}
        />
        <div id="email-help" className="field-help">
          We'll check if this email is available
        </div>
        {form.isFieldValidating('email') && (
          <div className="validation-loading" aria-live="polite">
            Checking email availability...
          </div>
        )}
        {form.hasFieldError('email') && (
          <div id="email-error" role="alert" className="field-error">
            {form.getFieldError('email')}
          </div>
        )}
      </div>

      {/* Password field with strength indicator */}
      <div className="field-group">
        <label htmlFor="password">Password *</label>
        <input
          id="password"
          type="password"
          value={form.getFieldValue('password')}
          onChange={(e) => form.setFieldValue('password', e.target.value)}
          onBlur={() => form.touchField('password')}
          aria-invalid={form.hasFieldError('password')}
          aria-describedby="password-requirements password-error"
        />
        <div id="password-requirements" className="field-help">
          Must be at least 8 characters with uppercase, lowercase, and numbers
        </div>
        {form.hasFieldError('password') && (
          <div id="password-error" role="alert" className="field-error">
            {form.getFieldError('password')}
          </div>
        )}
      </div>

      {/* Confirm password with dependency */}
      <div className="field-group">
        <label htmlFor="confirmPassword">Confirm Password *</label>
        <input
          id="confirmPassword"
          type="password"
          value={form.getFieldValue('confirmPassword')}
          onChange={(e) => form.setFieldValue('confirmPassword', e.target.value)}
          onBlur={() => form.touchField('confirmPassword')}
          aria-invalid={form.hasFieldError('confirmPassword')}
          aria-describedby={form.hasFieldError('confirmPassword') ? 'confirm-password-error' : undefined}
          disabled={!form.getFieldValue('password')} // Disabled until password is entered
        />
        {form.hasFieldError('confirmPassword') && (
          <div id="confirm-password-error" role="alert" className="field-error">
            {form.getFieldError('confirmPassword')}
          </div>
        )}
      </div>

      {/* Submit button with loading state */}
      <button 
        type="submit" 
        disabled={!form.isValid || form.isSubmitting}
        aria-describedby="submit-status"
        className={`submit-button ${form.isSubmitting ? 'loading' : ''}`}
      >
        {form.isSubmitting ? (
          <>
            <span className="spinner" aria-hidden="true"></span>
            Creating Account...
          </>
        ) : (
          'Create Account'
        )}
      </button>
      
      {/* Form-level error display */}
      {form.hasSubmissionError() && (
        <div role="alert" className="form-error">
          {form.getSubmissionError()}
        </div>
      )}
      
      {/* Validation status for screen readers */}
      {form.isSubmitting && (
        <div id="submit-status" aria-live="polite" className="sr-only">
          Validating and creating your account...
        </div>
      )}
    </form>
  );
}
```

### useFieldValidation Hook

For single field validation scenarios or custom form implementations:

```typescript
import { useFieldValidation } from "./lib/validation/index.ts";

function EmailInput({ onValidEmail }: { onValidEmail: (email: string) => void }) {
  const emailField = useFieldValidation([
    { type: 'required' },
    { type: 'email' },
    { type: 'uniqueEmail', async: true }
  ], '');

  const handleChange = (value: string) => {
    emailField.setValue(value);
    
    // Notify parent when email is valid
    if (!emailField.hasError && !emailField.isValidating && value) {
      onValidEmail(value);
    }
  };

  return (
    <div className="field-group">
      <label htmlFor="email">Email Address</label>
      <input
        id="email"
        type="email"
        value={emailField.value || ''}
        onChange={(e) => handleChange(e.target.value)}
        aria-invalid={emailField.hasError}
        aria-describedby={emailField.hasError ? 'email-error' : undefined}
      />
      {emailField.isValidating && (
        <div className="validation-loading">Checking availability...</div>
      )}
      {emailField.hasError && (
        <div id="email-error" role="alert" className="field-error">
          {emailField.error}
        </div>
      )}
    </div>
  );
}
```

### Form Component Integration Utilities

Pre-built components for common form patterns:

```typescript
import { 
  ValidatedTextInput, 
  ValidatedEmailInput, 
  ValidatedPasswordInput,
  ValidatedFileInput,
  ValidatedTextarea
} from "./lib/validation/form-utils.tsx";

function UserProfileForm() {
  const form = useFormValidation(profileSchema);

  return (
    <form onSubmit={form.handleSubmit(handleSave)}>
      <ValidatedEmailInput
        name="email"
        label="Email Address"
        required
        form={form}
        helpText="We'll send important updates to this email"
      />
      
      <ValidatedPasswordInput
        name="currentPassword"
        label="Current Password"
        required
        form={form}
        showStrengthIndicator={false}
      />
      
      <ValidatedPasswordInput
        name="newPassword"
        label="New Password"
        form={form}
        showStrengthIndicator={true}
        confirmField="confirmNewPassword"
      />
      
      <ValidatedFileInput
        name="profileImage"
        label="Profile Image"
        form={form}
        accept="image/*"
        maxSize={5242880} // 5MB
        preview={true}
      />
      
      <ValidatedTextarea
        name="bio"
        label="Bio"
        form={form}
        maxLength={500}
        showCharacterCount={true}
      />
      
      <button type="submit" disabled={!form.isValid}>
        Save Profile
      </button>
    </form>
  );
}
```

### Real-time Validation Features

#### Debounced Validation
Validation is automatically debounced to prevent excessive API calls:

```typescript
const form = useFormValidation(schema, initialData, {
  debounceMs: 300, // Wait 300ms after user stops typing
  validateOnChange: true,
  validateOnBlur: true
});
```

#### Loading States
Built-in loading states for async validation:

```typescript
// Check if specific field is validating
const isEmailValidating = form.isFieldValidating('email');

// Check if any field is validating
const isAnyFieldValidating = form.isValidating;

// Check if form submission is in progress
const isSubmitting = form.isSubmitting;
```

#### Error Recovery
Automatic error clearing and recovery:

```typescript
// Errors are automatically cleared when field becomes valid
form.setFieldValue('email', 'valid@example.com'); // Clears previous email errors

// Manual error clearing
form.clearFieldError('email');
form.clearAllErrors();

// Server error integration
form.setServerErrors({
  email: 'This email is already registered',
  password: 'Password does not meet requirements'
});
```

### Accessibility Features

The validation system includes comprehensive accessibility support:

#### ARIA Attributes
- `aria-invalid` on invalid fields
- `aria-describedby` linking to error messages
- `role="alert"` on error messages for screen reader announcements

#### Screen Reader Support
- `aria-live="polite"` for validation status updates
- Descriptive error messages with context
- Loading state announcements

#### Keyboard Navigation
- Proper focus management during validation
- Error message association with form controls
- Submit button state management

```typescript
// Accessibility-focused form implementation
function AccessibleForm() {
  const form = useFormValidation(schema);

  return (
    <form 
      onSubmit={form.handleSubmit(handleSubmit)}
      noValidate // Use custom validation instead of browser validation
      aria-label="User registration form"
    >
      <fieldset>
        <legend>Account Information</legend>
        
        <div className="field-group">
          <label htmlFor="email" className="required">
            Email Address
            <span aria-label="required" className="required-indicator">*</span>
          </label>
          <input
            id="email"
            type="email"
            value={form.getFieldValue('email')}
            onChange={(e) => form.setFieldValue('email', e.target.value)}
            onBlur={() => form.touchField('email')}
            aria-invalid={form.hasFieldError('email')}
            aria-describedby="email-help email-error"
            aria-required="true"
          />
          <div id="email-help" className="field-help">
            Enter a valid email address for account verification
          </div>
          {form.hasFieldError('email') && (
            <div id="email-error" role="alert" className="field-error">
              <span className="error-icon" aria-hidden="true">⚠</span>
              {form.getFieldError('email')}
            </div>
          )}
        </div>
      </fieldset>
      
      <div className="form-actions">
        <button 
          type="submit" 
          disabled={!form.isValid || form.isSubmitting}
          aria-describedby="submit-help"
        >
          {form.isSubmitting ? 'Creating Account...' : 'Create Account'}
        </button>
        <div id="submit-help" className="field-help">
          {!form.isValid && 'Please fix the errors above before submitting'}
        </div>
      </div>
    </form>
  );
}
```

## Server-Side Integration

### Validation Middleware for Fresh Routes

The validation system provides middleware for automatic request validation with consistent error handling:

#### JSON Request Validation

```typescript
import { validateJSON } from "./lib/validation/server-middleware.ts";
import { userRegistrationSchema } from "./lib/validation/schemas.ts";
import { define } from "$fresh/server.ts";

// User registration endpoint
export const handler = define.handlers({
  POST: validateJSON(userRegistrationSchema, {
    sanitize: true,
    stripUnknown: true,
    abortEarly: false
  })(
    async (req: ValidatedRequest<UserRegistrationData>) => {
      // Access validated and sanitized data
      const { email, password, fullName } = req.validatedData;
      
      try {
        // Create user with validated data
        const user = await createUser({
          email,
          password,
          fullName
        });
        
        return createAPISuccessResponse({ 
          user: { id: user.id, email: user.email, fullName: user.fullName }
        });
      } catch (error) {
        if (error.code === 'DUPLICATE_EMAIL') {
          return createAPIErrorResponse([{
            field: 'email',
            code: 'uniqueEmail',
            message: 'This email address is already in use'
          }]);
        }
        throw error;
      }
    }
  )
});
```

#### Multipart/File Upload Validation

```typescript
import { validateMultipartData } from "./lib/validation/server-middleware.ts";
import { episodeUploadSchema } from "./lib/validation/schemas.ts";

export const handler = define.handlers({
  POST: validateMultipartData(episodeUploadSchema, {
    maxFileSize: 104857600, // 100MB
    allowedMimeTypes: ['audio/mpeg', 'audio/ogg', 'audio/webm'],
    sanitize: true
  })(
    async (req: ValidatedRequest<EpisodeUploadData>) => {
      const { title, description, audioFile, episodeNumber } = req.validatedData;
      
      // Process validated file upload
      const savedFile = await saveAudioFile(audioFile, {
        title,
        description,
        episodeNumber
      });
      
      return createAPISuccessResponse({ episode: savedFile });
    }
  )
});
```

#### Custom Validation Options

```typescript
export const handler = define.handlers({
  POST: validateJSON(schema, {
    // Validation options
    sanitize: true,           // Sanitize input data
    stripUnknown: true,       // Remove unknown fields
    abortEarly: false,        // Collect all errors
    
    // Custom error handling
    onValidationError: (errors) => {
      // Log validation errors
      console.error('Validation failed:', errors);
      
      // Custom error response
      return new Response(JSON.stringify({
        success: false,
        errors: errors.map(err => ({
          field: err.field,
          message: err.message
        }))
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    },
    
    // Custom success handling
    onValidationSuccess: (data) => {
      // Log successful validation
      console.log('Validation passed for:', Object.keys(data));
    }
  })(handlerFunction)
});
```

### Manual API Validation

For more control over validation flow:

```typescript
import { 
  validateAPIRequest, 
  validateFileUploads,
  sanitizeRequestData 
} from "./lib/validation/api-utils.ts";

export const handler = define.handlers({
  POST: async (req) => {
    try {
      // Parse request body
      const requestData = await req.json();
      
      // Validate request data
      const validation = await validateAPIRequest(requestData, userSchema, {
        sanitize: true,
        stripUnknown: true,
        context: {
          userId: req.headers.get('x-user-id'),
          ipAddress: req.headers.get('x-forwarded-for')
        }
      });

      if (!validation.success) {
        return createAPIErrorResponse(validation.errors, 400);
      }

      // Additional file validation if needed
      if (req.headers.get('content-type')?.includes('multipart/form-data')) {
        const formData = await req.formData();
        const fileValidation = await validateFileUploads(formData, {
          profileImage: {
            maxSize: 5242880, // 5MB
            allowedTypes: ['image/jpeg', 'image/png'],
            required: false
          }
        });

        if (!fileValidation.success) {
          return createAPIErrorResponse(fileValidation.errors, 400);
        }
      }

      // Process validated data
      const result = await processUserData(validation.data);
      
      return createAPISuccessResponse(result);
      
    } catch (error) {
      console.error('API error:', error);
      return createAPIErrorResponse([{
        field: 'general',
        code: 'serverError',
        message: 'An unexpected error occurred'
      }], 500);
    }
  }
});
```

### Input Sanitization

Comprehensive input sanitization to prevent security vulnerabilities:

```typescript
import { 
  sanitizeHTML, 
  sanitizeSQL, 
  sanitizeRequestData,
  sanitizeFileName,
  sanitizeURL 
} from "./lib/validation/api-utils.ts";

// Sanitize HTML content (prevent XSS)
const safeHTML = sanitizeHTML(userInput, {
  allowedTags: ['p', 'br', 'strong', 'em'],
  allowedAttributes: {},
  stripUnknown: true
});

// Sanitize SQL input (prevent injection)
const safeSQL = sanitizeSQL(searchQuery);

// Sanitize file names
const safeFileName = sanitizeFileName(uploadedFile.name);

// Sanitize URLs
const safeURL = sanitizeURL(userProvidedURL);

// Sanitize entire request with custom sanitizers
const sanitized = await sanitizeRequestData(requestData, {
  sanitizers: {
    description: (value) => sanitizeHTML(value),
    searchQuery: (value) => sanitizeSQL(value),
    fileName: (value) => sanitizeFileName(value),
    website: (value) => sanitizeURL(value)
  },
  stripUnknown: true,
  maxStringLength: 10000
});
```

### Error Response Formatting

Consistent error response formatting across all endpoints:

```typescript
import { 
  createAPIErrorResponse, 
  createAPISuccessResponse,
  formatValidationErrors 
} from "./lib/validation/api-utils.ts";

// Standard error response
const errorResponse = createAPIErrorResponse([
  {
    field: 'email',
    code: 'email',
    message: 'Please enter a valid email address'
  }
], 400);

// Success response
const successResponse = createAPISuccessResponse({
  user: userData
}, 201);

// Format validation errors for client
const formattedErrors = formatValidationErrors(validationResult.errors, {
  includeFieldPath: true,
  groupByField: true,
  includeErrorCodes: true
});

// Response structure:
{
  "success": false,
  "errors": [
    {
      "field": "email",
      "code": "email",
      "message": "Please enter a valid email address"
    }
  ],
  "timestamp": "2024-01-15T10:30:00Z",
  "requestId": "req_123456"
}
```

### Security Features

#### Rate Limiting Integration

```typescript
import { validateJSON } from "./lib/validation/server-middleware.ts";
import { rateLimitByIP } from "./lib/middleware/rate-limit.ts";

export const handler = define.handlers({
  POST: rateLimitByIP({ 
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5 // 5 attempts per window
  })(
    validateJSON(loginSchema)(
      async (req: ValidatedRequest<LoginData>) => {
        // Handle rate-limited, validated login
      }
    )
  )
});
```

#### CSRF Protection

```typescript
import { validateJSON } from "./lib/validation/server-middleware.ts";
import { csrfProtection } from "./lib/middleware/csrf.ts";

export const handler = define.handlers({
  POST: csrfProtection()(
    validateJSON(formSchema)(
      async (req: ValidatedRequest<FormData>) => {
        // Handle CSRF-protected, validated request
      }
    )
  )
});
```

#### Request Size Limits

```typescript
export const handler = define.handlers({
  POST: validateJSON(schema, {
    maxRequestSize: 1048576, // 1MB
    maxFieldCount: 50,
    maxStringLength: 10000
  })(handlerFunction)
});
```

### Database Integration

Safe database operations with validated data:

```typescript
import { validateJSON } from "./lib/validation/server-middleware.ts";
import { db } from "./database/connection.ts";
import { users } from "./database/schema.ts";

export const handler = define.handlers({
  POST: validateJSON(userUpdateSchema)(
    async (req: ValidatedRequest<UserUpdateData>) => {
      const { id, email, fullName } = req.validatedData;
      
      // Use validated data directly in database operations
      const updatedUser = await db
        .update(users)
        .set({
          email,
          fullName,
          updatedAt: new Date()
        })
        .where(eq(users.id, id))
        .returning();
      
      return createAPISuccessResponse({ user: updatedUser[0] });
    }
  )
});
```

### Testing Server Validation

```typescript
import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { validateAPIRequest } from "./lib/validation/api-utils.ts";
import { userSchema } from "./lib/validation/schemas.ts";

Deno.test("API validation - valid data", async () => {
  const validData = {
    email: "test@example.com",
    password: "SecurePass123",
    fullName: "Test User"
  };
  
  const result = await validateAPIRequest(validData, userSchema);
  
  assertEquals(result.success, true);
  assertEquals(result.data.email, "test@example.com");
});

Deno.test("API validation - invalid data", async () => {
  const invalidData = {
    email: "invalid-email",
    password: "123", // Too short
    fullName: "" // Required but empty
  };
  
  const result = await validateAPIRequest(invalidData, userSchema);
  
  assertEquals(result.success, false);
  assertEquals(result.errors.length, 3);
});
```

## Async Validation

The validation system supports asynchronous validation for scenarios requiring external data validation:

### Built-in Async Validators

```typescript
// Email uniqueness validation
{ type: 'uniqueEmail', async: true }

// Slug uniqueness validation  
{ type: 'uniqueSlug', params: { entityType: 'room' }, async: true }

// Custom async file validation
{ type: 'validateFileContent', async: true }
```

### Creating Custom Async Validators

```typescript
import { FieldValidator, ValidationContext } from "./lib/validation/types.ts";

// Custom async validator for username availability
export const uniqueUsernameValidator: FieldValidator<string> = async (username, context) => {
  if (!username) return { success: true, data: username, errors: [] };

  try {
    const response = await fetch('/api/validate/username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    const result = await response.json();
    
    if (!result.available) {
      return {
        success: false,
        errors: [{
          field: context?.fieldPath || '',
          code: 'usernameTaken',
          message: context?.copyManager.getCopy('validation.usernameTaken') || 
            'This username is already taken'
        }]
      };
    }

    return { success: true, data: username, errors: [] };
  } catch (error) {
    // Handle network errors gracefully
    if (error.name === 'AbortError') {
      return {
        success: false,
        errors: [{
          field: context?.fieldPath || '',
          code: 'validationTimeout',
          message: 'Validation timed out. Please try again.'
        }]
      };
    }

    return {
      success: false,
      errors: [{
        field: context?.fieldPath || '',
        code: 'validationError',
        message: 'Unable to validate username. Please try again.'
      }]
    };
  }
};

// Register the async validator
const registry = new ValidatorRegistry();
registry.registerAsync('uniqueUsername', uniqueUsernameValidator);
```

### Async Validation with Loading States

```typescript
function UsernameInput() {
  const usernameField = useFieldValidation([
    { type: 'required' },
    { type: 'minLength', params: { min: 3 } },
    { type: 'pattern', params: { pattern: '^[a-zA-Z0-9_]+$' } },
    { type: 'uniqueUsername', async: true }
  ], '');

  return (
    <div className="field-group">
      <label htmlFor="username">Username</label>
      <div className="input-with-status">
        <input
          id="username"
          type="text"
          value={usernameField.value || ''}
          onChange={(e) => usernameField.setValue(e.target.value)}
          aria-invalid={usernameField.hasError}
          disabled={usernameField.isValidating}
        />
        {usernameField.isValidating && (
          <div className="validation-spinner" aria-label="Checking availability">
            <span className="spinner"></span>
          </div>
        )}
        {!usernameField.hasError && !usernameField.isValidating && usernameField.value && (
          <div className="validation-success" aria-label="Available">
            ✓
          </div>
        )}
      </div>
      {usernameField.isValidating && (
        <div className="field-help" aria-live="polite">
          Checking username availability...
        </div>
      )}
      {usernameField.hasError && (
        <div role="alert" className="field-error">
          {usernameField.error}
        </div>
      )}
    </div>
  );
}
```

### Async Validation Configuration

```typescript
const schema = SchemaBuilder.create<UserData>()
  .field('username', [
    { type: 'required' },
    { type: 'uniqueUsername', async: true }
  ])
  .options({
    debounceMs: 500,        // Wait 500ms before async validation
    asyncTimeout: 10000,    // 10 second timeout for async validators
    retryAttempts: 2,       // Retry failed async validations
    retryDelay: 1000        // Wait 1 second between retries
  })
  .build();
```

## Custom Validators

Create custom validation logic for specific business requirements:

### Simple Custom Validator

```typescript
import { FieldValidator } from "./lib/validation/types.ts";

// Custom validator for podcast episode numbers
export const episodeNumberValidator = (maxEpisode: number): FieldValidator<number> => 
  (value, context) => {
    if (value === null || value === undefined) {
      return { success: true, data: value, errors: [] };
    }

    if (value < 1 || value > maxEpisode) {
      return {
        success: false,
        errors: [{
          field: context?.fieldPath || '',
          code: 'episodeNumberRange',
          message: context?.copyManager.getCopy('validation.episodeNumberRange', { 
            min: 1, 
            max: maxEpisode 
          }) || `Episode number must be between 1 and ${maxEpisode}`,
          params: { min: 1, max: maxEpisode }
        }]
      };
    }

    return { success: true, data: value, errors: [] };
  };

// Usage in schema
const episodeSchema = SchemaBuilder.create<EpisodeData>()
  .field('episodeNumber', [
    { type: 'required' },
    { type: 'episodeNumber', params: { max: 999 } }
  ])
  .build();
```

### Complex Custom Validator with Dependencies

```typescript
// Custom validator that depends on other fields
export const roomCapacityValidator: FieldValidator<number> = (value, context) => {
  if (!value || !context?.formData) {
    return { success: true, data: value, errors: [] };
  }

  const roomType = context.formData.roomType;
  const isPremium = context.formData.isPremium;

  let maxCapacity = 10; // Default
  
  if (roomType === 'webinar') {
    maxCapacity = isPremium ? 1000 : 100;
  } else if (roomType === 'meeting') {
    maxCapacity = isPremium ? 50 : 10;
  }

  if (value > maxCapacity) {
    return {
      success: false,
      errors: [{
        field: context.fieldPath,
        code: 'roomCapacityExceeded',
        message: `Maximum capacity for ${roomType} rooms is ${maxCapacity}`,
        params: { roomType, maxCapacity, isPremium }
      }]
    };
  }

  return { success: true, data: value, errors: [] };
};
```

### Form-Level Custom Validators

```typescript
// Custom form validator for business logic
export const roomScheduleValidator: FormValidator<RoomData> = (data, context) => {
  const { startTime, endTime, timezone } = data;
  
  if (!startTime || !endTime) {
    return { success: true, data, errors: [] };
  }

  const start = new Date(startTime);
  const end = new Date(endTime);
  const now = new Date();

  const errors: ValidationError[] = [];

  // Check if start time is in the future
  if (start <= now) {
    errors.push({
      field: 'startTime',
      code: 'startTimeInPast',
      message: 'Start time must be in the future'
    });
  }

  // Check if end time is after start time
  if (end <= start) {
    errors.push({
      field: 'endTime',
      code: 'endTimeBeforeStart',
      message: 'End time must be after start time'
    });
  }

  // Check maximum duration (4 hours)
  const duration = end.getTime() - start.getTime();
  const maxDuration = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
  
  if (duration > maxDuration) {
    errors.push({
      field: 'endTime',
      code: 'durationTooLong',
      message: 'Room duration cannot exceed 4 hours'
    });
  }

  return {
    success: errors.length === 0,
    data,
    errors
  };
};

// Usage in schema
const roomSchema = SchemaBuilder.create<RoomData>()
  .field('startTime', [{ type: 'required' }])
  .field('endTime', [{ type: 'required' }])
  .formValidator({ type: 'roomSchedule' })
  .build();
```

## Error Handling

Comprehensive error handling with recovery strategies:

### Error Types and Codes

```typescript
// Standard error codes
export const ValidationErrorCodes = {
  // Field validation
  REQUIRED: 'required',
  EMAIL: 'email',
  MIN_LENGTH: 'minLength',
  MAX_LENGTH: 'maxLength',
  PATTERN: 'pattern',
  
  // File validation
  FILE_SIZE: 'fileSize',
  FILE_TYPE: 'fileType',
  
  // Async validation
  UNIQUE_EMAIL: 'uniqueEmail',
  UNIQUE_SLUG: 'uniqueSlug',
  
  // Network/system errors
  VALIDATION_TIMEOUT: 'validationTimeout',
  VALIDATION_ERROR: 'validationError',
  NETWORK_ERROR: 'networkError',
  
  // Custom business logic
  CUSTOM: 'custom'
} as const;
```

### Error Recovery Strategies

```typescript
// Automatic retry for failed async validations
const retryAsyncValidation = async (
  validator: FieldValidator,
  value: any,
  context: ValidationContext,
  maxRetries = 3
): Promise<ValidationResult> => {
  let lastError: ValidationResult | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await validator(value, context);
      
      if (result.success || !isNetworkError(result.errors[0]?.code)) {
        return result; // Success or non-network error
      }
      
      lastError = result;
      
      if (attempt < maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    } catch (error) {
      lastError = {
        success: false,
        errors: [{
          field: context.fieldPath,
          code: 'validationError',
          message: 'Validation failed unexpectedly'
        }]
      };
    }
  }
  
  return lastError!;
};

// Graceful degradation for async validation failures
const handleAsyncValidationFailure = (error: ValidationError): ValidationError => {
  if (error.code === 'networkError' || error.code === 'validationTimeout') {
    return {
      ...error,
      code: 'validationWarning',
      message: 'Unable to verify online. Please check manually if needed.'
    };
  }
  
  return error;
};
```

### Client-Side Error Display

```typescript
function ErrorDisplay({ errors, field }: { errors: ValidationError[], field?: string }) {
  const fieldErrors = field ? errors.filter(e => e.field === field) : errors;
  
  if (fieldErrors.length === 0) return null;

  return (
    <div className="error-container" role="alert">
      {fieldErrors.map((error, index) => (
        <div 
          key={`${error.field}-${error.code}-${index}`}
          className={`error-message ${error.code === 'validationWarning' ? 'warning' : 'error'}`}
        >
          <span className="error-icon" aria-hidden="true">
            {error.code === 'validationWarning' ? '⚠️' : '❌'}
          </span>
          <span className="error-text">{error.message}</span>
          {error.code === 'validationWarning' && (
            <button 
              className="retry-button"
              onClick={() => retryValidation(error.field)}
              aria-label={`Retry validation for ${error.field}`}
            >
              Retry
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

## Testing

Comprehensive testing utilities and examples:

### Testing Validation Functions

```typescript
import { assertEquals, assertFalse } from "https://deno.land/std/testing/asserts.ts";
import { emailValidator, minLengthValidator } from "./lib/validation/validators.ts";
import { ValidationTestDataBuilder } from "./lib/validation/test-utils.ts";

Deno.test("emailValidator - valid emails", async () => {
  const validEmails = [
    "test@example.com",
    "user.name@domain.co.uk",
    "user+tag@example.org"
  ];

  for (const email of validEmails) {
    const result = await emailValidator(email, ValidationTestDataBuilder.createContext());
    assertEquals(result.success, true, `Email ${email} should be valid`);
  }
});

Deno.test("emailValidator - invalid emails", async () => {
  const invalidEmails = [
    "invalid-email",
    "@domain.com",
    "user@",
    "user space@domain.com"
  ];

  for (const email of invalidEmails) {
    const result = await emailValidator(email, ValidationTestDataBuilder.createContext());
    assertFalse(result.success, `Email ${email} should be invalid`);
    assertEquals(result.errors[0].code, 'email');
  }
});

Deno.test("minLengthValidator - parameterized validation", async () => {
  const validator = minLengthValidator(5);
  
  const validResult = await validator("hello", ValidationTestDataBuilder.createContext());
  assertEquals(validResult.success, true);
  
  const invalidResult = await validator("hi", ValidationTestDataBuilder.createContext());
  assertFalse(invalidResult.success);
  assertEquals(invalidResult.errors[0].params?.min, 5);
});
```

### Testing Form Validation

```typescript
import { ValidationEngine } from "./lib/validation/engine.ts";
import { userRegistrationSchema } from "./lib/validation/schemas.ts";

Deno.test("Form validation - complete valid form", async () => {
  const engine = new ValidationEngine(ValidationTestDataBuilder.createCopyManager());
  
  const validData = ValidationTestDataBuilder.validUserRegistrationData();
  const result = await engine.validateForm(validData, userRegistrationSchema);
  
  assertEquals(result.success, true);
  assertEquals(result.errors.length, 0);
});

Deno.test("Form validation - multiple field errors", async () => {
  const engine = new ValidationEngine(ValidationTestDataBuilder.createCopyManager());
  
  const invalidData = ValidationTestDataBuilder.invalidUserRegistrationData();
  const result = await engine.validateForm(invalidData, userRegistrationSchema);
  
  assertFalse(result.success);
  assertEquals(result.errors.length, 4); // email, password, confirmPassword, fullName
  
  // Check specific error codes
  const errorCodes = result.errors.map(e => e.code);
  assertEquals(errorCodes.includes('email'), true);
  assertEquals(errorCodes.includes('minLength'), true);
  assertEquals(errorCodes.includes('required'), true);
});
```

### Testing Async Validation

```typescript
import { uniqueEmailValidator } from "./lib/validation/async-validators.ts";

Deno.test("Async validation - unique email success", async () => {
  // Mock fetch for testing
  globalThis.fetch = async () => 
    new Response(JSON.stringify({ unique: true }), { status: 200 });

  const result = await uniqueEmailValidator(
    "new@example.com", 
    ValidationTestDataBuilder.createContext()
  );
  
  assertEquals(result.success, true);
});

Deno.test("Async validation - email already taken", async () => {
  globalThis.fetch = async () => 
    new Response(JSON.stringify({ unique: false }), { status: 200 });

  const result = await uniqueEmailValidator(
    "taken@example.com", 
    ValidationTestDataBuilder.createContext()
  );
  
  assertFalse(result.success);
  assertEquals(result.errors[0].code, 'uniqueEmail');
});

Deno.test("Async validation - network error handling", async () => {
  globalThis.fetch = async () => {
    throw new Error('Network error');
  };

  const result = await uniqueEmailValidator(
    "test@example.com", 
    ValidationTestDataBuilder.createContext()
  );
  
  assertFalse(result.success);
  assertEquals(result.errors[0].code, 'validationError');
});
```

## Migration Guide

Step-by-step guide for migrating existing forms to use the validation system:

### Step 1: Identify Current Validation

```typescript
// BEFORE: Ad-hoc validation
function validateLoginForm(data: { email: string; password: string }) {
  const errors: string[] = [];
  
  if (!data.email) {
    errors.push('Email is required');
  } else if (!/\S+@\S+\.\S+/.test(data.email)) {
    errors.push('Email is invalid');
  }
  
  if (!data.password) {
    errors.push('Password is required');
  } else if (data.password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  
  return errors;
}
```

### Step 2: Create Validation Schema

```typescript
// AFTER: Schema-based validation
import { SchemaBuilder } from "./lib/validation/index.ts";

const loginSchema = SchemaBuilder.create<{
  email: string;
  password: string;
}>()
  .field('email', [
    { type: 'required' },
    { type: 'email' }
  ], { required: true })
  .field('password', [
    { type: 'required' },
    { type: 'minLength', params: { min: 8 } }
  ], { required: true })
  .build();
```

### Step 3: Update Form Component

```typescript
// BEFORE: Manual state management
function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const validationErrors = validateLoginForm({ email, password });
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      setIsSubmitting(false);
      return;
    }
    
    // Submit form...
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {errors.length > 0 && (
        <div>{errors.join(', ')}</div>
      )}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
}

// AFTER: Using validation hook
import { useFormValidation } from "./lib/validation/index.ts";

function LoginForm() {
  const form = useFormValidation(loginSchema, {
    email: '',
    password: ''
  });

  const handleSubmit = async (data: { email: string; password: string }) => {
    // Handle validated data
    await authenticateUser(data);
  };

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      form.submitForm(handleSubmit);
    }}>
      <input
        type="email"
        value={form.getFieldValue('email')}
        onChange={(e) => form.setFieldValue('email', e.target.value)}
        onBlur={() => form.touchField('email')}
        aria-invalid={form.hasFieldError('email')}
      />
      {form.hasFieldError('email') && (
        <div role="alert">{form.getFieldError('email')}</div>
      )}
      
      <input
        type="password"
        value={form.getFieldValue('password')}
        onChange={(e) => form.setFieldValue('password', e.target.value)}
        onBlur={() => form.touchField('password')}
        aria-invalid={form.hasFieldError('password')}
      />
      {form.hasFieldError('password') && (
        <div role="alert">{form.getFieldError('password')}</div>
      )}
      
      <button type="submit" disabled={!form.isValid || form.isSubmitting}>
        {form.isSubmitting ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
}
```

### Step 4: Update Server-Side Validation

```typescript
// BEFORE: Manual server validation
export const handler = define.handlers({
  POST: async (req) => {
    const data = await req.json();
    
    const errors = validateLoginForm(data);
    if (errors.length > 0) {
      return new Response(JSON.stringify({ errors }), { status: 400 });
    }
    
    // Process login...
  }
});

// AFTER: Validation middleware
import { validateJSON } from "./lib/validation/server-middleware.ts";

export const handler = define.handlers({
  POST: validateJSON(loginSchema)(
    async (req: ValidatedRequest<LoginData>) => {
      const { email, password } = req.validatedData;
      // Process validated login...
    }
  )
});
```

### Step 5: Update Copy Messages

```json
{
  "validation": {
    "required": "This field is required",
    "email": "Please enter a valid email address",
    "minLength": "Must be at least {{min}} characters",
    "password": "Password must meet security requirements"
  }
}
```

### Migration Checklist

- [ ] Identify all forms requiring validation
- [ ] Create validation schemas for each form
- [ ] Replace manual validation with schema-based validation
- [ ] Update form components to use validation hooks
- [ ] Add server-side validation middleware
- [ ] Update copy.json with validation messages
- [ ] Add accessibility attributes (aria-invalid, role="alert")
- [ ] Test all validation scenarios
- [ ] Update tests to use validation test utilities
- [ ] Remove old validation code

## API Reference

### Core Classes

#### ValidationEngine
- `validateField<T>(value, schema, context): Promise<ValidationResult<T>>`
- `validateForm<T>(data, schema, context?): Promise<ValidationResult<T>>`
- `validateFromSchema<T>(data, serializedSchema): Promise<ValidationResult<T>>`

#### ValidatorRegistry
- `register(type: string, validator: FieldValidator): void`
- `registerAsync(type: string, validator: FieldValidator): void`
- `get(type: string): FieldValidator | undefined`
- `isAsync(type: string): boolean`

#### SchemaBuilder
- `create<T>(): SchemaBuilder<T>`
- `field<K>(name: K, validators: SerializableValidator[], options?): SchemaBuilder<T>`
- `formValidator(validator: SerializableValidator): SchemaBuilder<T>`
- `options(options: ValidationOptions): SchemaBuilder<T>`
- `build(): ValidationSchema<T>`
- `serialize(): string`
- `deserialize<T>(serialized: string): ValidationSchema<T>`

### Hooks

#### useFormValidation
- `getFieldValue(field: string): any`
- `setFieldValue(field: string, value: any): void`
- `getFieldError(field: string): string | undefined`
- `hasFieldError(field: string): boolean`
- `touchField(field: string): void`
- `submitForm(handler: (data: T) => Promise<void>): Promise<void>`
- `isValid: boolean`
- `isSubmitting: boolean`
- `isValidating: boolean`

#### useFieldValidation
- `value: T | undefined`
- `setValue(value: T): void`
- `error: string | undefined`
- `hasError: boolean`
- `isValidating: boolean`

### Server Middleware

#### validateJSON
- `validateJSON<T>(schema: ValidationSchema<T>, options?): MiddlewareFunction`

#### validateMultipartData
- `validateMultipartData<T>(schema: ValidationSchema<T>, options?): MiddlewareFunction`

### Utility Functions

#### API Utilities
- `validateAPIRequest<T>(data: any, schema: ValidationSchema<T>, options?): Promise<ValidationResult<T>>`
- `sanitizeRequestData(data: any, options?): Promise<any>`
- `createAPIErrorResponse(errors: ValidationError[], status?): Response`
- `createAPISuccessResponse(data: any, status?): Response`

#### Test Utilities
- `ValidationTestDataBuilder.validUserData(): UserData`
- `ValidationTestDataBuilder.invalidUserData(): UserData`
- `ValidationTestDataBuilder.createContext(): ValidationContext`
- `ValidationTestDataBuilder.createCopyManager(): CopyManager`

## Architecture

```
lib/validation/
├── types.ts                    # Core types and interfaces
├── engine.ts                   # ValidationEngine class
├── registry.ts                 # ValidatorRegistry class
├── schema-builder.ts           # SchemaBuilder class
├── validators.ts               # Built-in validators
├── async-validators.ts         # Async validators
├── hooks.ts                    # Preact hooks
├── form-utils.tsx              # Form component utilities
├── server-middleware.ts        # Fresh middleware
├── api-utils.ts               # API validation utilities
├── copy-utils.ts              # Copy manager integration
├── test-utils.ts              # Testing utilities
├── schemas.ts                 # Common validation schemas
├── index.ts                   # Main exports
├── examples/                  # Usage examples
│   ├── form-validation-example.tsx
│   ├── async-validation-example.tsx
│   ├── server-validation-example.ts
│   └── copy-integration-example.tsx
└── README.md                  # This documentation
```

The system follows functional programming principles with pure validation functions, making it predictable, testable, and easy to reason about. All validation logic is centralized, type-safe, and integrated with SimplyCaster's existing architecture.