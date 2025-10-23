// ============================================================================
// SchemaBuilder - Fluent API for building validation schemas
// SimplyCaster Centralized Form Validation System
// ============================================================================

import type {
  ValidationSchema,
  FieldValidationSchema,
  SerializableValidator,
  ValidationOptions,
} from "./types.ts";

/**
 * Fluent API builder for creating validation schemas
 */
export class SchemaBuilder<T = any> {
  private schema: ValidationSchema<T> = { 
    fields: {} as Record<keyof T, FieldValidationSchema>
  };

  /**
   * Create a new schema builder instance
   */
  static create<T>(): SchemaBuilder<T> {
    return new SchemaBuilder<T>();
  }

  /**
   * Add field validation to the schema
   */
  field<K extends keyof T>(
    fieldName: K,
    validators: SerializableValidator[],
    options?: { required?: boolean; dependsOn?: string[] }
  ): SchemaBuilder<T> {
    this.schema.fields[fieldName] = {
      validators,
      required: options?.required,
      dependsOn: options?.dependsOn
    };
    return this;
  }

  /**
   * Mark a field as required
   */
  required<K extends keyof T>(fieldName: K): SchemaBuilder<T> {
    if (!this.schema.fields[fieldName]) {
      this.schema.fields[fieldName] = { validators: [] };
    }
    this.schema.fields[fieldName].required = true;
    return this;
  }

  /**
   * Add field dependencies
   */
  dependsOn<K extends keyof T>(fieldName: K, dependencies: string[]): SchemaBuilder<T> {
    if (!this.schema.fields[fieldName]) {
      this.schema.fields[fieldName] = { validators: [] };
    }
    this.schema.fields[fieldName].dependsOn = dependencies;
    return this;
  }

  /**
   * Add a form-level validator for cross-field validation
   */
  formValidator(validator: SerializableValidator): SchemaBuilder<T> {
    if (!this.schema.formValidators) {
      this.schema.formValidators = [];
    }
    this.schema.formValidators.push(validator);
    return this;
  }

  /**
   * Set validation options
   */
  options(options: ValidationOptions): SchemaBuilder<T> {
    this.schema.options = { ...this.schema.options, ...options };
    return this;
  }

  /**
   * Set abort early option
   */
  abortEarly(value: boolean = true): SchemaBuilder<T> {
    if (!this.schema.options) {
      this.schema.options = {};
    }
    this.schema.options.abortEarly = value;
    return this;
  }

  /**
   * Set strip unknown fields option
   */
  stripUnknown(value: boolean = true): SchemaBuilder<T> {
    if (!this.schema.options) {
      this.schema.options = {};
    }
    this.schema.options.stripUnknown = value;
    return this;
  }

  /**
   * Set allow unknown fields option
   */
  allowUnknown(value: boolean = true): SchemaBuilder<T> {
    if (!this.schema.options) {
      this.schema.options = {};
    }
    this.schema.options.allowUnknown = value;
    return this;
  }

  /**
   * Set debounce time for real-time validation
   */
  debounce(milliseconds: number): SchemaBuilder<T> {
    if (!this.schema.options) {
      this.schema.options = {};
    }
    this.schema.options.debounceMs = milliseconds;
    return this;
  }

  /**
   * Build and return the validation schema
   */
  build(): ValidationSchema<T> {
    return { ...this.schema };
  }

  /**
   * Serialize the schema to JSON string
   */
  serialize(): string {
    return JSON.stringify(this.schema, null, 2);
  }

