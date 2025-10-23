// ============================================================================
// Async Validation UI Components
// SimplyCaster Centralized Form Validation System
// ============================================================================

/** @jsx h */
/** @jsxFrag Fragment */
import { h, JSX, Fragment } from "preact";
import { signal, computed } from "@preact/signals";
import { useEffect, useMemo } from "preact/hooks";

// ============================================================================
// Loading Indicator Components
// ============================================================================

/**
 * Props for async validation loading indicator
 */
export interface AsyncValidationLoadingProps {
  /** Whether validation is currently running */
  isValidating: boolean;
  /** Custom loading message */
  message?: string;
  /** Size of the loading indicator */
  size?: 'small' | 'medium' | 'large';
  /** Position relative to the field */
  position?: 'inline' | 'overlay' | 'below';
  /** Custom CSS classes */
  className?: string;
}

/**
 * Loading indicator for async validation
 */
export function AsyncValidationLoading({
  isValidating,
  message = "Validating...",
  size = 'small',
  position = 'inline',
  className = ''
}: AsyncValidationLoadingProps): JSX.Element | null {
  if (!isValidating) return null;

  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-6 h-6',
    large: 'w-8 h-8'
  };

  const positionClasses = {
    inline: 'inline-flex items-center ml-2',
    overlay: 'absolute inset-y-0 right-0 flex items-center pr-3',
    below: 'flex items-center mt-1'
  };

  return (
    <div className={`${positionClasses[position]} ${className}`}>
      <svg
        className={`animate-spin ${sizeClasses[size]} text-blue-500`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {message && (
        <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
          {message}
        </span>
      )}
    </div>
  );
}

/**
 * Progress bar for long-running async validations
 */
export interface AsyncValidationProgressProps {
  /** Whether validation is running */
  isValidating: boolean;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Estimated time remaining in seconds */
  estimatedTimeRemaining?: number;
  /** Custom message */
  message?: string;
  /** Show time remaining */
  showTimeRemaining?: boolean;
  /** Custom CSS classes */
  className?: string;
}

