import { createContext } from 'react';
import type {
  AccountDeletionRequest,
  AuthStatus,
  LoginRequest,
  PasswordChangeRequest,
  ProfileUpdateRequest,
  RegisterRequest,
  SafeUser,
} from '../types/auth.types';

export interface AuthContextValue {
  user: SafeUser | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<SafeUser>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  updateProfile: (data: ProfileUpdateRequest) => Promise<void>;
  changePassword: (data: PasswordChangeRequest) => Promise<void>;
  deleteAccount: (data: AccountDeletionRequest) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

