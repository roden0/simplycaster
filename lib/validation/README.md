# SimplyCaster Validation System

A type-safe, serializable form validation system integrated with the copy manager for consistent error messaging.

## Overview

The validation system provides:

- **Type-safe validation schemas** with full TypeScript support
- **Serializable validation rules** for client-server communication
- **Copy manager integration** for consistent error messages
- **Field-level and form-level validation**
- **Async validation support** for external data validation
- **Extensible validator registry** for custom validators

## Quick Start

```typescript
import { 
  createValidationEngine, 
  ValidationSchema, 
  SerializableValidator 
} from "./lib/validation/index.ts";

// Create validation engine
const engine = createValidationEngine();

// Define validation schema
const userSchema: ValidationSchema<{
  email: string;
  password: string;
}> = {
  fields: {
    email: {
      validators: [
        { type: 'required' },
        { type: 'email' }
      ],
      required: true
    },
    password: {
      validators: [
        { type: 'required' },
        { type: 'minLength', params: { min: 8 } }
      ],
      required: true
    }
  }
};

// Validate data
const result = await engine.validateForm({
  email: 'user@example.com',
  password: 'password123'
}, userSchema);

if (result.success) {
  console.log('Validation passed:', result.data);
} else {
  console.log('Validation errors:', result.errors);
}
```

## Core Components

### ValidationEngine

The main orchestrator for validation operations:

- `validateField()` - Validate a single field
- `validateForm()` - Validate an entire form
- `validateFromSchema()` - Validate from serialized schema

### ValidatorRegistry

Manages validation functions:

- `register()` - Register sync validators
- `registerAsync()` - Register async validators
- `get()` - Retrieve validators
- `isAsync()` - Check if validator is async

### Types

Core TypeScript interfaces:

- `ValidationResult<T>` - Validation outcome
- `ValidationError` - Individual error
- `ValidationSchema<T>` - Form validation schema
- `FieldValidator<T>` - Field validation function
- `SerializableValidator` - Serializable validator config

## Integration with Copy Manager

Error messages are retrieved from the copy manager:

```json
{
  "validation": {
    "required": "This field is required",
    "email": "Please enter a valid email address",
    "minLength": "Must be at least {{min}} characters"
  }
}
```

## Next Steps

1. Implement built-in validators (required, email, etc.)
2. Create client-side form hooks
3. Add server-side validation middleware
4. Build async validation support
5. Create comprehensive test suite

## Architecture

```
lib/validation/
├── types.ts      # Core types and interfaces
├── engine.ts     # ValidationEngine class
├── registry.ts   # ValidatorRegistry class
├── index.ts      # Main exports
└── README.md     # This file
```

The system follows functional programming principles with pure validation functions, making it predictable, testable, and easy to reason about.