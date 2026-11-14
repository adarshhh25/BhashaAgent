/**
 * LLM Error Classifier
 *
 * Reliably classifies LLM provider and network errors into structured failure categories:
 * - QUOTA_EXCEEDED: Daily quota or resource quota exhausted (immediate fallback, no immediate retry)
 * - RATE_LIMITED: Short-term rate limit (429 with retry delay)
 * - INVALID_MODEL: Model not found or deprecated (404/400)
 * - INVALID_ARGUMENT: Unsupported parameter or payload issue (e.g., thinkingConfig on non-thinking models)
 * - AUTHENTICATION_ERROR: Invalid API key or permission denied (401/403)
 * - TRANSIENT_FAILURE: Server 5xx, high demand (503), service unavailable
 * - TIMEOUT: Request timed out or aborted
 * - MALFORMED_RESPONSE: Unparsable response from provider
 */

export type LLMErrorCategory =
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "INVALID_MODEL"
  | "INVALID_ARGUMENT"
  | "AUTHENTICATION_ERROR"
  | "PERMISSION_DENIED"
  | "TRANSIENT_FAILURE"
  | "TIMEOUT"
  | "MALFORMED_RESPONSE"
  | "NETWORK_ERROR";

export interface ClassifiedLLMError {
  category: LLMErrorCategory;
  statusCode?: number;
  message: string;
  retryDelayMs?: number;
  isRetryable: boolean;
  shouldFallbackImmediately: boolean;
  originalError: unknown;
}

/**
 * Extract retry delay in milliseconds from headers or error message payload.
 */
export function extractRetryDelayMs(
  error: unknown,
  headers?: Headers | Record<string, string | string[] | undefined>,
): number | undefined {
  // 1. Check Retry-After header if available
  if (headers) {
    let retryAfterHeader: string | undefined;
    if (typeof (headers as Headers).get === "function") {
      retryAfterHeader = (headers as Headers).get("retry-after") ?? undefined;
    } else {
      const h = headers as Record<string, string | string[] | undefined>;
      const val = h["retry-after"] ?? h["Retry-After"];
      retryAfterHeader = Array.isArray(val) ? val[0] : val;
    }

    if (retryAfterHeader) {
      const parsedSeconds = Number.parseFloat(retryAfterHeader);
      if (!Number.isNaN(parsedSeconds) && parsedSeconds >= 0) {
        return Math.round(parsedSeconds * 1000);
      }
      const parsedDate = Date.parse(retryAfterHeader);
      if (!Number.isNaN(parsedDate)) {
        const delta = parsedDate - Date.now();
        if (delta > 0) return delta;
      }
    }
  }

  // 2. Check error.errorDetails or GoogleGenAI retryDelay
  if (error && typeof error === "object") {
    const errObj = error as Record<string, unknown>;

    // Google API detail array
    if (Array.isArray(errObj.errorDetails)) {
      for (const d of errObj.errorDetails) {
        if (d && typeof d === "object" && "retryDelay" in d) {
          const delayStr = String((d as { retryDelay: unknown }).retryDelay);
          const match = delayStr.match(/^(\d+(?:\.\d+)?)s?$/);
          if (match && match[1]) {
            return Math.round(Number.parseFloat(match[1]) * 1000);
          }
        }
      }
    }

    if (typeof errObj.retryDelay === "string") {
      const match = errObj.retryDelay.match(/^(\d+(?:\.\d+)?)s?$/);
      if (match && match[1]) {
        return Math.round(Number.parseFloat(match[1]) * 1000);
      }
    }
  }

  // 3. Check error message regex (e.g., "try again in 1.5s", "Please retry after 2 seconds")
  const msg = error instanceof Error ? error.message : String(error ?? "");
  const match = msg.match(/(?:retry|wait|try again)(?:\s+in|\s+after)?\s+(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)/i);
  if (match && match[1]) {
    return Math.round(Number.parseFloat(match[1]) * 1000);
  }

  return undefined;
}

/**
 * Classifies any error into a structured ClassifiedLLMError.
 */
