/**
 * BhashaAgent API Client
 *
 * Centralized, typed HTTP client built on the Fetch API.
 * Provides consistent error handling, JSON serialization,
 * request cancellation, automatic Bearer token injection,
 * and single-flight token refresh retry.
 */

import { apiConfig } from './api-config';
import { ApiError, NetworkError, RequestAbortedError } from './api-errors';
import type { ApiErrorResponse } from './api-errors';
import { getValidAccessToken } from '../../features/auth/services/token-storage';

/* ---------------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------------------*/

/** HTTP methods supported by the API client */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Options for individual API requests */
export interface RequestOptions {
  /** Additional headers to merge with defaults */
  headers?: Record<string, string>;
  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
  /** Query parameters appended to the URL */
  params?: Record<string, string | number | boolean | undefined>;
  /** Request timeout in milliseconds (overrides default) */
  timeoutMs?: number;
  /** Whether to skip automatic Authorization header injection */
  skipAuth?: boolean;
  /** Internal retry flag to prevent infinite refresh retry loops */
  _isRetry?: boolean;
}

/* ---------------------------------------------------------------------------
 * Internal helpers
 * ---------------------------------------------------------------------------*/

/**
 * Build the full URL with query parameters.
 */
function buildUrl(path: string, params?: RequestOptions['params']): string {
  const base = path.startsWith('http') ? path : `${apiConfig.baseUrl}${path}`;
  if (!params) return base;

  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Create an AbortSignal that times out after the specified duration.
 * Combines with an optional user-provided signal.
 */
function createTimeoutSignal(
  timeoutMs: number,
  userSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('Request timeout')), timeoutMs);

  if (userSignal) {
    if (userSignal.aborted) {
      controller.abort(userSignal.reason);
    } else {
      userSignal.addEventListener('abort', () => controller.abort(userSignal.reason), {
        once: true,
      });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

/**
 * Parse a response body as JSON, returning null if the body is empty.
 */
async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------------
 * Core request function
 * ---------------------------------------------------------------------------*/

/**
 * Execute an HTTP request with consistent error handling.
 */
async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const url = buildUrl(path, options.params);
  const timeout = options.timeoutMs ?? apiConfig.timeoutMs;
  const { signal, cleanup } = createTimeoutSignal(timeout, options.signal);

  const headers: Record<string, string> = {
    ...apiConfig.defaultHeaders,
    ...options.headers,
  };

  // Attach access token automatically unless explicitly skipped
  if (!options.skipAuth) {
    const token = await getValidAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const init: RequestInit = {
    method,
    headers,
    signal,
  };

  if (body !== undefined && method !== 'GET') {
    init.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, init);

    // If 401 Unauthorized and not already retried and not an auth endpoint, retry once with refreshed token
    if (response.status === 401 && !options._isRetry && !options.skipAuth && !path.includes('/auth/')) {
      const newToken = await getValidAccessToken();
      if (newToken) {
        return request<T>(method, path, body, {
          ...options,
          _isRetry: true,
        });
      }
    }

    if (!response.ok) {
      const errorData = await parseJsonSafe<ApiErrorResponse>(response);
      throw new ApiError(response.status, response.statusText, errorData);
    }

    // 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    const data = await parseJsonSafe<T>(response);
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new RequestAbortedError();
    }

    throw new NetworkError(
      error instanceof Error ? error.message : 'An unknown network error occurred',
      error,
    );
  } finally {
    cleanup();
  }
}

/* ---------------------------------------------------------------------------
 * Public API Client
 * ---------------------------------------------------------------------------*/

export const apiClient = {
  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>('GET', path, undefined, options);
  },

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>('POST', path, body, options);
  },

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>('PUT', path, body, options);
  },

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>('PATCH', path, body, options);
  },

  delete<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>('DELETE', path, body, options);
  },
} as const;