export function AsyncValidationProgress({
  isValidating,
  progress,
  estimatedTimeRemaining,
  message = "Processing...",
  showTimeRemaining = true,
  className = ''
}: AsyncValidationProgressProps): JSX.Element | null {
  if (!isValidating) return null;

  const progressValue = progress ?? 0;
  const isIndeterminate = progress === undefined;

  const formatTimeRemaining = (seconds: number): string => {
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${Math.ceil(remainingSeconds)}s`;
  };

  return (
    <div className={`w-full ${className}`}>
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {message}
        </span>
        {showTimeRemaining && estimatedTimeRemaining && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            ~{formatTimeRemaining(estimatedTimeRemaining)}
          </span>
        )}
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${
            isIndeterminate 
              ? 'bg-blue-500 animate-pulse' 
              : 'bg-blue-600'
          }`}
          style={{ 
            width: isIndeterminate ? '100%' : `${Math.min(100, Math.max(0, progressValue))}%` 
          }}
        />
      </div>
      {!isIndeterminate && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {Math.round(progressValue)}% complete
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Error Recovery Components
// ============================================================================

/**
 * Props for async validation error recovery
 */
export interface AsyncValidationErrorProps {
  /** Error message */
  error?: string;
  /** Whether the error is recoverable */
  isRecoverable?: boolean;
  /** Retry function */
  onRetry?: () => void;
  /** Whether retry is in progress */
  isRetrying?: boolean;
  /** Number of retry attempts made */
  retryAttempts?: number;
  /** Maximum retry attempts allowed */
  maxRetryAttempts?: number;
  /** Custom CSS classes */
  className?: string;
}

/**
 * Error recovery component for failed async validations
 */
export function AsyncValidationError({
  error,
  isRecoverable = true,
  onRetry,
  isRetrying = false,
  retryAttempts = 0,
  maxRetryAttempts = 3,
  className = ''
}: AsyncValidationErrorProps): JSX.Element | null {
  if (!error) return null;

  const canRetry = isRecoverable && onRetry && retryAttempts < maxRetryAttempts;

  return (
    <div className={`rounded-md bg-red-50 p-4 dark:bg-red-900/20 ${className}`}>
      <div className="flex">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-red-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
            Validation Error
          </h3>
          <div className="mt-2 text-sm text-red-700 dark:text-red-300">
            <p>{error}</p>
          </div>
          {canRetry && (
            <div className="mt-4">
              <div className="flex">
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={isRetrying}
                  className="bg-red-100 px-2 py-1.5 rounded-md text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-red-800/30 dark:text-red-200 dark:hover:bg-red-800/50"
                >
                  {isRetrying ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-red-800 dark:text-red-200 inline" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                      </svg>
                      Retrying...
                    </>
                  ) : (
                    `Try Again${retryAttempts > 0 ? ` (${retryAttempts}/${maxRetryAttempts})` : ''}`
                  )}
                </button>
              </div>
            </div>
          )}
          {!canRetry && retryAttempts >= maxRetryAttempts && (
            <div className="mt-2 text-xs text-red-600 dark:text-red-400">
              Maximum retry attempts reached. Please try again later.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Composite Async Validation Status Component
// ============================================================================

/**
 * Props for comprehensive async validation status
 */
export interface AsyncValidationStatusProps {
  /** Whether validation is running */
  isValidating: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Whether the field has been touched */
  isTouched?: boolean;
  /** Whether the validation error is recoverable */
  isRecoverable?: boolean;
  /** Retry function */
  onRetry?: () => void;
  /** Whether retry is in progress */
  isRetrying?: boolean;
  /** Number of retry attempts */
  retryAttempts?: number;
  /** Progress percentage for long operations */
  progress?: number;
  /** Estimated time remaining */
  estimatedTimeRemaining?: number;
  /** Custom loading message */
  loadingMessage?: string;
  /** Show progress bar for long operations */
  showProgress?: boolean;
  /** Position of status indicators */
  position?: 'inline' | 'below';
  /** Custom CSS classes */
  className?: string;
}

/**
 * Comprehensive async validation status component
 */
export function AsyncValidationStatus({
  isValidating,
  error,
  isTouched = true,
  isRecoverable = true,
  onRetry,
  isRetrying = false,
  retryAttempts = 0,
  progress,
  estimatedTimeRemaining,
  loadingMessage,
  showProgress = false,
  position = 'below',
  className = ''
}: AsyncValidationStatusProps): JSX.Element | null {
  // Don't show anything if field hasn't been touched
  if (!isTouched) return null;

  const containerClasses = position === 'inline' ? 'inline-flex items-center' : 'mt-1';

  return (
    <div className={`${containerClasses} ${className}`}>
      {isValidating && (
        <>
          {showProgress && (progress !== undefined || estimatedTimeRemaining !== undefined) ? (
            <AsyncValidationProgress
              isValidating={isValidating}
              progress={progress}
              estimatedTimeRemaining={estimatedTimeRemaining}
              message={loadingMessage}
            />
          ) : (
            <AsyncValidationLoading
              isValidating={isValidating}
              message={loadingMessage}
              position={position === 'inline' ? 'inline' : 'below'}
            />
          )}
        </>
      )}
      
      {!isValidating && error && (
        <AsyncValidationError
          error={error}
          isRecoverable={isRecoverable}
          onRetry={onRetry}
          isRetrying={isRetrying}
          retryAttempts={retryAttempts}
        />
      )}
    </div>
  );
}

// ============================================================================
// Async Validation Field Wrapper
// ============================================================================

/**
 * Props for async validation field wrapper
 */
export interface AsyncValidationFieldProps {
  /** Field input element */
  children: JSX.Element;
  /** Field label */
  label?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Async validation state */
  validationState: {
    isValidating: boolean;
    error?: string;
    isTouched: boolean;
    isValid: boolean;
  };
  /** Retry configuration */
  retryConfig?: {
    isRecoverable: boolean;
    onRetry: () => void;
    isRetrying: boolean;
    retryAttempts: number;
  };
  /** Progress configuration for long operations */
  progressConfig?: {
    progress?: number;
    estimatedTimeRemaining?: number;
    showProgress: boolean;
  };
  /** Help text */
  helpText?: string;
  /** Custom CSS classes */
  className?: string;
}

/**
 * Complete async validation field wrapper with label, input, and status
 */
export function AsyncValidationField({
  children,
  label,
  required = false,
  validationState,
  retryConfig,
  progressConfig,
  helpText,
  className = ''
}: AsyncValidationFieldProps): JSX.Element {
  const { isValidating, error, isTouched, isValid } = validationState;

  // Determine field state classes
  const fieldStateClasses = useMemo(() => {
    if (isValidating) return 'border-blue-300 focus:border-blue-500 focus:ring-blue-500';
    if (error && isTouched) return 'border-red-300 focus:border-red-500 focus:ring-red-500';
    if (isValid && isTouched) return 'border-green-300 focus:border-green-500 focus:ring-green-500';
    return 'border-gray-300 focus:border-blue-500 focus:ring-blue-500';
  }, [isValidating, error, isTouched, isValid]);

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        {/* Clone the input element and add validation classes */}
        <div className={`${fieldStateClasses}`}>
          {children}
        </div>
        
        {/* Inline loading indicator for overlay position */}
        {isValidating && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            <AsyncValidationLoading
              isValidating={true}
              position="inline"
              size="small"
            />
          </div>
        )}
        
        {/* Success indicator */}
        {isValid && isTouched && !isValidating && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            <svg className="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Status indicators below field */}
      <AsyncValidationStatus
        isValidating={isValidating}
        error={error}
        isTouched={isTouched}
        isRecoverable={retryConfig?.isRecoverable}
        onRetry={retryConfig?.onRetry}
        isRetrying={retryConfig?.isRetrying}
        retryAttempts={retryConfig?.retryAttempts}
        progress={progressConfig?.progress}
        estimatedTimeRemaining={progressConfig?.estimatedTimeRemaining}
        showProgress={progressConfig?.showProgress || false}
        position="below"
      />

      {/* Help text */}
      {helpText && !error && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {helpText}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Utility Hooks for Progress Tracking
// ============================================================================

/**
 * Hook for tracking async validation progress
 */
export function useAsyncValidationProgress(
  isValidating: boolean,
  estimatedDuration: number = 5000
) {
  const progress = signal(0);
  const startTime = signal<number>(0);
  const estimatedTimeRemaining = signal<number>(0);

  useEffect(() => {
    if (!isValidating) {
      progress.value = 0;
      estimatedTimeRemaining.value = 0;
      return;
    }

    startTime.value = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime.value;
      const progressPercent = Math.min(95, (elapsed / estimatedDuration) * 100);
      progress.value = progressPercent;
      
      const remaining = Math.max(0, estimatedDuration - elapsed);
      estimatedTimeRemaining.value = Math.ceil(remaining / 1000);
    }, 100);

    return () => clearInterval(interval);
  }, [isValidating, estimatedDuration]);

  return {
    progress: progress.value,
    estimatedTimeRemaining: estimatedTimeRemaining.value
  };
}

/**
 * Hook for managing async validation retry logic
 */
export function useAsyncValidationRetry(
  validationFn: () => Promise<void>,
  maxRetries: number = 3
) {
  const retryAttempts = signal(0);
  const isRetrying = signal(false);

  const retry = async () => {
    if (retryAttempts.value >= maxRetries) return;
    
    isRetrying.value = true;
    retryAttempts.value += 1;
    
    try {
      await validationFn();
    } catch (error) {
      console.error('Retry failed:', error);
    } finally {
      isRetrying.value = false;
    }
  };

  const reset = () => {
    retryAttempts.value = 0;
    isRetrying.value = false;
  };

  return {
    retry,
    reset,
    retryAttempts: retryAttempts.value,
    isRetrying: isRetrying.value,
    canRetry: retryAttempts.value < maxRetries
  };
}