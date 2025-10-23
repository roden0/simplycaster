// ============================================================================
// ValidationEngine - Core validation orchestration
// SimplyCaster Centralized Form Validation System
// ============================================================================

import type {
  ValidationResult,
  ValidationError,
  ValidationContext,
  FieldValidationSchema,
  ValidationSchema,
  SerializableValidator,
  ValidationOptions,
} from "./types.ts";
import type { ValidatorRegistry } from "./registry.ts";
import { getCopy } from "../copy.ts";

/**
 * Core validation engine that orchestrates field and form validation
 */
export class ValidationEngine {
  private copyManager: typeof getCopy;
  private validatorRegistry: ValidatorRegistry;

  constructor(copyManager: typeof getCopy, validatorRegistry: ValidatorRegistry) {
    this.copyManager = copyManager;
    this.validatorRegistry = validatorRegistry;
  }

  /**
   * Validate a single field value against its schema
   */
  async validateField<T>(
    value: T,
    schema: FieldValidationSchema,
    context: ValidationContext
  ): Promise<ValidationResult<T>> {
    const errors: ValidationError[] = [];
    let validatedValue = value;

    // Check required validation first
    if (schema.required && this.isEmpty(value)) {
      errors.push({
        field: context.fieldPath,
        code: 'required',
        message: this.copyManager('validation.required'),
        params: {}
      });
      
      // If required field is empty, don't run other validators
      return {
        success: false,
        errors,
        warnings: []
      };
    }

    // Skip other validators if value is empty and field is not required
    if (!schema.required && this.isEmpty(value)) {
      return {
        success: true,
        data: validatedValue,
        errors: [],
        warnings: []
      };
    }

    // Run all validators
    for (const validatorConfig of schema.validators) {
      const validator = this.validatorRegistry.get(validatorConfig.type);
      
      if (!validator) {
        console.warn(`Validator not found: ${validatorConfig.type}`);
        continue;
      }

      try {
        // Create validator function with parameters
        const validatorFn = this.createValidatorFunction(validator, validatorConfig);
        const result = await validatorFn(validatedValue, context);

        if (!result.success) {
          errors.push(...result.errors);
          
          // If abortEarly is enabled, stop on first error
          if (context.formData._abortEarly) {
            break;
          }
        } else if (result.data !== undefined) {
          // Update validated value if validator transforms it
          validatedValue = result.data;
        }
      } catch (error) {
        console.error(`Validator ${validatorConfig.type} threw an error:`, error);
        errors.push({
          field: context.fieldPath,
          code: 'validationError',
          message: this.copyManager('errors.validationError'),
          params: { error: error instanceof Error ? error.message : String(error) }
        });
      }
    }

    return {
      success: errors.length === 0,
      data: errors.length === 0 ? validatedValue : undefined,
      errors,
      warnings: []
    };
  }

  /**
   * Validate an entire form against its schema
   */
  async validateForm<T>(
    data: T,
    schema: ValidationSchema<T>,
    context?: Partial<ValidationContext>
  ): Promise<ValidationResult<T>> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const validatedData: Record<string, any> = {};
    const options = schema.options || {};

    // Create full context
    const fullContext: ValidationContext = {
      formData: data as Record<string, any>,
      fieldPath: '',
      isSubmitting: context?.isSubmitting || false,
      copyManager: this.copyManager,
      ...context
    };

    // Add options to form data for validators to access
    fullContext.formData._abortEarly = options.abortEarly;

    // Validate each field
    for (const [fieldName, fieldSchema] of Object.entries(schema.fields)) {
      const fieldPath = String(fieldName);
      const fieldValue = (data as any)[fieldName];

      const fieldContext: ValidationContext = {
        ...fullContext,
        fieldPath
      };

      try {
        const fieldResult = await this.validateField(
          fieldValue,
          fieldSchema as FieldValidationSchema,
          fieldContext
        );

        if (!fieldResult.success) {
          errors.push(...fieldResult.errors);
          
          if (options.abortEarly) {
            break;
          }
        } else {
          // Store validated data
          validatedData[fieldName] = fieldResult.data;
        }

        if (fieldResult.warnings) {
          warnings.push(...fieldResult.warnings);
        }
      } catch (error) {
        console.error(`Field validation failed for ${fieldPath}:`, error);
        errors.push({
          field: fieldPath,
          code: 'validationError',
          message: this.copyManager('errors.validationError'),
          params: { field: fieldPath, error: error instanceof Error ? error.message : String(error) }
        });
      }
    }

