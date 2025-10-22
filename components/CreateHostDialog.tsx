// Create host dialog component
import { useEffect, useRef, useState } from "preact/hooks";
import { getCopy } from "../lib/copy.ts";

export interface CreateHostFormData {
  email: string;
  name: string;
  permissions: {
    canCreateRooms: boolean;
    canManageRecordings: boolean;
    canInviteGuests: boolean;
  };
}

export interface CreateHostDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (formData: CreateHostFormData) => Promise<void>;
  isCreating: boolean;
}

export function CreateHostDialog({
  isOpen,
  onClose,
  onCreate,
  isCreating,
}: CreateHostDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  
  const [formData, setFormData] = useState<CreateHostFormData>({
    email: "",
    name: "",
    permissions: {
      canCreateRooms: true,
      canManageRecordings: true,
      canInviteGuests: true,
    },
  });
  
  const [emailError, setEmailError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      dialog.showModal();
    } else {
      dialog.close();
      // Reset form when dialog closes
      setFormData({
        email: "",
        name: "",
        permissions: {
          canCreateRooms: true,
          canManageRecordings: true,
          canInviteGuests: true,
        },
      });
      setEmailError(null);
      setNameError(null);
    }
  }, [isOpen]);

  const validateEmail = (email: string): string | null => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!email.trim()) {
      return "Email is required";
    }
    
    if (!emailRegex.test(email)) {
      return "Please enter a valid email address";
    }
    
    return null;
  };

  const validateName = (name: string): string | null => {
    if (!name.trim()) {
      return "Name is required";
    }
    
    if (name.trim().length < 2) {
      return "Name must be at least 2 characters";
    }
    
    return null;
  };

  const handleEmailChange = (email: string) => {
    setFormData(prev => ({ ...prev, email }));
    setEmailError(null);
  };

  const handleNameChange = (name: string) => {
    setFormData(prev => ({ ...prev, name }));
    setNameError(null);
  };

  const handlePermissionChange = (permission: keyof CreateHostFormData['permissions'], value: boolean) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [permission]: value,
      },
    }));
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    
    const emailValidationError = validateEmail(formData.email);
    const nameValidationError = validateName(formData.name);
    
    if (emailValidationError) {
      setEmailError(emailValidationError);
    }
    
    if (nameValidationError) {
      setNameError(nameValidationError);
    }
    
    if (emailValidationError || nameValidationError) {
      return;
    }

    try {
      await onCreate(formData);
      onClose();
    } catch (error) {
      console.error("Host creation failed:", error);
    }
  };

  const handleClose = (event: Event) => {
    const dialog = event.target as HTMLDialogElement;
    if (event.type === "close" || dialog === event.target) {
      onClose();
    }
  };

  return (
    <dialog ref={dialogRef} class="create-host-dialog" onClose={handleClose}>
      <div class="create-host-content">
        <div class="create-host-header">
          <h3>{getCopy("crew.createHostDialog.title")}</h3>
          <button
            type="button"
            onClick={onClose}
            class="dialog-close-btn"
            aria-label="Close dialog"
            disabled={isCreating}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} class="create-host-form">
          <div class="create-host-body">
            <div class="form-group">
              <label for="host-email" class="form-label">
                Email Address *
              </label>
              <input
                id="host-email"
                type="email"
                value={formData.email}
                onInput={(e) =>
                  handleEmailChange((e.target as HTMLInputElement).value)
                }
                class={`form-input ${emailError ? 'error' : ''}`}
                placeholder="host@example.com"
                required
                disabled={isCreating}
              />
              {emailError && (
                <div class="field-error">{emailError}</div>
              )}
            </div>

            <div class="form-group">
              <label for="host-name" class="form-label">
                Full Name *
              </label>
              <input
                id="host-name"
                type="text"
                value={formData.name}
                onInput={(e) =>
                  handleNameChange((e.target as HTMLInputElement).value)
                }
                class={`form-input ${nameError ? 'error' : ''}`}
                placeholder="John Doe"
                required
                disabled={isCreating}
              />
              {nameError && (
                <div class="field-error">{nameError}</div>
              )}
            </div>

            <div class="permissions-section">
              <h4>Host Permissions</h4>
              <div class="permissions-grid">
                <label class="permission-item">
                  <input
                    type="checkbox"
                    checked={formData.permissions.canCreateRooms}
                    onChange={(e) =>
                      handlePermissionChange('canCreateRooms', (e.target as HTMLInputElement).checked)
                    }
                    class="permission-checkbox"
                    disabled={isCreating}
                  />
                  <div class="permission-info">
                    <div class="permission-title">Create Rooms</div>
                    <div class="permission-description">
                      Allow host to create and manage their own rooms
                    </div>
                  </div>
                </label>

                <label class="permission-item">
                  <input
                    type="checkbox"
                    checked={formData.permissions.canManageRecordings}
                    onChange={(e) =>
                      handlePermissionChange('canManageRecordings', (e.target as HTMLInputElement).checked)
                    }
                    class="permission-checkbox"
                    disabled={isCreating}
                  />
                  <div class="permission-info">
                    <div class="permission-title">Manage Recordings</div>
                    <div class="permission-description">
                      Allow host to access and manage their room recordings
                    </div>
                  </div>
                </label>

                <label class="permission-item">
                  <input
                    type="checkbox"
                    checked={formData.permissions.canInviteGuests}
                    onChange={(e) =>
                      handlePermissionChange('canInviteGuests', (e.target as HTMLInputElement).checked)
                    }
                    class="permission-checkbox"
                    disabled={isCreating}
                  />
                  <div class="permission-info">
                    <div class="permission-title">Invite Guests</div>
                    <div class="permission-description">
                      Allow host to invite guests to their rooms
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div class="create-info">
              <div class="info-icon">ℹ️</div>
              <div class="info-text">
                <p>
                  The new host will receive an email with instructions to complete their account setup. 
                  They will need to create a password and verify their email address.
                </p>
                <p>
                  Host permissions can be modified later from the crew management page.
                </p>
              </div>
            </div>
          </div>

          <div class="create-host-actions">
            <button
              type="button"
              onClick={onClose}
              class="cancel-btn"
              disabled={isCreating}
            >
              {getCopy("common.cancel")}
            </button>
            
            <button
              type="submit"
              class="create-submit-btn"
              disabled={!formData.email.trim() || !formData.name.trim() || isCreating || !!emailError || !!nameError}
            >
              {isCreating ? "Creating Host..." : "Create Host"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}