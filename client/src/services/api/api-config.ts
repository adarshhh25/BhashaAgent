/**
 * API Configuration
 *
 * Centralized configuration for the BhashaAgent API client.
 * Environment-based base URL resolution with sensible defaults.
 */

/**
 * Resolves the API base URL from environment variables.
 *
 * In Vite, environment variables must be prefixed with VITE_
 * and are accessed via import.meta.env at build time.
 */
function resolveBaseUrl(): string {
  try {
    const env = typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string, string> }).env : undefined;
    const envUrl = env?.VITE_API_BASE_URL;
    if (envUrl && typeof envUrl === 'string') {
      return envUrl.replace(/\/+$/, ''); // Strip trailing slashes
    }
  } catch {
    // Fallback for non-Vite environments like Node test runner
  }
  // Default development URL — matches the backend default port 5000
  return 'http://localhost:5000';
}

export const apiConfig = {
  /** Base URL for all API requests */
  baseUrl: resolveBaseUrl(),

  /** Default request timeout in milliseconds */
  timeoutMs: 30_000,

  /** Default headers sent with every request */
  defaultHeaders: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  } as Record<string, string>,
} as const;
