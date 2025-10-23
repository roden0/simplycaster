// ============================================================================
// Async Validation Example
// SimplyCaster Centralized Form Validation System
// ============================================================================

/** @jsx h */
/** @jsxFrag Fragment */
import { h, JSX, Fragment } from "preact";
import { useState } from "preact/hooks";
import {
  useEnhancedAsyncFieldValidation,
  AsyncValidationField,
  useAsyncValidationProgress,
  useAsyncValidationRetry,
  type SerializableValidator,
} from "../index.ts";

// ============================================================================
// Example: Email Uniqueness Validation
// ============================================================================

export function EmailValidationExample(): JSX.Element {
  const emailValidators: SerializableValidator[] = [
    { type: 'required' },
    { type: 'email' },
    { type: 'uniqueEmail', async: true }
  ];

  const emailValidation = useEnhancedAsyncFieldValidation<string>(
    emailValidators,
    '',
    {
      timeout: 8000,
      maxRetries: 2,
      retryDelay: 1000,
      exponentialBackoff: true,
      debounceMs: 500
    }
  );

  const retryConfig = useAsyncValidationRetry(
    async () => {
      if (emailValidation.value) {
        emailValidation.setValue(emailValidation.value);
      }
    },
    3
  );

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Email Validation Example</h2>
      
      <AsyncValidationField
        label="Email Address"
        required={true}
        validationState={{
          isValidating: emailValidation.isValidating,
          error: emailValidation.error,
          isTouched: emailValidation.isTouched,
          isValid: emailValidation.isValid
        }}
        retryConfig={{
          isRecoverable: emailValidation.canRetry,
          onRetry: retryConfig.retry,
          isRetrying: retryConfig.isRetrying,
          retryAttempts: emailValidation.retryAttempts
        }}
        helpText="Enter your email address to check availability"
      >
        <input
          type="email"
          value={emailValidation.value || ''}
          onInput={(e) => emailValidation.setValue((e.target as HTMLInputElement).value)}
          onBlur={() => emailValidation.touch()}
          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
          placeholder="Enter your email"
        />
      </AsyncValidationField>

      {/* Debug information */}
      <div className="mt-4 p-3 bg-gray-100 rounded text-sm">
        <h3 className="font-medium mb-2">Debug Info:</h3>
        <ul className="space-y-1 text-xs">
          <li>Is Validating: {emailValidation.isValidating ? 'Yes' : 'No'}</li>
          <li>Is Valid: {emailValidation.isValid ? 'Yes' : 'No'}</li>
          <li>Has Error: {emailValidation.hasError ? 'Yes' : 'No'}</li>
          <li>Retry Attempts: {emailValidation.retryAttempts}</li>
          <li>Can Retry: {emailValidation.canRetry ? 'Yes' : 'No'}</li>
          <li>Is Cancelled: {emailValidation.isCancelled ? 'Yes' : 'No'}</li>
          <li>Is Timed Out: {emailValidation.isTimedOut ? 'Yes' : 'No'}</li>
          <li>Duration: {emailValidation.validationDuration}ms</li>
        </ul>
      </div>
    </div>
  );
}

// ============================================================================
// Example: Room Slug Validation with Progress
// ============================================================================

