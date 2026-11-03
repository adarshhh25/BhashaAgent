/**
 * Central Authentication Provider
 *
 * Manages reactive authentication state, session restoration,
 * cross-context synchronization, and user account actions.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  AccountDeletionRequest,
  AuthStatus,
  LoginRequest,
  PasswordChangeRequest,
  ProfileUpdateRequest,
  RegisterRequest,
  SafeUser,
  StoredSession,
} from '../types/auth.types';
import { AuthContext, type AuthContextValue } from './auth-context-def';
import { authService } from '../services/auth.service';
import {
  clearStoredSession,
  getStoredSession,
  onSessionChange,
  registerRefreshHandler,
  setStoredSession,
} from '../services/token-storage';

// Register single-flight refresh handler with token-storage
registerRefreshHandler(async (oldRefreshToken: string): Promise<StoredSession | null> => {
  try {
    const result = await authService.refresh(oldRefreshToken);
    const existing = await getStoredSession();
    if (!existing) return null;

    const newSession: StoredSession = {
      ...existing,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: Date.now() + result.expiresIn * 1000,
    };
    return newSession;
  } catch {
    return null;
  }
});

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('initializing');

  // Initialize session on mount
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        const session = await getStoredSession();
        if (!isMounted) return;

        if (!session) {
          setUser(null);
          setStatus('unauthenticated');
          return;
        }

        // Check access token validity
        const now = Date.now();
        if (now >= session.expiresAt - 60_000) {
          // Token expired, attempt refresh
          if (isMounted) setStatus('refreshing');
          try {
            const refreshed = await authService.refresh(session.refreshToken);
            const updatedSession: StoredSession = {
              ...session,
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken,
              expiresAt: Date.now() + refreshed.expiresIn * 1000,
            };
            await setStoredSession(updatedSession);
          } catch {
            await clearStoredSession();
            if (isMounted) {
              setUser(null);
              setStatus('unauthenticated');
            }
            return;
          }
        }

        // Validate session with backend and get latest user profile
        try {
          const freshUser = await authService.getMe();
          if (isMounted) {
            setUser(freshUser);
            setStatus('authenticated');
          }
        } catch {
          await clearStoredSession();
          if (isMounted) {
            setUser(null);
            setStatus('unauthenticated');
          }
        }
      } catch {
        await clearStoredSession();
        if (isMounted) {
          setUser(null);
          setStatus('unauthenticated');
        }
      }
    }

    void initSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // Synchronize authentication changes across extension contexts (Side Panel <-> Popup)
  useEffect(() => {
    const unsubscribe = onSessionChange((newSession) => {
      if (!newSession) {
        setUser(null);
        setStatus('unauthenticated');
      } else {
        setUser(newSession.user);
        setStatus('authenticated');
      }
    });

    return unsubscribe;
  }, []);

  /**
   * Login action
   */
  const login = useCallback(async (credentials: LoginRequest) => {
    setStatus('initializing');
    try {
      const session = await authService.login(credentials);
      await setStoredSession(session);
      setUser(session.user);
      setStatus('authenticated');
    } catch (error) {
      setStatus('unauthenticated');
      throw error;
    }
  }, []);

  /**
   * Registration action
   */
  const register = useCallback(async (data: RegisterRequest) => {
    return authService.register(data);
  }, []);

  /**
   * Logout current session
   */
  const logout = useCallback(async () => {
    try {
      const session = await getStoredSession();
      if (session) {
        await authService.logout(session.refreshToken);
      }
    } catch {
      // Even if remote call fails (e.g. offline), clear local session
    } finally {
      await clearStoredSession();
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  /**
   * Logout from all devices/sessions
   */
  const logoutAll = useCallback(async () => {
    try {
      await authService.logoutAll();
    } catch {
      // Always clear local session
    } finally {
      await clearStoredSession();
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  /**
   * Manual session refresh
   */
  const refreshSession = useCallback(async (): Promise<boolean> => {
    const session = await getStoredSession();
    if (!session) return false;

    setStatus('refreshing');
    try {
      const refreshed = await authService.refresh(session.refreshToken);
      const updatedSession: StoredSession = {
        ...session,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: Date.now() + refreshed.expiresIn * 1000,
      };
      await setStoredSession(updatedSession);
      setUser(updatedSession.user);
      setStatus('authenticated');
      return true;
    } catch {
      await clearStoredSession();
      setUser(null);
      setStatus('unauthenticated');
      return false;
    }
  }, []);

  /**
   * Update profile
   */
  const updateProfile = useCallback(async (data: ProfileUpdateRequest) => {
    const updated = await authService.updateMe(data);
    setUser(updated);
    const session = await getStoredSession();
    if (session) {
      await setStoredSession({ ...session, user: updated });
    }
  }, []);

  /**
   * Change password
   */
  const changePassword = useCallback(async (data: PasswordChangeRequest) => {
    await authService.changePassword(data);
    // Backend revokes all active refresh tokens on password change!
    // The user must re-authenticate.
    await clearStoredSession();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  /**
   * Delete account
   */
  const deleteAccount = useCallback(async (data: AccountDeletionRequest) => {
    await authService.deleteAccount(data);
    await clearStoredSession();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      isLoading: status === 'initializing' || status === 'refreshing',
      login,
      register,
      logout,
      logoutAll,
      refreshSession,
      updateProfile,
      changePassword,
      deleteAccount,
    }),
    [
      user,
      status,
      login,
      register,
      logout,
      logoutAll,
      refreshSession,
      updateProfile,
      changePassword,
      deleteAccount,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