    // Run form-level validators if field validation passed or abortEarly is false
    if ((errors.length === 0 || !options.abortEarly) && schema.formValidators) {
      for (const validatorConfig of schema.formValidators) {
        const validator = this.validatorRegistry.get(validatorConfig.type);
        
        if (!validator) {
          console.warn(`Form validator not found: ${validatorConfig.type}`);
          continue;
        }

        try {
          const validatorFn = this.createValidatorFunction(validator, validatorConfig);
          const result = await validatorFn(validatedData, fullContext);

          if (!result.success) {
            errors.push(...result.errors);
          }

          if (result.warnings) {
            warnings.push(...result.warnings);
          }
        } catch (error) {
          console.error(`Form validator ${validatorConfig.type} threw an error:`, error);
          errors.push({
            field: '',
            code: 'validationError',
            message: this.copyManager('errors.validationError'),
            params: { validator: validatorConfig.type, error: error instanceof Error ? error.message : String(error) }
          });
        }
      }
    }

    // Handle unknown fields based on options
    if (options.stripUnknown || !options.allowUnknown) {
      // Only include fields that are in the schema
      const finalData: Record<string, any> = {};
      for (const fieldName of Object.keys(schema.fields)) {
        if (fieldName in validatedData) {
          finalData[fieldName] = validatedData[fieldName];
        }
      }
      
      return {
        success: errors.length === 0,
        data: errors.length === 0 ? (finalData as T) : undefined,
        errors,
        warnings
      };
    } else {
      // Include all original data plus validated fields
      const finalData = { ...data, ...validatedData };
      
      return {
        success: errors.length === 0,
        data: errors.length === 0 ? (finalData as T) : undefined,
        errors,
        warnings
      };
    }
  }

  /**
   * Validate data from a serialized schema
   */
  async validateFromSchema<T>(
    data: T,
    serializedSchema: string | ValidationSchema<T>
  ): Promise<ValidationResult<T>> {
    let schema: ValidationSchema<T>;

    if (typeof serializedSchema === 'string') {
      try {
        schema = JSON.parse(serializedSchema);
      } catch (error) {
        return {
          success: false,
          errors: [{
            field: '',
            code: 'schemaParseError',
            message: this.copyManager('errors.validationError'),
            params: { error: 'Invalid schema format' }
          }],
          warnings: []
        };
      }
    } else {
      schema = serializedSchema;
    }

    return this.validateForm(data, schema);
  }

  /**
   * Serialize a validation schema to JSON string
   */
  serializeSchema<T>(schema: ValidationSchema<T>): string {
    return JSON.stringify(schema, null, 2);
  }

  /**
   * Deserialize a validation schema from JSON string
   */
  deserializeSchema<T>(serializedSchema: string): ValidationSchema<T> {
    return JSON.parse(serializedSchema);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Check if a value is considered empty
   */
  private isEmpty(value: any): boolean {
    return value === null || 
           value === undefined || 
           (typeof value === 'string' && value.trim() === '') ||
           (Array.isArray(value) && value.length === 0);
  }

  /**
   * Create a validator function with bound parameters
   */
  private createValidatorFunction(
    validator: any,
    config: SerializableValidator
  ): (value: any, context: ValidationContext) => Promise<ValidationResult> {
    // If validator is a factory function (takes parameters or no parameters)
    if (typeof validator === 'function') {
      try {
        // Try to call validator as factory with params (or empty object if no params)
        const params = config.params || {};
        const validatorInstance = validator(params);
        if (typeof validatorInstance === 'function') {
          return async (value: any, context: ValidationContext) => {
            const result = await validatorInstance(value, context);
            
            // Override message if custom message provided
            if (config.message && !result.success) {
              result.errors = result.errors.map((error: ValidationError) => ({
                ...error,
                message: config.message!
              }));
            }
            
            return result;
          };
        }
      } catch (error) {
        // Fall back to direct validator call
      }
    }

    // Direct validator function (for non-factory validators like required, email)
    return async (value: any, context: ValidationContext) => {
      const result = await validator(value, context);
      
      // Override message if custom message provided
      if (config.message && !result.success) {
        result.errors = result.errors.map((error: ValidationError) => ({
          ...error,
          message: config.message!
        }));
      }
      
      return result;
    };
  }
}