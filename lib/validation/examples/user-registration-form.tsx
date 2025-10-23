// ============================================================================
// User Registration Form Implementation Example
// SimplyCaster Centralized Form Validation System
// ============================================================================

/** @jsx h */
/** @jsxFrag Fragment */
import { h, JSX, Fragment } from "preact";
import { useState } from "preact/hooks";
import { useFormValidation } from "../hooks.ts";
import { userRegistrationSchema } from "../schemas.ts";
import type { UserRegistrationData } from "../schemas.ts";

/**
 * Complete user registration form implementation with validation
 * Demonstrates:
 * - Real-time field validation with debouncing
 * - Async email uniqueness validation
 * - Password strength validation
 * - Password confirmation matching
 * - Accessibility features
 * - Error recovery and retry mechanisms
 */
export function UserRegistrationForm(): JSX.Element {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

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

  // Handle successful form submission
  const handleSubmit = async (data: UserRegistrationData) => {
    try {
      console.log('Submitting registration:', data);
      
      // Simulate API call to register user
      const response = await fetch('/api/users/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Registration successful:', result);
        setRegistrationSuccess(true);
        form.reset();
      } else {
        const errorData = await response.json();
        
        // Handle server validation errors
        if (errorData.errors) {
          form.setServerErrors(errorData.errors);
        } else {
          form.setSubmissionError('Registration failed. Please try again.');
        }
      }
    } catch (error) {
      console.error('Registration error:', error);
      form.setSubmissionError('Network error. Please check your connection and try again.');
    }
  };

  // Password strength indicator
  const getPasswordStrength = (password: string): { strength: number; label: string; color: string } => {
    if (!password) return { strength: 0, label: '', color: '' };
    
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
    const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'];
    
    return {
      strength: Math.min(strength, 5),
      label: labels[Math.min(strength - 1, 4)] || '',
      color: colors[Math.min(strength - 1, 4)] || 'bg-gray-300'
    };
  };

  const passwordStrength = getPasswordStrength(form.getFieldValue('password') || '');

  if (registrationSuccess) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md text-center">
        <div className="mb-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Registration Successful!</h2>
          <p className="text-gray-600 mb-6">
            Your account has been created successfully. Please check your email to verify your account.
          </p>
          <button
            onClick={() => setRegistrationSuccess(false)}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Register Another User
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Create Your Account</h2>
        <p className="text-gray-600">Join SimplyCaster to start recording podcasts</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.submitForm(handleSubmit);
        }}
        className="space-y-4"
        noValidate
        aria-label="User registration form"
      >
        {/* Full Name Field */}
        <div className="field-group">
          <label 
            htmlFor="fullName" 
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Full Name
            <span className="text-red-500 ml-1" aria-label="required">*</span>
          </label>
          <input
            id="fullName"
            type="text"
            value={form.getFieldValue('fullName') || ''}
            onChange={(e) => form.setFieldValue('fullName', (e.target as HTMLInputElement).value)}
            onBlur={() => form.touchField('fullName')}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors ${
              form.hasFieldError('fullName') && form.isFieldTouched('fullName')
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:ring-blue-500'
            }`}
            placeholder="Enter your full name"
            aria-invalid={form.hasFieldError('fullName')}
            aria-describedby={form.hasFieldError('fullName') ? 'fullName-error' : 'fullName-help'}
            aria-required="true"
          />
          <div id="fullName-help" className="text-xs text-gray-500 mt-1">
            Enter your first and last name
          </div>
          {form.hasFieldError('fullName') && form.isFieldTouched('fullName') && (
            <div id="fullName-error" role="alert" className="text-red-600 text-sm mt-1 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {form.getFieldError('fullName')}
            </div>
          )}
        </div>

        {/* Email Field with Async Validation */}
        <div className="field-group">
          <label 
            htmlFor="email" 
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Email Address
            <span className="text-red-500 ml-1" aria-label="required">*</span>
          </label>
          <div className="relative">
            <input
              id="email"
              type="email"
              value={form.getFieldValue('email') || ''}
              onChange={(e) => form.setFieldValue('email', (e.target as HTMLInputElement).value)}
              onBlur={() => form.touchField('email')}
              className={`w-full px-3 py-2 pr-10 border rounded-md focus:outline-none focus:ring-2 transition-colors ${
                form.hasFieldError('email') && form.isFieldTouched('email')
                  ? 'border-red-500 focus:ring-red-500'
                  : form.isFieldValidating('email')
                  ? 'border-yellow-500 focus:ring-yellow-500'
                  : 'border-gray-300 focus:ring-blue-500'
              }`}
              placeholder="Enter your email address"
              aria-invalid={form.hasFieldError('email')}
              aria-describedby={form.hasFieldError('email') ? 'email-error' : 'email-help'}
              aria-required="true"
              disabled={form.isFieldValidating('email')}
            />
            {form.isFieldValidating('email') && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-500"></div>
              </div>
            )}
            {!form.hasFieldError('email') && !form.isFieldValidating('email') && form.getFieldValue('email') && form.isFieldTouched('email') && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
          <div id="email-help" className="text-xs text-gray-500 mt-1">
            We'll check if this email is available
          </div>
          {form.isFieldValidating('email') && (
            <div className="text-yellow-600 text-sm mt-1 flex items-center" aria-live="polite">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-yellow-600 mr-2"></div>
              Checking email availability...
            </div>
          )}
          {form.hasFieldError('email') && form.isFieldTouched('email') && (
            <div id="email-error" role="alert" className="text-red-600 text-sm mt-1 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {form.getFieldError('email')}
            </div>
          )}
        </div>

        {/* Password Field with Strength Indicator */}
        <div className="field-group">
          <label 
            htmlFor="password" 
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Password
            <span className="text-red-500 ml-1" aria-label="required">*</span>
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={form.getFieldValue('password') || ''}
              onChange={(e) => form.setFieldValue('password', (e.target as HTMLInputElement).value)}
              onBlur={() => form.touchField('password')}
              className={`w-full px-3 py-2 pr-10 border rounded-md focus:outline-none focus:ring-2 transition-colors ${
                form.hasFieldError('password') && form.isFieldTouched('password')
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:ring-blue-500'
              }`}
              placeholder="Create a secure password"
              aria-invalid={form.hasFieldError('password')}
              aria-describedby="password-requirements password-strength password-error"
              aria-required="true"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <div id="password-requirements" className="text-xs text-gray-500 mt-1">
            Must be at least 8 characters with uppercase, lowercase, and numbers
          </div>
          
          {/* Password Strength Indicator */}
          {form.getFieldValue('password') && (
            <div id="password-strength" className="mt-2">
              <div className="flex items-center space-x-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${passwordStrength.color}`}
                    style={{ width: `${(passwordStrength.strength / 5) * 100}%` }}
                  ></div>
                </div>
                <span className="text-xs font-medium text-gray-600">
                  {passwordStrength.label}
                </span>
              </div>
            </div>
          )}
          
          {form.hasFieldError('password') && form.isFieldTouched('password') && (
            <div id="password-error" role="alert" className="text-red-600 text-sm mt-1 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {form.getFieldError('password')}
            </div>
          )}
        </div>

        {/* Confirm Password Field */}
        <div className="field-group">
          <label 
            htmlFor="confirmPassword" 
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Confirm Password
            <span className="text-red-500 ml-1" aria-label="required">*</span>
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              value={form.getFieldValue('confirmPassword') || ''}
              onChange={(e) => form.setFieldValue('confirmPassword', (e.target as HTMLInputElement).value)}
              onBlur={() => form.touchField('confirmPassword')}
              className={`w-full px-3 py-2 pr-10 border rounded-md focus:outline-none focus:ring-2 transition-colors ${
                form.hasFieldError('confirmPassword') && form.isFieldTouched('confirmPassword')
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:ring-blue-500'
              }`}
              placeholder="Confirm your password"
              aria-invalid={form.hasFieldError('confirmPassword')}
              aria-describedby={form.hasFieldError('confirmPassword') ? 'confirmPassword-error' : 'confirmPassword-help'}
              aria-required="true"
              disabled={!form.getFieldValue('password')}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
              aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
            >
              {showConfirmPassword ? (
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <div id="confirmPassword-help" className="text-xs text-gray-500 mt-1">
            Re-enter your password to confirm
          </div>
          {form.hasFieldError('confirmPassword') && form.isFieldTouched('confirmPassword') && (
            <div id="confirmPassword-error" role="alert" className="text-red-600 text-sm mt-1 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {form.getFieldError('confirmPassword')}
            </div>
          )}
        </div>

        {/* Form-level errors */}
        {form.hasSubmissionError() && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3" role="alert">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="text-red-800 text-sm">
                {form.getSubmissionError()}
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!form.isValid || form.isSubmitting}
          className={`w-full py-3 px-4 rounded-md font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            !form.isValid || form.isSubmitting
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 transform hover:scale-105'
          }`}
          aria-describedby="submit-help"
        >
          {form.isSubmitting ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Creating Account...
            </div>
          ) : (
            'Create Account'
          )}
        </button>

        <div id="submit-help" className="text-xs text-center text-gray-500">
          {!form.isValid && 'Please fix the errors above before submitting'}
          {form.isSubmitting && (
            <div aria-live="polite">
              Creating your account and sending verification email...
            </div>
          )}
        </div>

        {/* Reset Button */}
        <button
          type="button"
          onClick={() => form.reset()}
          className="w-full py-2 px-4 border border-gray-300 rounded-md font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
        >
          Reset Form
        </button>
      </form>

      {/* Terms and Privacy */}
      <div className="mt-6 text-center">
        <p className="text-xs text-gray-500">
          By creating an account, you agree to our{' '}
          <a href="/terms" className="text-blue-600 hover:underline">Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}

export default UserRegistrationForm;