// ============================================================================
// Form Validation Example - Demonstrating client-side validation hooks
// SimplyCaster Centralized Form Validation System
// ============================================================================

import { useFormValidation, ValidatedTextInput, ValidatedEmailInput } from "../index.ts";
import { userRegistrationSchema } from "../schemas.ts";
import type { UserRegistrationData } from "../schemas.ts";

/**
 * Example user registration form using validation hooks
 */
export default function UserRegistrationForm() {
  // Initialize form validation with schema
  const form = useFormValidation<UserRegistrationData>(
    userRegistrationSchema,
    {
      email: '',
      password: '',
      confirmPassword: '',
      fullName: ''
    }
  );

  // Handle form submission
  const handleSubmit = async (data: UserRegistrationData) => {
    console.log('Submitting user registration:', data);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Reset form on success
    form.reset();
    alert('Registration successful!');
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center">Create Account</h2>
      
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await form.submitForm(handleSubmit);
        }}
        className="space-y-4"
      >
        {/* Full Name Field */}
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
            Full Name *
          </label>
          <ValidatedTextInput
            name="fullName"
            value={form.getFieldValue('fullName')}
            error={form.getFieldError('fullName')}
            isTouched={form.isFieldTouched('fullName')}
            required={true}
            placeholder="Enter your full name"
            onChange={(value) => form.setFieldValue('fullName', value)}
            onBlur={() => form.touchField('fullName')}
          />
        </div>

        {/* Email Field */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email Address *
          </label>
          <ValidatedEmailInput
            name="email"
            value={form.getFieldValue('email')}
            error={form.getFieldError('email')}
            isTouched={form.isFieldTouched('email')}
            required={true}
            placeholder="Enter your email address"
            onChange={(value) => form.setFieldValue('email', value)}
            onBlur={() => form.touchField('email')}
          />
        </div>

        {/* Password Field */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password *
          </label>
          <ValidatedTextInput
            name="password"
            type="password"
            value={form.getFieldValue('password')}
            error={form.getFieldError('password')}
            isTouched={form.isFieldTouched('password')}
            required={true}
            placeholder="Create a secure password"
            onChange={(value) => form.setFieldValue('password', value)}
            onBlur={() => form.touchField('password')}
          />
        </div>

        {/* Confirm Password Field */}
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
            Confirm Password *
          </label>
          <ValidatedTextInput
            name="confirmPassword"
            type="password"
            value={form.getFieldValue('confirmPassword')}
            error={form.getFieldError('confirmPassword')}
            isTouched={form.isFieldTouched('confirmPassword')}
            required={true}
            placeholder="Confirm your password"
            onChange={(value) => form.setFieldValue('confirmPassword', value)}
            onBlur={() => form.touchField('confirmPassword')}
          />
        </div>

        {/* Form-level errors */}
        {form.errors[''] && form.errors[''].length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <div className="text-red-800 text-sm">
              {form.errors[''][0].message}
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={form.isSubmitting || !form.isValid}
          className={`w-full py-2 px-4 rounded-md font-medium transition-colors ${
            form.isSubmitting || !form.isValid
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
          }`}
        >
          {form.isSubmitting ? 'Creating Account...' : 'Create Account'}
        </button>

        {/* Reset Button */}
        <button
          type="button"
          onClick={() => form.reset()}
          className="w-full py-2 px-4 border border-gray-300 rounded-md font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Reset Form
        </button>
      </form>

      {/* Form State Debug Info (for development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-6 p-4 bg-gray-100 rounded-md">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Form State (Debug)</h3>
          <pre className="text-xs text-gray-600 overflow-auto">
            {JSON.stringify({
              isValid: form.isValid,
              isSubmitting: form.isSubmitting,
              isValidating: form.isValidating,
              touchedFields: form.touchedFields,
              data: form.data,
              errors: form.fieldErrors
            }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}