/**
 * Reset Password Page
 * 
 * Allows users to reset their password using a valid reset token.
 */

import { Handlers, PageProps } from "$fresh/server.ts";
import { Head } from "$fresh/runtime.ts";

interface ResetPasswordData {
  tokenId?: string;
  token?: string;
  tokenValid?: boolean;
  tokenError?: string;
  success?: boolean;
  message?: string;
  error?: string;
  timeRemaining?: number;
  expiresAt?: string;
}

export const handler: Handlers<ResetPasswordData> = {
  async GET(req, ctx) {
    const url = new URL(req.url);
    const tokenId = url.searchParams.get("id");
    const token = url.searchParams.get("token");

    if (!tokenId || !token) {
      return ctx.render({
        tokenValid: false,
        tokenError: "Invalid or missing reset token. Please request a new password reset."
      });
    }

    try {
      // Validate the token
      const response = await fetch(`${req.url.split('/reset-password')[0]}/api/auth/validate-reset-token?tokenId=${tokenId}&token=${token}`);
      const result = await response.json();

      if (result.valid) {
        return ctx.render({
          tokenId,
          token,
          tokenValid: true,
          timeRemaining: result.timeRemaining,
          expiresAt: result.expiresAt
        });
      } else {
        return ctx.render({
          tokenValid: false,
          tokenError: result.error || "Invalid or expired reset token"
        });
      }
    } catch (error) {
      return ctx.render({
        tokenValid: false,
        tokenError: "Unable to validate reset token. Please try again."
      });
    }
  },

  async POST(req, ctx) {
    const form = await req.formData();
    const tokenId = form.get("tokenId")?.toString();
    const token = form.get("token")?.toString();
    const newPassword = form.get("newPassword")?.toString();
    const confirmPassword = form.get("confirmPassword")?.toString();

    if (!tokenId || !token || !newPassword || !confirmPassword) {
      return ctx.render({
        tokenId,
        token,
        tokenValid: true,
        error: "All fields are required"
      });
    }

    if (newPassword !== confirmPassword) {
      return ctx.render({
        tokenId,
        token,
        tokenValid: true,
        error: "Passwords do not match"
      });
    }

    try {
      // Make API call to reset password
      const response = await fetch(`${req.url.split('/reset-password')[0]}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': req.headers.get('x-forwarded-for') || '',
          'x-real-ip': req.headers.get('x-real-ip') || '',
          'user-agent': req.headers.get('user-agent') || ''
        },
        body: JSON.stringify({
          tokenId,
          token,
          newPassword,
          confirmPassword
        })
      });

      const result = await response.json();

      if (response.ok) {
        return ctx.render({
          success: true,
          message: result.message
        });
      } else {
        return ctx.render({
          tokenId,
          token,
          tokenValid: true,
          error: result.error || 'Failed to reset password'
        });
      }
    } catch (error) {
      return ctx.render({
        tokenId,
        token,
        tokenValid: true,
        error: 'An unexpected error occurred. Please try again.'
      });
    }
  }
};

export default function ResetPasswordPage({ data }: PageProps<ResetPasswordData>) {
  const formatTimeRemaining = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <Head>
        <title>Reset Password - SimplyCaster</title>
        <meta name="description" content="Reset your SimplyCaster account password" />
      </Head>

      <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div class="sm:mx-auto sm:w-full sm:max-w-md">
          <div class="text-center">
            <h1 class="text-3xl font-bold text-blue-600 mb-2">SimplyCaster</h1>
            <h2 class="text-2xl font-semibold text-gray-900">Reset your password</h2>
          </div>
        </div>

        <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            {data?.success ? (
              <div class="text-center">
                <div class="rounded-md bg-green-50 p-4 mb-6">
                  <div class="flex">
                    <div class="flex-shrink-0">
                      <svg class="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                      </svg>
                    </div>
                    <div class="ml-3">
                      <h3 class="text-sm font-medium text-green-800">
                        Password reset successful
                      </h3>
                      <div class="mt-2 text-sm text-green-700">
                        <p>{data.message}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <a
                  href="/"
                  class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Sign in with new password
                </a>
              </div>
            ) : !data?.tokenValid ? (
              <div class="text-center">
                <div class="rounded-md bg-red-50 p-4 mb-6">
                  <div class="flex">
                    <div class="flex-shrink-0">
                      <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                      </svg>
                    </div>
                    <div class="ml-3">
                      <h3 class="text-sm font-medium text-red-800">
                        Invalid Reset Token
                      </h3>
                      <div class="mt-2 text-sm text-red-700">
                        <p>{data?.tokenError}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="space-y-3">
                  <a
                    href="/request-password-reset"
                    class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Request new reset link
                  </a>
                  <a
                    href="/"
                    class="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Back to sign in
                  </a>
                </div>
              </div>
            ) : (
              <form method="POST" class="space-y-6">
                <input type="hidden" name="tokenId" value={data?.tokenId} />
                <input type="hidden" name="token" value={data?.token} />

                {data?.timeRemaining && data.timeRemaining > 0 && (
                  <div class="rounded-md bg-yellow-50 p-4">
                    <div class="flex">
                      <div class="flex-shrink-0">
                        <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                        </svg>
                      </div>
                      <div class="ml-3">
                        <h3 class="text-sm font-medium text-yellow-800">
                          Time Remaining: {formatTimeRemaining(data.timeRemaining)}
                        </h3>
                        <div class="mt-2 text-sm text-yellow-700">
                          <p>This reset link will expire soon. Please complete your password reset.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {data?.error && (
                  <div class="rounded-md bg-red-50 p-4">
                    <div class="flex">
                      <div class="flex-shrink-0">
                        <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                        </svg>
                      </div>
                      <div class="ml-3">
                        <h3 class="text-sm font-medium text-red-800">
                          Error
                        </h3>
                        <div class="mt-2 text-sm text-red-700">
                          <p>{data.error}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label for="newPassword" class="block text-sm font-medium text-gray-700">
                    New Password
                  </label>
                  <div class="mt-1">
                    <input
                      id="newPassword"
                      name="newPassword"
                      type="password"
                      autocomplete="new-password"
                      required
                      class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Enter your new password"
                    />
                  </div>
                  <p class="mt-1 text-xs text-gray-500">
                    Must be at least 8 characters with uppercase, lowercase, number, and special character.
                  </p>
                </div>

                <div>
                  <label for="confirmPassword" class="block text-sm font-medium text-gray-700">
                    Confirm New Password
                  </label>
                  <div class="mt-1">
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      autocomplete="new-password"
                      required
                      class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Confirm your new password"
                    />
                  </div>
                </div>

                <div>
                  <button
                    type="submit"
                    class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reset Password
                  </button>
                </div>

                <div class="text-center">
                  <a
                    href="/"
                    class="text-sm text-blue-600 hover:text-blue-500"
                  >
                    Back to sign in
                  </a>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}