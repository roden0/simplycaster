/**
 * Example demonstrating copy manager integration with validation system
 */

import { useSignal } from "@preact/signals";
import { useFormValidation } from "../hooks.ts";
import { userRegistrationSchema } from "../schemas.ts";
import {
  getValidationMessage,
  formatValidationError,
  validationMessages,
  type ExtendedValidationContext,
} from "../copy-utils.ts";

// Example form data
interface UserRegistrationForm {
  email: string;
  name: string;
  password: string;
  confirmPassword: string;
}

export function CopyIntegrationExample() {
  const formData = useSignal<UserRegistrationForm>({
    email: "",
    name: "",
    password: "",
    confirmPassword: "",
  });

  // Create extended validation context with copy context
  const validationContext: ExtendedValidationContext = {
    context: "user", // This will use validation.contexts.user messages
    formData: formData.value,
    fieldPath: "",
    isSubmitting: false,
    copyManager: () => "test", // In real app, use actual copy manager
  };

  const { validateField, validateForm, errors, isValid } = useFormValidation(
    userRegistrationSchema,
    formData.value,
    validationContext
  );

  const handleFieldChange = (field: keyof UserRegistrationForm, value: string) => {
    formData.value = { ...formData.value, [field]: value };
    validateField(field, value);
  };

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    validateForm(formData.value);
  };

  return (
    <div class="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 class="text-2xl font-bold mb-6">Copy Integration Example</h2>
      
      <form onSubmit={handleSubmit} class="space-y-4">
        {/* Email Field */}
        <div>
          <label htmlFor="email" class="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={formData.value.email}
            onInput={(e) => handleFieldChange("email", (e.target as HTMLInputElement).value)}
            class={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 ${
              errors.email ? "border-red-300" : "border-gray-300"
            }`}
            placeholder="Enter your email"
          />
          {errors.email && (
            <p class="mt-1 text-sm text-red-600">
              {formatValidationError(errors.email, validationContext)}
            </p>
          )}
        </div>

        {/* Name Field */}
        <div>
          <label htmlFor="name" class="block text-sm font-medium text-gray-700">
            Name
          </label>
          <input
            id="name"
            type="text"
            value={formData.value.name}
            onInput={(e) => handleFieldChange("name", (e.target as HTMLInputElement).value)}
            class={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 ${
              errors.name ? "border-red-300" : "border-gray-300"
            }`}
            placeholder="Enter your name"
          />
          {errors.name && (
            <p class="mt-1 text-sm text-red-600">
              {formatValidationError(errors.name, validationContext)}
            </p>
          )}
        </div>

        {/* Password Field */}
        <div>
          <label htmlFor="password" class="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={formData.value.password}
            onInput={(e) => handleFieldChange("password", (e.target as HTMLInputElement).value)}
            class={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 ${
              errors.password ? "border-red-300" : "border-gray-300"
            }`}
            placeholder="Enter your password"
          />
          {errors.password && (
            <p class="mt-1 text-sm text-red-600">
              {formatValidationError(errors.password, validationContext)}
            </p>
          )}
        </div>

        {/* Confirm Password Field */}
        <div>
          <label htmlFor="confirmPassword" class="block text-sm font-medium text-gray-700">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={formData.value.confirmPassword}
            onInput={(e) => handleFieldChange("confirmPassword", (e.target as HTMLInputElement).value)}
            class={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 ${
              errors.confirmPassword ? "border-red-300" : "border-gray-300"
            }`}
            placeholder="Confirm your password"
          />
          {errors.confirmPassword && (
            <p class="mt-1 text-sm text-red-600">
              {formatValidationError(errors.confirmPassword, validationContext)}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={!isValid}
          class={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
            isValid
              ? "bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              : "bg-gray-400 cursor-not-allowed"
          }`}
        >
          Register
        </button>
      </form>

      {/* Copy Utilities Demo */}
      <div class="mt-8 p-4 bg-gray-50 rounded-lg">
        <h3 class="text-lg font-semibold mb-4">Copy Utilities Demo</h3>
        
        <div class="space-y-2 text-sm">
          <div>
            <strong>Basic required message:</strong><br />
            {getValidationMessage("required")}
          </div>
          
          <div>
            <strong>Context-specific email message:</strong><br />
            {getValidationMessage("email", undefined, validationContext)}
          </div>
          
          <div>
            <strong>Parameterized min length:</strong><br />
            {getValidationMessage("minLength", { min: 8 })}
          </div>
          
          <div>
            <strong>Convenience function:</strong><br />
            {validationMessages.range(8, 20, "password")}
          </div>
          
          <div>
            <strong>Custom message:</strong><br />
            {validationMessages.custom("{{field}} must be unique in the system", { field: "Username" })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Example of using copy utilities in validation functions
export function createUserValidationWithCopy() {
  const context: ExtendedValidationContext = {
    context: "user",
    formData: {},
    fieldPath: "",
    isSubmitting: false,
    copyManager: () => "test",
  };

  return {
    // Get localized error messages
    getRequiredMessage: (field: string) => 
      validationMessages.required(field, context),
    
    getEmailMessage: (field: string) => 
      validationMessages.email(field, context),
    
    getPasswordMessage: (field: string) => 
      getValidationMessage("passwordStrength", undefined, context),
    
    // Format validation errors with context
    formatError: (error: any) => 
      formatValidationError(error, context),
  };
}

export default CopyIntegrationExample;