/**
 * API Client Utility
 * 
 * Provides a consistent interface for making API calls with proper error handling
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  field?: string;
}

export interface ApiError {
  message: string;
  code: string;
  status: number;
  field?: string;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Make a GET request
   */
  async get<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * Make a POST request
   */
  async post<T>(endpoint: string, data?: any, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * Make a PUT request
   */
  async put<T>(endpoint: string, data?: any, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * Make a DELETE request
   */
  async delete<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * Make a generic request
   */
  private async request<T>(endpoint: string, options: RequestInit): Promise<ApiResponse<T>> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const response = await fetch(url, {
        credentials: 'same-origin', // Include cookies
        ...options,
      });

      const contentType = response.headers.get('content-type');
      let responseData: any;

      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = { message: await response.text() };
      }

      if (!response.ok) {
        return {
          success: false,
          error: responseData.error || responseData.message || 'Request failed',
          code: responseData.code || 'UNKNOWN_ERROR',
          field: responseData.field,
        };
      }

      // Handle both new API format and legacy formats
      if (responseData.success !== undefined) {
        return responseData;
      } else {
        return {
          success: true,
          data: responseData,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
        code: 'NETWORK_ERROR',
      };
    }
  }

  /**
   * Get authentication token from cookie or localStorage
   */
  private getAuthToken(): string | null {
    // Try to get from cookie first (server-side rendered)
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'auth_token') {
          return decodeURIComponent(value);
        }
      }

      // Fallback to localStorage
      return localStorage.getItem('auth_token');
    }
    return null;
  }

  /**
   * Make an authenticated request
   */
  async authenticatedRequest<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const token = this.getAuthToken();
    
    if (token) {
      options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
      };
    }

    return this.request<T>(endpoint, options);
  }

  /**
   * Login and store token
   */
  async login(email: string, password: string): Promise<ApiResponse<any>> {
    const response = await this.post('/api/auth/login', { email, password });
    
    if (response.success && response.data?.token) {
      // Store token in localStorage as backup
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('auth_token', response.data.token);
      }
    }
    
    return response;
  }

  /**
   * Logout and clear token
   */
  async logout(): Promise<ApiResponse<any>> {
    const response = await this.post('/api/auth/logout');
    
    // Clear stored token
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
    
    return response;
  }
}

// Create a default API client instance
export const apiClient = new ApiClient();

// Export convenience methods
export const api = {
  get: <T>(endpoint: string, options?: RequestInit) => apiClient.get<T>(endpoint, options),
  post: <T>(endpoint: string, data?: any, options?: RequestInit) => apiClient.post<T>(endpoint, data, options),
  put: <T>(endpoint: string, data?: any, options?: RequestInit) => apiClient.put<T>(endpoint, data, options),
  delete: <T>(endpoint: string, options?: RequestInit) => apiClient.delete<T>(endpoint, options),
  login: (email: string, password: string) => apiClient.login(email, password),
  logout: () => apiClient.logout(),
};