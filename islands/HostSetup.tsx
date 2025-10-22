// Host setup island for completing host account creation
import { signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import { ErrorDialog } from "../components/ErrorDialog.tsx";
import { getCopy } from "../lib/copy.ts";

export interface HostSetupProps {
  token: string;
  email: string | null;
}

interface HostSetupInfo {
  email: string;
  name?: string;
  permissions: {
    canCreateRooms: boolean;
    canManageRecordings: boolean;
    canInviteGuests: boolean;
  };
  invitedBy: string;
  createdAt: string;
}

interface SetupFormData {
  name: string;
  password: string;
  confirmPassword: string;
}

// Signals for setup state
const setupInfo = signal<HostSetupInfo | null>(null);
const isLoading = signal(true);
const error = signal<string | null>(null);
const isSubmitting = signal(false);

export default function HostSetup({
  token,
  email,
}: HostSetupProps) {
  const [formData, setFormData] = useState<SetupFormData>({
    name: "",
    password: "",
    confirmPassword: "",
  });

  const [formErrors, setFormErrors] = useState<{
    name?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  useEffect(() => {
    validateSetupToken();
  }, [token]);

  const validateSetupToken = async () => {
    isLoading.value = true;
    error.value = null;

    try {
      // TODO: Implement actual API call to validate setup token
      const response = await fetch(`/api/hosts/validate-setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, email }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(getCopy("hostSetup.errors.invalidOrExpired"));
        }
        if (response.status === 410) {
          throw new Error(getCopy("hostSetup.errors.expired"));
        }
        if (response.status === 409) {
          throw new Error(getCopy("hostSetup.errors.alreadySetup"));
        }
        throw new Error(getCopy("hostSetup.errors.failedToValidate"));
      }

      const data = await response.json();
      setupInfo.value = data.setup;

      // Pre-fill name if available
      if (data.setup.name) {
        setFormData(prev => ({ ...prev, name: data.setup.name }));
      }
    } catch (err) {
      console.error("Failed to validate setup token:", err);
      error.value = err instanceof Error ? err.message : getCopy("hostSetup.errors.failedToValidate");
    } finally {
      isLoading.value = false;
    }
  };

  const validateForm = (): boolean => {
    const errors: typeof formErrors = {};

    // Validate name
    if (!formData.name.trim()) {
      errors.name = getCopy("hostSetup.errors.nameRequired");
    } else if (formData.name.trim().length < 2) {
      errors.name = getCopy("hostSetup.errors.nameMinLength");
    } else if (formData.name.trim().length > 50) {
      errors.name = getCopy("hostSetup.errors.nameMaxLength");
    }

    // Validate password
    if (!formData.password) {
      errors.password = getCopy("hostSetup.errors.passwordRequired");
    } else if (formData.password.length < 8) {
      errors.password = getCopy("hostSetup.errors.passwordMinLength");
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      errors.password = getCopy("hostSetup.errors.passwordComplexity");
    }

    // Validate confirm password
    if (!formData.confirmPassword) {
      errors.confirmPassword = getCopy("hostSetup.errors.confirmPasswordRequired");
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = getCopy("hostSetup.errors.passwordsDoNotMatch");
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (field: keyof SetupFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear specific field error when user starts typing
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();

    if (!validateForm()) return;
    if (!setupInfo.value) return;

    isSubmitting.value = true;
    error.value = null;

    try {
      // TODO: Implement actual API call to complete host setup
      const response = await fetch(`/api/hosts/complete-setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          name: formData.name.trim(),
          password: formData.password,
        }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Setup link is no longer valid");
        }
        if (response.status === 409) {
          throw new Error("This account has already been set up");
        }
        throw new Error(getCopy("hostSetup.errors.failedToComplete"));
      }

      const data = await response.json();

      // Redirect to dashboard with success message
      globalThis.location.href = `/dashboard?setup=complete&welcome=${encodeURIComponent(formData.name)}`;
    } catch (err) {
      console.error("Failed to complete setup:", err);
      error.value = err instanceof Error ? err.message : getCopy("hostSetup.errors.failedToComplete");
    } finally {
      isSubmitting.value = false;
    }
  };

  if (isLoading.value) {
    return (
      <div class="setup-loading">
        <div class="loading-container">
          <div class="loading-spinner"></div>
          <h2>{getCopy("hostSetup.validatingSetup")}</h2>
          <p>{getCopy("hostSetup.validatingMessage")}</p>
        </div>
      </div>
    );
  }

  if (error.value || !setupInfo.value) {
    return (
      <div class="setup-error">
        <div class="error-container">
          <div class="error-icon">❌</div>
          <h2>{getCopy("hostSetup.invalidSetup")}</h2>
          <p>{error.value || getCopy("hostSetup.invalidMessage")}</p>
          <div class="error-actions">
            <a href="/login" class="login-link">
              {getCopy("hostSetup.goToLogin")}
            </a>
          </div>
        </div>
      </div>
    );
  }

  const setup = setupInfo.value;

  return (
    <div class="setup-valid">
      <div class="setup-container">
        <div class="setup-header">
          <div class="setup-icon">🎯</div>
          <h1>{getCopy("hostSetup.title")}</h1>
          <p class="setup-subtitle">
            {getCopy("hostSetup.subtitle")}
          </p>
        </div>

        <div class="setup-info">
          <div class="info-card">
            <h3>Account Information</h3>
            <div class="info-details">
              <div class="detail-item">
                <span class="detail-label">Email:</span>
                <span class="detail-value">{setup.email}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Invited by:</span>
                <span class="detail-value">{setup.invitedBy}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Role:</span>
                <span class="detail-value role-host">Host</span>
              </div>
            </div>

            <div class="permissions-info">
              <h4>Your Permissions</h4>
              <div class="permissions-list">
                {setup.permissions.canCreateRooms && (
                  <div class="permission-item">
                    <span class="permission-icon">✅</span>
                    Create and manage rooms
                  </div>
                )}
                {setup.permissions.canManageRecordings && (
                  <div class="permission-item">
                    <span class="permission-icon">✅</span>
                    Access and manage recordings
                  </div>
                )}
                {setup.permissions.canInviteGuests && (
                  <div class="permission-item">
                    <span class="permission-icon">✅</span>
                    Invite guests to rooms
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} class="setup-form">
          <div class="form-group">
            <label for="host-name" class="form-label">
              Full Name *
            </label>
            <input
              id="host-name"
              type="text"
              value={formData.name}
              onInput={(e) =>
                handleInputChange('name', (e.target as HTMLInputElement).value)
              }
              class={`form-input ${formErrors.name ? 'error' : ''}`}
              placeholder="Enter your full name"
              maxLength={50}
              disabled={isSubmitting.value}
            />
            {formErrors.name && (
              <div class="field-error">{formErrors.name}</div>
            )}
          </div>

          <div class="form-group">
            <label for="host-password" class="form-label">
              Password *
            </label>
            <input
              id="host-password"
              type="password"
              value={formData.password}
              onInput={(e) =>
                handleInputChange('password', (e.target as HTMLInputElement).value)
              }
              class={`form-input ${formErrors.password ? 'error' : ''}`}
              placeholder="Create a secure password"
              disabled={isSubmitting.value}
            />
            {formErrors.password && (
              <div class="field-error">{formErrors.password}</div>
            )}
            <div class="field-help">
              Password must be at least 8 characters with uppercase, lowercase, and numbers
            </div>
          </div>

          <div class="form-group">
            <label for="confirm-password" class="form-label">
              Confirm Password *
            </label>
            <input
              id="confirm-password"
              type="password"
              value={formData.confirmPassword}
              onInput={(e) =>
                handleInputChange('confirmPassword', (e.target as HTMLInputElement).value)
              }
              class={`form-input ${formErrors.confirmPassword ? 'error' : ''}`}
              placeholder="Confirm your password"
              disabled={isSubmitting.value}
            />
            {formErrors.confirmPassword && (
              <div class="field-error">{formErrors.confirmPassword}</div>
            )}
          </div>

          <div class="setup-actions">
            <button
              type="submit"
              class="setup-btn"
              disabled={isSubmitting.value || Object.keys(formErrors).length > 0}
            >
              {isSubmitting.value ? "Setting Up Account..." : "Complete Setup"}
            </button>
          </div>
        </form>

        <div class="setup-footer">
          <div class="footer-info">
            <p>
              By completing this setup, you agree to SimplyCaster's terms of service
              and will have access to create and manage podcast recording rooms.
            </p>
          </div>
        </div>
      </div>

      {/* Error Dialog */}
      <ErrorDialog
        isOpen={!!error.value}
        message={error.value || ""}
        onClose={() => error.value = null}
      />
    </div>
  );
}