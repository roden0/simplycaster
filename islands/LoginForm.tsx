/**
 * Login Form Island
 * 
 * Interactive login form that uses the new API service layer
 */

import { signal } from "@preact/signals";
import { useState } from "preact/hooks";
import { UserService } from "../lib/services/user-service.ts";

interface LoginFormProps {
  error?: string;
}

const isLoading = signal(false);
const errorMessage = signal<string | null>(null);

export default function LoginForm({ error }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Set initial error if provided
  if (error && !errorMessage.value) {
    errorMessage.value = error;
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    
    if (!email || !password) {
      errorMessage.value = "Email and password are required";
      return;
    }

    isLoading.value = true;
    errorMessage.value = null;

    try {
      const result = await UserService.login({ email, password });

      if (result.success) {
        // Redirect to dashboard on successful login
        window.location.href = "/dashboard";
      } else {
        errorMessage.value = result.error || "Login failed";
      }
    } catch (error) {
      errorMessage.value = "Network error. Please try again.";
      console.error("Login error:", error);
    } finally {
      isLoading.value = false;
    }
  };

  return (
    <div class="login-form-container">
      <h1 class="login-title">Sign In</h1>

      {errorMessage.value && (
        <div class="error-message" style="color: red; margin-bottom: 1rem; padding: 0.5rem; border: 1px solid red; border-radius: 4px; background-color: #fee;">
          {errorMessage.value}
        </div>
      )}

      <form onSubmit={handleSubmit} class="w-full">
        <div class="form-group">
          <label for="email" class="form-label">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            class="form-input"
            required
            placeholder="Enter your email"
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            disabled={isLoading.value}
          />
        </div>

        <div class="form-group">
          <label for="password" class="form-label">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            class="form-input"
            required
            placeholder="Enter your password"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            disabled={isLoading.value}
          />
        </div>

        <button 
          type="submit" 
          class="primary-button"
          disabled={isLoading.value}
        >
          {isLoading.value ? "Signing In..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}