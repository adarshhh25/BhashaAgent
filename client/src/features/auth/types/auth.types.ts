/**
 * Authentication and User Types
 *
 * Modeled directly after the backend Phase 2 contracts in server/src/modules/auth/ and server/src/modules/users/.
 */

/** User entity exposed by the backend safeUserSelect */
export interface SafeUser {
  id: string;
  fullName: string;
  email: string;
  preferredLanguage: string | null;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Stored session model used across extension contexts */
export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  /** Timestamp in ms when access token expires */
  expiresAt: number;
  user: SafeUser;
}

/** Registration payload */
export interface RegisterRequest {
  fullName: string;
  email: string;
  password: string;
  preferredLanguage?: string;
}

/** Login payload */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Login API response data */
export interface AuthResponseData {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Token refresh API response data */
export interface RefreshResponseData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Profile update payload */
export interface ProfileUpdateRequest {
  fullName?: string;
  preferredLanguage?: string | null;
}

/** Password change payload */
export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}

/** Account deletion payload */
export interface AccountDeletionRequest {
  currentPassword: string;
  confirmation: 'DELETE';
}

/** High-level authentication status */
export type AuthStatus =
  | 'initializing'
  | 'authenticated'
  | 'unauthenticated'
  | 'refreshing';

