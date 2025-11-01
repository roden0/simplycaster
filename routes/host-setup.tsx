// ============================================================================
// Host Setup Page
// ============================================================================

import { Handlers, PageProps } from "$fresh/server.ts";
import { Head } from "$fresh/runtime.ts";

interface HostSetupData {
  token?: string;
  error?: string;
  invitation?: {
    email: string;
    role: string;
    expiresAt: string;
  };
}

export const handler: Handlers<HostSetupData> = {
  async GET(req, ctx) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return ctx.render({
        error: "Invalid invitation link. Please check your email for the correct link."
      });
    }

    // Validate token with API
    try {
      const baseUrl = Deno.env.get("BASE_URL") || `${url.protocol}//${url.host}`;
      const validateUrl = `${baseUrl}/api/auth/validate-invitation-token?token=${encodeURIComponent(token)}`;
      
      const response = await fetch(validateUrl);
      const result = await response.json();

      if (!result.valid) {
        return ctx.render({
          error: result.error || "Invalid or expired invitation"
        });
      }

      return ctx.render({
        token,
        invitation: result.data
      });

    } catch (error) {
      console.error("Error validating invitation token:", error);
      return ctx.render({
        error: "Unable to validate invitation. Please try again later."
      });
    }
  }
};

export default function HostSetupPage({ data }: PageProps<HostSetupData>) {
  if (data.error) {
    return (
      <>
        <Head>
          <title>Invalid Invitation - SimplyCaster</title>
        </Head>
        <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          <div class="sm:mx-auto sm:w-full sm:max-w-md">
            <div class="text-center">
              <h1 class="text-3xl font-bold text-gray-900 mb-2">SimplyCaster</h1>
              <div class="bg-red-50 border border-red-200 rounded-md p-4">
                <div class="flex">
                  <div class="flex-shrink-0">
                    <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                    </svg>
                  </div>
                  <div class="ml-3">
                    <h3 class="text-sm font-medium text-red-800">
                      Invitation Error
                    </h3>
                    <div class="mt-2 text-sm text-red-700">
                      <p>{data.error}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Complete Your Host Setup - SimplyCaster</title>
      </Head>
      <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div class="sm:mx-auto sm:w-full sm:max-w-md">
          <div class="text-center">
            <h1 class="text-3xl font-bold text-blue-600 mb-2">SimplyCaster</h1>
            <h2 class="text-xl font-semibold text-gray-900 mb-6">Complete Your Host Setup</h2>
          </div>

          <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            {data.invitation && (
              <div class="mb-6 bg-blue-50 border border-blue-200 rounded-md p-4">
                <div class="flex">
                  <div class="flex-shrink-0">
                    <svg class="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                    </svg>
                  </div>
                  <div class="ml-3">
                    <h3 class="text-sm font-medium text-blue-800">
                      Welcome to SimplyCaster!
                    </h3>
                    <div class="mt-2 text-sm text-blue-700">
                      <p>You've been invited as a <strong>{data.invitation.role}</strong> for <strong>{data.invitation.email}</strong></p>
                      <p class="mt-1">Complete your setup to start using SimplyCaster.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <form id="setup-form" class="space-y-6">
              <input type="hidden" name="token" value={data.token} />
              
              <div>
                <label for="name" class="block text-sm font-medium text-gray-700">
                  Full Name (Optional)
                </label>
                <div class="mt-1">
                  <input
                    id="name"
                    name="name"
                    type="text"
                    class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Enter your full name"
                  />
                </div>
              </div>

              <div>
                <label for="password" class="block text-sm font-medium text-gray-700">
                  Password *
                </label>
                <div class="mt-1">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Create a secure password"
                  />
                </div>
                <p class="mt-1 text-xs text-gray-500">
                  Must be at least 8 characters with uppercase, lowercase, number, and special character
                </p>
              </div>

              <div>
                <label for="confirmPassword" class="block text-sm font-medium text-gray-700">
                  Confirm Password *
                </label>
                <div class="mt-1">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Confirm your password"
                  />
                </div>
              </div>

              <div id="error-message" class="hidden bg-red-50 border border-red-200 rounded-md p-4">
                <div class="flex">
                  <div class="flex-shrink-0">
                    <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                    </svg>
                  </div>
                  <div class="ml-3">
                    <h3 class="text-sm font-medium text-red-800">Setup Error</h3>
                    <div class="mt-2 text-sm text-red-700">
                      <p id="error-text"></p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  id="submit-button"
                  class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Complete Setup
                </button>
              </div>
            </form>

            <div class="mt-6 text-center">
              <p class="text-xs text-gray-500">
                By completing setup, you agree to SimplyCaster's terms of service and privacy policy.
              </p>
            </div>
          </div>
        </div>
      </div>

      <script>
        {`
          document.getElementById('setup-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitButton = document.getElementById('submit-button');
            const errorMessage = document.getElementById('error-message');
            const errorText = document.getElementById('error-text');
            
            // Hide previous errors
            errorMessage.classList.add('hidden');
            
            // Disable submit button
            submitButton.disabled = true;
            submitButton.textContent = 'Setting up...';
            
            try {
              const formData = new FormData(e.target);
              const data = {
                token: formData.get('token'),
                name: formData.get('name'),
                password: formData.get('password'),
                confirmPassword: formData.get('confirmPassword')
              };
              
              const response = await fetch('/api/auth/complete-host-setup', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
              });
              
              const result = await response.json();
              
              if (result.success) {
                // Redirect to login page with success message
                window.location.href = '/?setup=complete';
              } else {
                // Show error
                errorText.textContent = result.error || 'Setup failed. Please try again.';
                errorMessage.classList.remove('hidden');
              }
            } catch (error) {
              console.error('Setup error:', error);
              errorText.textContent = 'Network error. Please check your connection and try again.';
              errorMessage.classList.remove('hidden');
            } finally {
              // Re-enable submit button
              submitButton.disabled = false;
              submitButton.textContent = 'Complete Setup';
            }
          });
        `}
      </script>
    </>
  );
}