  /**
   * Deserialize a schema from JSON string
   */
  static deserialize<T>(serialized: string): ValidationSchema<T> {
    try {
      return JSON.parse(serialized);
    } catch (error) {
      throw new Error(`Failed to deserialize schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a schema builder from an existing schema
   */
  static fromSchema<T>(schema: ValidationSchema<T>): SchemaBuilder<T> {
    const builder = new SchemaBuilder<T>();
    builder.schema = { ...schema };
    return builder;
  }

  /**
   * Clone the current builder
   */
  clone(): SchemaBuilder<T> {
    const cloned = new SchemaBuilder<T>();
    cloned.schema = JSON.parse(JSON.stringify(this.schema));
    return cloned;
  }

  /**
   * Merge another schema into this one
   */
  merge(other: ValidationSchema<T> | SchemaBuilder<T>): SchemaBuilder<T> {
    const otherSchema = other instanceof SchemaBuilder ? other.build() : other;
    
    // Merge fields
    this.schema.fields = { ...this.schema.fields, ...otherSchema.fields };
    
    // Merge form validators
    if (otherSchema.formValidators) {
      if (!this.schema.formValidators) {
        this.schema.formValidators = [];
      }
      this.schema.formValidators.push(...otherSchema.formValidators);
    }
    
    // Merge options
    if (otherSchema.options) {
      this.schema.options = { ...this.schema.options, ...otherSchema.options };
    }
    
    return this;
  }

  /**
   * Remove a field from the schema
   */
  removeField<K extends keyof T>(fieldName: K): SchemaBuilder<T> {
    delete this.schema.fields[fieldName];
    return this;
  }

  /**
   * Check if a field exists in the schema
   */
  hasField<K extends keyof T>(fieldName: K): boolean {
    return fieldName in this.schema.fields;
  }

  /**
   * Get field schema for a specific field
   */
  getField<K extends keyof T>(fieldName: K): FieldValidationSchema | undefined {
    return this.schema.fields[fieldName];
  }

  /**
   * Update an existing field's validators
   */
  updateField<K extends keyof T>(
    fieldName: K,
    updater: (current: FieldValidationSchema) => FieldValidationSchema
  ): SchemaBuilder<T> {
    if (this.schema.fields[fieldName]) {
      this.schema.fields[fieldName] = updater(this.schema.fields[fieldName]);
    }
    return this;
  }

  /**
   * Add validators to an existing field
   */
  addValidators<K extends keyof T>(
    fieldName: K,
    validators: SerializableValidator[]
  ): SchemaBuilder<T> {
    if (!this.schema.fields[fieldName]) {
      this.schema.fields[fieldName] = { validators: [] };
    }
    this.schema.fields[fieldName].validators.push(...validators);
    return this;
  }

  /**
   * Remove validators from a field by type
   */
  removeValidators<K extends keyof T>(
    fieldName: K,
    validatorTypes: string[]
  ): SchemaBuilder<T> {
    if (this.schema.fields[fieldName]) {
      this.schema.fields[fieldName].validators = this.schema.fields[fieldName].validators
        .filter(v => !validatorTypes.includes(v.type));
    }
    return this;
  }

  /**
   * Get validation statistics for the schema
   */
  getStats(): SchemaStats {
    const fieldCount = Object.keys(this.schema.fields).length;
    const fieldValues = Object.values(this.schema.fields) as FieldValidationSchema[];
    const requiredFieldCount = fieldValues
      .filter(field => field.required).length;
    const totalValidators = fieldValues
      .reduce((sum, field) => sum + field.validators.length, 0);
    const formValidatorCount = this.schema.formValidators?.length || 0;
    const asyncValidatorCount = fieldValues
      .flatMap(field => field.validators)
      .filter(validator => validator.async).length;

    return {
      fieldCount,
      requiredFieldCount,
      totalValidators,
      formValidatorCount,
      asyncValidatorCount,
      hasOptions: !!this.schema.options
    };
  }
}

/**
 * Statistics about a validation schema
 */
export interface SchemaStats {
  fieldCount: number;
  requiredFieldCount: number;
  totalValidators: number;
  formValidatorCount: number;
  asyncValidatorCount: number;
  hasOptions: boolean;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a new schema builder
 */
export function createSchema<T>(): SchemaBuilder<T> {
  return SchemaBuilder.create<T>();
}

/**
 * Create a schema from a plain object definition
 */
export function defineSchema<T>(
  definition: {
    fields: Record<keyof T, {
      validators: SerializableValidator[];
      required?: boolean;
      dependsOn?: string[];
    }>;
    formValidators?: SerializableValidator[];
    options?: ValidationOptions;
  }
): ValidationSchema<T> {
  const builder = SchemaBuilder.create<T>();

  // Add fields
  for (const [fieldName, fieldDef] of Object.entries(definition.fields)) {
    const typedFieldDef = fieldDef as {
      validators: SerializableValidator[];
      required?: boolean;
      dependsOn?: string[];
    };
    builder.field(
      fieldName as keyof T,
      typedFieldDef.validators,
      {
        required: typedFieldDef.required,
        dependsOn: typedFieldDef.dependsOn
      }
    );
  }

  // Add form validators
  if (definition.formValidators) {
    for (const validator of definition.formValidators) {
      builder.formValidator(validator);
    }
  }

  // Add options
  if (definition.options) {
    builder.options(definition.options);
  }

  return builder.build();
}