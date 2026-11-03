/**
 * API Error Handling
 *
 * Typed error classes for consistent API error handling
 * across the BhashaAgent frontend.
 */

/** Structured error response from the backend */
export interface ApiErrorResponse {
  message?: string;
  code?: string;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  details?: unknown;
}

/**
 * Base API error with HTTP status and structured response data.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly data: ApiErrorResponse | null;
  public readonly errorCode?: string;

  constructor(status: number, statusText: string, data: ApiErrorResponse | null) {
    const extractedMessage =
      data?.error?.message ??
      data?.message ??
      `API Error: ${status} ${statusText}`;
    super(extractedMessage);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.data = data;
    this.errorCode = data?.error?.code ?? data?.code;
  }

  /** Whether this is an authentication error (401) */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Whether this is a forbidden error (403) */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** Whether this is a not-found error (404) */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** Whether this is a conflict error (409) */
  get isConflict(): boolean {
    return this.status === 409;
  }

  /** Whether the resource was deleted (410) */
  get isGone(): boolean {
    return this.status === 410;
  }

  /** Whether this is a validation error (422) */
  get isValidationError(): boolean {
    return this.status === 422;
  }

  /** Whether this is a rate limit error (429) */
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** Whether this is a server error (5xx) */
  get isServerError(): boolean {
    return this.status >= 500 && this.status < 600;
  }
}

/**
 * Thrown when a network-level failure occurs (e.g. offline, DNS failure, CORS).
 */
export class NetworkError extends Error {
  public readonly cause?: unknown;

  constructor(message = 'Network error: could not connect to server', cause?: unknown) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/**
 * Thrown when a request times out.
 */
export class TimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Thrown when a request is cancelled via AbortController.
 */
export class RequestAbortedError extends Error {
  constructor(message = 'Request was aborted') {
    super(message);
    this.name = 'RequestAbortedError';
  }
}
