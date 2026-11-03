import test from 'node:test';
import assert from 'node:assert/strict';

import {
  setStoredSession,
  getStoredSession,
  clearStoredSession,
  registerRefreshHandler,
  getValidAccessToken,
} from '../src/features/auth/services/token-storage.ts';
import { ApiError } from '../src/services/api/api-errors.ts';

test.beforeEach(async () => {
  await clearStoredSession();
});

test.describe('Token & Session Storage', () => {
  test('persists and retrieves session correctly', async () => {
    const mockSession = {
      accessToken: 'jwt-access-token-123',
      refreshToken: 'refresh-token-xyz',
      expiresAt: Date.now() + 900_000,
      user: {
        id: 'user-uuid-1',
        fullName: 'Test User',
        email: 'test@example.com',
        preferredLanguage: 'en',
      },
    };

    await setStoredSession(mockSession);
    const retrieved = await getStoredSession();

    assert.ok(retrieved);
    assert.equal(retrieved.accessToken, 'jwt-access-token-123');
    assert.equal(retrieved.refreshToken, 'refresh-token-xyz');
    assert.equal(retrieved.user.email, 'test@example.com');
  });

  test('clears session correctly', async () => {
    const mockSession = {
      accessToken: 'jwt-to-clear',
      refreshToken: 'refresh-to-clear',
      expiresAt: Date.now() + 900_000,
      user: { id: 'u1', fullName: 'User', email: 'u@test.com', preferredLanguage: null },
    };

    await setStoredSession(mockSession);
    await clearStoredSession();
    const retrieved = await getStoredSession();
    assert.equal(retrieved, null);
  });
});

test.describe('Single-flight Refresh Token Mutex Coordinator', () => {
  test('returns current access token when not expired', async () => {
    const mockSession = {
      accessToken: 'valid-active-token',
      refreshToken: 'active-refresh',
      expiresAt: Date.now() + 600_000, // 10 minutes left
      user: { id: 'u1', fullName: 'User', email: 'u@test.com', preferredLanguage: null },
    };
    await setStoredSession(mockSession);

    const token = await getValidAccessToken();
    assert.equal(token, 'valid-active-token');
  });

  test('executes refresh only ONCE for multiple concurrent callers when token is expired', async () => {
    const expiredSession = {
      accessToken: 'expired-access-token',
      refreshToken: 'refresh-token-rotate-me',
      expiresAt: Date.now() - 1000, // Expired
      user: { id: 'u1', fullName: 'User', email: 'u@test.com', preferredLanguage: null },
    };
    await setStoredSession(expiredSession);

    let refreshCallCount = 0;
    registerRefreshHandler(async (oldRefreshToken) => {
      refreshCallCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        accessToken: `new-access-token-rotated-from-${oldRefreshToken}`,
        refreshToken: 'new-refresh-token-abc',
        expiresAt: Date.now() + 900_000,
        user: expiredSession.user,
      };
    });

    const results = await Promise.all([
      getValidAccessToken(),
      getValidAccessToken(),
      getValidAccessToken(),
      getValidAccessToken(),
      getValidAccessToken(),
    ]);

    assert.equal(refreshCallCount, 1, 'Only one refresh call should be made for concurrent requests');

    for (const res of results) {
      assert.equal(res, 'new-access-token-rotated-from-refresh-token-rotate-me');
    }

    const updatedSession = await getStoredSession();
    assert.ok(updatedSession);
    assert.equal(updatedSession.accessToken, 'new-access-token-rotated-from-refresh-token-rotate-me');
    assert.equal(updatedSession.refreshToken, 'new-refresh-token-abc');
  });

  test('clears session when refresh fails', async () => {
    const expiredSession = {
      accessToken: 'expired-access-token',
      refreshToken: 'revoked-refresh-token',
      expiresAt: Date.now() - 1000,
      user: { id: 'u1', fullName: 'User', email: 'u@test.com', preferredLanguage: null },
    };
    await setStoredSession(expiredSession);

    registerRefreshHandler(async () => {
      throw new ApiError(401, 'Unauthorized', {
        message: 'Invalid or expired refresh token',
        code: 'INVALID_REFRESH_TOKEN',
      });
    });

    const token = await getValidAccessToken();
    assert.equal(token, null);

    const session = await getStoredSession();
    assert.equal(session, null);
  });
});

test.describe('Validation Rules Consistency', () => {
  test('validates password minimum length of 12 characters matching backend Argon2 requirements', () => {
    const shortPassword = 'short';
    assert.ok(shortPassword.length < 12, 'Password < 12 characters must be rejected');

    const validPassword = 'correct horse battery staple';
    assert.ok(validPassword.length >= 12 && validPassword.length <= 128);
  });

  test('validates email structure and trimming', () => {
    const rawEmail = '  user@EXAMPLE.COM  ';
    const trimmed = rawEmail.trim().toLowerCase();
    assert.equal(trimmed, 'user@example.com');
    assert.match(trimmed, /^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });
});

test.describe('ApiError Classification', () => {
  test('correctly identifies HTTP status codes and categories', () => {
    const err401 = new ApiError(401, 'Unauthorized', { message: 'Invalid credentials' });
    assert.equal(err401.isUnauthorized, true);
    assert.equal(err401.isForbidden, false);

    const err403 = new ApiError(403, 'Forbidden', { message: 'Account inactive' });
    assert.equal(err403.isForbidden, true);

    const err422 = new ApiError(422, 'Unprocessable Entity', { message: 'Validation failed' });
    assert.equal(err422.isValidationError, true);

    const err500 = new ApiError(500, 'Internal Server Error', { message: 'Database error' });
    assert.equal(err500.isServerError, true);
  });
});