export function classifyLLMError(
  error: unknown,
  headers?: Headers | Record<string, string | string[] | undefined>,
): ClassifiedLLMError {
  const errMsg = error instanceof Error ? error.message : String(error ?? "");
  const errName = error instanceof Error ? error.name : "";

  let statusCode: number | undefined;
  if (error && typeof error === "object" && "status" in error && typeof (error as any).status === "number") {
    statusCode = (error as any).status;
  } else if (errMsg.includes("429")) {
    statusCode = 429;
  } else if (errMsg.includes("404")) {
    statusCode = 404;
  } else if (errMsg.includes("400")) {
    statusCode = 400;
  } else if (errMsg.includes("401")) {
    statusCode = 401;
  } else if (errMsg.includes("403")) {
    statusCode = 403;
  } else if (errMsg.includes("503")) {
    statusCode = 503;
  } else if (errMsg.includes("500")) {
    statusCode = 500;
  }

  const retryDelayMs = extractRetryDelayMs(error, headers);

  // 1. Timeout / Abort
  if (errName === "AbortError" || errMsg.includes("aborted") || errMsg.includes("ETIMEDOUT") || errMsg.includes("timeout")) {
    return {
      category: "TIMEOUT",
      statusCode: 408,
      message: errMsg,
      isRetryable: true,
      shouldFallbackImmediately: false,
      originalError: error,
    };
  }

  // 2. Authentication / Permission
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    errMsg.includes("API_KEY_INVALID") ||
    errMsg.includes("UNAUTHENTICATED") ||
    errMsg.includes("Invalid API key") ||
    errMsg.includes("PERMISSION_DENIED")
  ) {
    return {
      category: statusCode === 403 ? "PERMISSION_DENIED" : "AUTHENTICATION_ERROR",
      statusCode,
      message: errMsg,
      isRetryable: false,
      shouldFallbackImmediately: true,
      originalError: error,
    };
  }

  // 3. Quota Exceeded vs Rate Limited
  const is429 =
    statusCode === 429 ||
    errMsg.includes("429") ||
    errMsg.includes("RESOURCE_EXHAUSTED") ||
    errMsg.includes("Quota exceeded") ||
    /rate[-_\s]?limit/i.test(errMsg) ||
    retryDelayMs !== undefined;

  if (is429) {
    const isDailyOrAccountQuota =
      errMsg.includes("per day") ||
      errMsg.includes("PerDay") ||
      errMsg.includes("free_tier_requests") ||
      errMsg.includes("limit: 20") ||
      errMsg.includes("insufficient_quota") ||
      errMsg.includes("Daily request limit") ||
      (retryDelayMs !== undefined && retryDelayMs > 60000); // Wait > 1 minute means daily quota or credit limit

    if (isDailyOrAccountQuota) {
      return {
        category: "QUOTA_EXCEEDED",
        statusCode: 429,
        message: errMsg,
        retryDelayMs,
        isRetryable: false, // Do not waste time retrying same model
        shouldFallbackImmediately: true,
        originalError: error,
      };
    }

    return {
      category: "RATE_LIMITED",
      statusCode: 429,
      message: errMsg,
      retryDelayMs,
      isRetryable: true,
      shouldFallbackImmediately: (retryDelayMs !== undefined && retryDelayMs > 5000),
      originalError: error,
    };
  }

  // 4. Invalid Argument / Unsupported Parameter (Check before INVALID_MODEL so parameter errors are not misclassified)
  if (
    statusCode === 400 ||
    errMsg.includes("INVALID_ARGUMENT") ||
    errMsg.includes("Invalid parameter") ||
    errMsg.includes("thinkingConfig") ||
    errMsg.includes("thinking_config")
  ) {
    return {
      category: "INVALID_ARGUMENT",
      statusCode: 400,
      message: errMsg,
      isRetryable: errMsg.includes("thinkingConfig") || errMsg.includes("thinking_config"), // Can retry without thinkingConfig
      shouldFallbackImmediately: !errMsg.includes("thinkingConfig") && !errMsg.includes("thinking_config"),
      originalError: error,
    };
  }

  // 5. Model Not Found / Deprecated
  if (
    statusCode === 404 ||
    errMsg.includes("model not found") ||
    errMsg.includes("unknown model") ||
    errMsg.includes("model is not supported") ||
    errMsg.includes("no longer available") ||
    errMsg.includes("model does not exist")
  ) {
    return {
      category: "INVALID_MODEL",
      statusCode: statusCode || 404,
      message: errMsg,
      isRetryable: false,
      shouldFallbackImmediately: true,
      originalError: error,
    };
  }

  // 6. Server / Transient Failures
  if (
    statusCode === 503 ||
    statusCode === 502 ||
    statusCode === 504 ||
    statusCode === 500 ||
    errMsg.includes("UNAVAILABLE") ||
    errMsg.includes("high demand") ||
    errMsg.includes("overloaded") ||
    errMsg.includes("Internal error")
  ) {
    return {
      category: "TRANSIENT_FAILURE",
      statusCode: statusCode || 503,
      message: errMsg,
      isRetryable: true,
      shouldFallbackImmediately: statusCode === 503 && errMsg.includes("high demand"),
      originalError: error,
    };
  }

  // 7. General Network Error
  return {
    category: "NETWORK_ERROR",
    statusCode,
    message: errMsg,
    isRetryable: true,
    shouldFallbackImmediately: false,
    originalError: error,
  };
}
