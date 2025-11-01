/**
 * Request Password Reset Page
 * 
 * Allows users to request a password reset by entering their email address.
 */

import { Handlers, PageProps } from "$fresh/server.ts";
import { Head } from "$fresh/runtime.ts";

interface RequestPasswordResetData {
  success?: boolean;
  message?: string;
  error?: string;
}

export const handler: Handlers<RequestPasswordResetData> = {
  GET(req, ctx) {
    return ctx.render({});
  },

  async POST(req, ctx) {
    const form = await req.formData();
    const email = form.get("email")?.toString();

    if (!email) {
      return ctx.render({
        error: "Email is required"
      });
    }

    try {
      // Make API call to request password reset
      const response = await fetch(`${req.url.split('/request-password-reset')[0]}/api/auth/request-password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': req.headers.get('x-forwarded-for') || '',
          'x-real-ip': req.headers.get('x-real-ip') || '',
          'user-agent': req.headers.get('user-agent') || ''
        },
        body: JSON.stringify({ email })
      });

      const result = await response.json();

      if (response.ok) {
        return ctx.render({
          success: true,
          message: result.message
        });
      } else {
        return ctx.render({
          error: result.error || 'Failed to request password reset'
        });
      }
    } catch (error) {
      return ctx.render({
        error: 'An unexpected error occurred. Please try again.'
      });
    }
  }
};

export default function RequestPasswordResetPage({ data }: PageProps<RequestPasswordResetData>) {
  return (
    <>
      <Head>
        <title>Request Password Reset - SimplyCaster</title>
        <meta name="description" content="Request a password reset for your SimplyCaster account" />
      </Head>

      <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div class="sm:mx-auto sm:w-full sm:max-w-md">
          <div class="text-center">
            <h1 class="text-3xl font-bold text-blue-600 mb-2">SimplyCaster</h1>
            <h2 class="text-2xl font-semibold text-gray-900">Reset your password</h2>
            <p class="mt-2 text-sm text-gray-600">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>
        </div>

        <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            {data?.success ? (
              <div class="rounded-md bg-green-50 p-4">
                <div class="flex">
                  <div class="flex-shrink-0">
                    <svg class="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                    </svg>
                  </div>
                  <div class="ml-3">
                    <h3 class="text-sm font-medium text-green-800">
                      Email sent successfully
                    </h3>
                    <div class="mt-2 text-sm text-green-700">
                      <p>{data.message}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <form method="POST" class="space-y-6">
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
                  <label for="email" class="block text-sm font-medium text-gray-700">
                    Email address
                  </label>
                  <div class="mt-1">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autocomplete="email"
                      required
                      class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Enter your email address"
                    />
                  </div>
                </div>

                <div>
                  <button
                    type="submit"
                    class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Send reset link
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