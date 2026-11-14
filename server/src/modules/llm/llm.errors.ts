export type LLMErrorCode =
  | "MISSING_CONFIGURATION"
  | "PROVIDER_UNAVAILABLE"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "REQUEST_CANCELLED";

export class LLMError extends Error {
  constructor(
    public readonly code: LLMErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LLMError";
  }
}