export function RoomSlugValidationExample(): JSX.Element {
  const slugValidators: SerializableValidator[] = [
    { type: 'required' },
    { type: 'minLength', params: { min: 3 } },
    { type: 'uniqueSlug', async: true, params: { entity: 'room' } }
  ];

  const slugValidation = useEnhancedAsyncFieldValidation<string>(
    slugValidators,
    '',
    {
      timeout: 10000,
      maxRetries: 3,
      retryDelay: 1500,
      exponentialBackoff: true,
      debounceMs: 600
    }
  );

  const progressTracking = useAsyncValidationProgress(
    slugValidation.isValidating,
    6000 // Estimated 6 seconds for slug validation
  );

  const retryConfig = useAsyncValidationRetry(
    async () => {
      if (slugValidation.value) {
        slugValidation.setValue(slugValidation.value);
      }
    },
    3
  );

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Room Name Validation</h2>
      
      <AsyncValidationField
        label="Room Name"
        required={true}
        validationState={{
          isValidating: slugValidation.isValidating,
          error: slugValidation.error,
          isTouched: slugValidation.isTouched,
          isValid: slugValidation.isValid
        }}
        retryConfig={{
          isRecoverable: slugValidation.canRetry,
          onRetry: retryConfig.retry,
          isRetrying: retryConfig.isRetrying,
          retryAttempts: slugValidation.retryAttempts
        }}
        progressConfig={{
          progress: progressTracking.progress,
          estimatedTimeRemaining: progressTracking.estimatedTimeRemaining,
          showProgress: true
        }}
        helpText="Enter a unique name for your room"
      >
        <input
          type="text"
          value={slugValidation.value || ''}
          onInput={(e) => slugValidation.setValue((e.target as HTMLInputElement).value)}
          onBlur={() => slugValidation.touch()}
          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
          placeholder="Enter room name"
        />
      </AsyncValidationField>

      <div className="mt-4 flex space-x-2">
        <button
          onClick={() => slugValidation.cancelValidation()}
          disabled={!slugValidation.isValidating}
          className="px-3 py-1 text-sm bg-gray-500 text-white rounded disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={() => slugValidation.reset()}
          className="px-3 py-1 text-sm bg-blue-500 text-white rounded"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Example: File Upload with Async Validation
// ============================================================================

export function FileUploadValidationExample(): JSX.Element {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fileValidators: SerializableValidator[] = [
    { type: 'required' },
    { type: 'fileSize', params: { max: 50 * 1024 * 1024 } }, // 50MB
    { type: 'fileType', params: { types: ['audio/mpeg', 'audio/ogg', 'audio/webm'] } },
    { type: 'asyncFile', async: true }
  ];

  const fileValidation = useEnhancedAsyncFieldValidation<File>(
    fileValidators,
    undefined,
    {
      timeout: 30000, // 30 seconds for file processing
      maxRetries: 1,
      retryDelay: 2000,
      exponentialBackoff: false,
      debounceMs: 1000
    }
  );

  const progressTracking = useAsyncValidationProgress(
    fileValidation.isValidating,
    15000 // Estimated 15 seconds for file validation
  );

  const handleFileChange = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    setSelectedFile(file || null);
    if (file) {
      fileValidation.setValue(file);
    } else {
      fileValidation.reset();
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Audio File Upload</h2>
      
      <AsyncValidationField
        label="Audio File"
        required={true}
        validationState={{
          isValidating: fileValidation.isValidating,
          error: fileValidation.error,
          isTouched: fileValidation.isTouched,
          isValid: fileValidation.isValid
        }}
        retryConfig={{
          isRecoverable: fileValidation.canRetry,
          onRetry: () => {
            if (selectedFile) {
              fileValidation.setValue(selectedFile);
            }
          },
          isRetrying: false,
          retryAttempts: fileValidation.retryAttempts
        }}
        progressConfig={{
          progress: progressTracking.progress,
          estimatedTimeRemaining: progressTracking.estimatedTimeRemaining,
          showProgress: true
        }}
        helpText="Upload an audio file (MP3, OGG, or WebM, max 50MB)"
      >
        <input
          type="file"
          accept="audio/mpeg,audio/ogg,audio/webm"
          onChange={handleFileChange}
          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
        />
      </AsyncValidationField>

      {selectedFile && (
        <div className="mt-4 p-3 bg-gray-50 rounded">
          <h4 className="font-medium text-sm mb-2">File Info:</h4>
          <ul className="text-xs space-y-1">
            <li>Name: {selectedFile.name}</li>
            <li>Size: {Math.round(selectedFile.size / 1024)} KB</li>
            <li>Type: {selectedFile.type}</li>
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Combined Example Component
// ============================================================================

export function AsyncValidationExamples(): JSX.Element {
  const [activeExample, setActiveExample] = useState<'email' | 'slug' | 'file'>('email');

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8">
          Async Validation Examples
        </h1>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-lg p-1 shadow-md">
            <button
              onClick={() => setActiveExample('email')}
              className={`px-4 py-2 rounded-md transition-colors ${
                activeExample === 'email'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Email Validation
            </button>
            <button
              onClick={() => setActiveExample('slug')}
              className={`px-4 py-2 rounded-md transition-colors ${
                activeExample === 'slug'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Room Name
            </button>
            <button
              onClick={() => setActiveExample('file')}
              className={`px-4 py-2 rounded-md transition-colors ${
                activeExample === 'file'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              File Upload
            </button>
          </div>
        </div>

        {/* Example Content */}
        <div className="flex justify-center">
          {activeExample === 'email' && <EmailValidationExample />}
          {activeExample === 'slug' && <RoomSlugValidationExample />}
          {activeExample === 'file' && <FileUploadValidationExample />}
        </div>

        {/* Documentation */}
        <div className="mt-12 max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Features Demonstrated</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start">
              <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
              <span><strong>Debounced Validation:</strong> Validation is triggered after user stops typing</span>
            </li>
            <li className="flex items-start">
              <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
              <span><strong>Loading States:</strong> Visual feedback during async operations</span>
            </li>
            <li className="flex items-start">
              <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
              <span><strong>Progress Tracking:</strong> Progress bars for long-running validations</span>
            </li>
            <li className="flex items-start">
              <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
              <span><strong>Error Recovery:</strong> Retry mechanisms with exponential backoff</span>
            </li>
            <li className="flex items-start">
              <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
              <span><strong>Timeout Handling:</strong> Graceful handling of slow network requests</span>
            </li>
            <li className="flex items-start">
              <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
              <span><strong>Cancellation:</strong> Ability to cancel ongoing validations</span>
            </li>
            <li className="flex items-start">
              <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
              <span><strong>Visual Feedback:</strong> Success/error states with appropriate styling</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}