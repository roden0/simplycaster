// ============================================================================
// Validation Examples Index
// SimplyCaster Centralized Form Validation System
// ============================================================================

// Form Implementation Examples
export { default as UserRegistrationForm } from "./user-registration-form.tsx";
export { default as EpisodeUploadForm } from "./episode-upload-form.tsx";
export { default as GuestInvitationForm } from "./guest-invitation-form.tsx";

// Existing Examples
export { default as FormValidationExample } from "./form-validation-example.tsx";
export { AsyncValidationExamples } from "./async-validation-example.tsx";
export { CopyIntegrationExample } from "./copy-integration-example.tsx";

// Server Examples (TypeScript only)
export * from "./server-validation-example.ts";

// ============================================================================
// Example Categories
// ============================================================================

/**
 * Complete form implementations ready for production use
 */
export const productionExamples = {
  UserRegistrationForm,
  EpisodeUploadForm,
  GuestInvitationForm,
} as const;

/**
 * Educational examples demonstrating specific features
 */
export const educationalExamples = {
  FormValidationExample,
  AsyncValidationExamples,
  CopyIntegrationExample,
} as const;

/**
 * Server-side validation examples
 */
export const serverExamples = {
  // Import server examples as needed
} as const;

// ============================================================================
// Example Metadata
// ============================================================================

export interface ExampleMetadata {
  name: string;
  description: string;
  features: string[];
  complexity: 'basic' | 'intermediate' | 'advanced';
  category: 'form' | 'validation' | 'server' | 'integration';
}

export const exampleMetadata: Record<string, ExampleMetadata> = {
  UserRegistrationForm: {
    name: "User Registration Form",
    description: "Complete user registration with email uniqueness, password strength, and confirmation validation",
    features: [
      "Real-time field validation",
      "Async email uniqueness check",
      "Password strength indicator",
      "Password confirmation matching",
      "Accessibility features",
      "Error recovery"
    ],
    complexity: 'advanced',
    category: 'form'
  },
  
  EpisodeUploadForm: {
    name: "Episode Upload Form",
    description: "File upload form with drag-and-drop, metadata extraction, and progress tracking",
    features: [
      "File upload validation",
      "Drag and drop support",
      "Audio preview",
      "Metadata extraction",
      "Upload progress tracking",
      "File type and size validation"
    ],
    complexity: 'advanced',
    category: 'form'
  },
  
  GuestInvitationForm: {
    name: "Guest Invitation Form",
    description: "Room guest invitation with bulk support, preview, and expiration settings",
    features: [
      "Room selection with async loading",
      "Bulk invitation support",
      "Invitation preview",
      "Custom expiration settings",
      "Real-time room capacity checking",
      "Async validation"
    ],
    complexity: 'advanced',
    category: 'form'
  },
  
  FormValidationExample: {
    name: "Basic Form Validation",
    description: "Simple form validation example demonstrating core concepts",
    features: [
      "Basic field validation",
      "Form state management",
      "Error display",
      "Submit handling"
    ],
    complexity: 'basic',
    category: 'form'
  },
  
  AsyncValidationExamples: {
    name: "Async Validation Examples",
    description: "Comprehensive async validation with loading states and error recovery",
    features: [
      "Async field validation",
      "Loading states",
      "Progress tracking",
      "Error recovery",
      "Timeout handling",
      "Cancellation support"
    ],
    complexity: 'intermediate',
    category: 'validation'
  },
  
  CopyIntegrationExample: {
    name: "Copy Manager Integration",
    description: "Demonstrates integration with the copy manager for localized error messages",
    features: [
      "Copy manager integration",
      "Localized error messages",
      "Message interpolation",
      "Fallback handling"
    ],
    complexity: 'intermediate',
    category: 'integration'
  }
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get examples by category
 */
export function getExamplesByCategory(category: ExampleMetadata['category']): ExampleMetadata[] {
  return Object.entries(exampleMetadata)
    .filter(([_, metadata]) => metadata.category === category)
    .map(([_, metadata]) => metadata);
}

/**
 * Get examples by complexity
 */
export function getExamplesByComplexity(complexity: ExampleMetadata['complexity']): ExampleMetadata[] {
  return Object.entries(exampleMetadata)
    .filter(([_, metadata]) => metadata.complexity === complexity)
    .map(([_, metadata]) => metadata);
}

/**
 * Get all example names
 */
export function getExampleNames(): string[] {
  return Object.keys(exampleMetadata);
}

/**
 * Get example metadata by name
 */
export function getExampleMetadata(name: string): ExampleMetadata | undefined {
  return exampleMetadata[name];
}

// ============================================================================
// Usage Guide
// ============================================================================

/**
 * Usage examples for different scenarios:
 * 
 * ## Production Forms
 * ```tsx
 * import { UserRegistrationForm } from "./lib/validation/examples/index.ts";
 * 
 * function App() {
 *   return <UserRegistrationForm />;
 * }
 * ```
 * 
 * ## Learning Examples
 * ```tsx
 * import { AsyncValidationExamples } from "./lib/validation/examples/index.ts";
 * 
 * function ValidationDemo() {
 *   return <AsyncValidationExamples />;
 * }
 * ```
 * 
 * ## Server Integration
 * ```ts
 * import { userRegistrationHandler } from "./lib/validation/examples/index.ts";
 * 
 * // Use in Fresh routes
 * export const handler = userRegistrationHandler;
 * ```
 */