/**
 * Authentication API Service
 *
 * Direct integration with BhashaAgent Phase 2 backend auth endpoints:
 * - POST /api/v1/auth/register
 * - POST /api/v1/auth/login
 * - POST /api/v1/auth/refresh
 * - POST /api/v1/auth/logout
 * - POST /api/v1/auth/logout-all
 * - GET /api/v1/users/me
 * - PATCH /api/v1/users/me
 * - PATCH /api/v1/users/me/password
 * - DELETE /api/v1/users/me
 */

import { apiClient } from '../../../services/api/api-client';
import type {
  AccountDeletionRequest,
  AuthResponseData,
  LoginRequest,
  PasswordChangeRequest,
  ProfileUpdateRequest,
  RefreshResponseData,
  RegisterRequest,
  SafeUser,
  StoredSession,
} from '../types/auth.types';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export const authService = {
  /**
   * Register a new user account.
   */
  async register(input: RegisterRequest): Promise<SafeUser> {
    const res = await apiClient.post<ApiResponse<{ user: SafeUser }>>(
      '/api/v1/auth/register',
      input,
      { skipAuth: true },
    );
    return res.data.user;
  },

  /**
   * Authenticate with email and password.
   */
  async login(input: LoginRequest): Promise<StoredSession> {
    const res = await apiClient.post<ApiResponse<AuthResponseData>>(
      '/api/v1/auth/login',
      input,
      { skipAuth: true },
    );

    const { user, accessToken, refreshToken, expiresIn } = res.data;
    const expiresAt = Date.now() + expiresIn * 1000;

    return {
      accessToken,
      refreshToken,
      expiresAt,
      user,
    };
  },

  /**
   * Refresh the session using a refresh token.
   */
  async refresh(refreshToken: string): Promise<RefreshResponseData> {
    const res = await apiClient.post<ApiResponse<RefreshResponseData>>(
      '/api/v1/auth/refresh',
      { refreshToken },
      { skipAuth: true },
    );
    return res.data;
  },

  /**
   * Log out the current session.
   */
  async logout(refreshToken: string): Promise<void> {
    await apiClient.post('/api/v1/auth/logout', { refreshToken });
  },

  /**
   * Revoke all active sessions for the current user.
   */
  async logoutAll(): Promise<void> {
    await apiClient.post('/api/v1/auth/logout-all');
  },

  /**
   * Fetch current authenticated user's profile.
   */
  async getMe(): Promise<SafeUser> {
    const res = await apiClient.get<ApiResponse<{ user: SafeUser }>>('/api/v1/users/me');
    return res.data.user;
  },

  /**
   * Update profile details (fullName, preferredLanguage).
   */
  async updateMe(input: ProfileUpdateRequest): Promise<SafeUser> {
    const res = await apiClient.patch<ApiResponse<{ user: SafeUser }>>('/api/v1/users/me', input);
    return res.data.user;
  },

  /**
   * Change current password (revokes all active refresh tokens on the backend).
   */
  async changePassword(input: PasswordChangeRequest): Promise<void> {
    await apiClient.patch('/api/v1/users/me/password', input);
  },

  /**
   * Permanently delete user account.
   */
  async deleteAccount(input: AccountDeletionRequest): Promise<void> {
    await apiClient.delete('/api/v1/users/me', input);
  },
};

