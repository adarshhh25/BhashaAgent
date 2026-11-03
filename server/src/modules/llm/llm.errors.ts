export class LLMError extends Error {
  constructor(
    public readonly code: "MISSING_CONFIGURATION" | "PROVIDER_UNAVAILABLE" | "RATE_LIMITED" | "TIMEOUT" | "INVALID_RESPONSE",
    message: string,
  ) {
    super(message);
    this.name = "LLMError";
  }
}
