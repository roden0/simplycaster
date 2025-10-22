/**
 * User Service
 * 
 * Client-side service for user-related API operations
 */

import { api, type ApiResponse } from '../utils/api-client.ts';

export interface User {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  emailVerified: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateUserData {
  email: string;
  password: string;
  role: string;
  isActive?: boolean;
  emailVerified?: boolean;
}

export interface UpdateUserData {
  email?: string;
  currentPassword?: string;
  newPassword?: string;
  role?: string;
  isActive?: boolean;
  emailVerified?: boolean;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResult {
  user: User;
  token: string;
  expiresAt: string;
  message: string;
}

export class UserService {
  /**
   * Login user
   */
  static async login(data: LoginData): Promise<ApiResponse<AuthResult>> {
    return api.login(data.email, data.password);
  }

  /**
   * Logout user
   */
  static async logout(): Promise<ApiResponse<{ message: string }>> {
    return api.logout();
  }

  /**
   * Create a new user (Admin only)
   */
  static async createUser(data: CreateUserData): Promise<ApiResponse<{ user: User; message: string }>> {
    return api.post('/api/users/create', data);
  }

  /**
   * Update user profile
   */
  static async updateUser(userId: string, data: UpdateUserData): Promise<ApiResponse<{ user: User; message: string }>> {
    return api.put(`/api/users/${userId}/update`, data);
  }
}

export default UserService;