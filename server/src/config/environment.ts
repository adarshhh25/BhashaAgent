import "dotenv/config";

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value.trim().length > 0);
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const jwtAccessSecret = process.env.JWT_ACCESS_SECRET;

if (!jwtAccessSecret || jwtAccessSecret.length < 32) {
  throw new Error("JWT_ACCESS_SECRET must be at least 32 characters");
}

const refreshTokenExpiresInDays = Number.parseInt(
  process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS ?? "7",
  10,
);

if (!Number.isInteger(refreshTokenExpiresInDays) || refreshTokenExpiresInDays <= 0) {
  throw new Error("REFRESH_TOKEN_EXPIRES_IN_DAYS must be a positive integer");
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number.parseInt(process.env.PORT ?? "5000", 10),
  databaseUrl,
  jwtAccessSecret,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  jwtIssuer: process.env.JWT_ISSUER ?? "bhashaagent",
  jwtAudience: process.env.JWT_AUDIENCE ?? "bhashaagent-api",
  refreshTokenExpiresInDays,
  llm: {
    provider: firstNonEmpty(process.env.LLM_PROVIDER) ?? (firstNonEmpty(process.env.GROQ_API_KEY) ? "groq" : ""),
    apiKey: firstNonEmpty(process.env.LLM_API_KEY, process.env.GROQ_API_KEY) ?? "",
    model: firstNonEmpty(process.env.LLM_MODEL, process.env.GROQ_MODEL) ?? "",
    baseUrl: firstNonEmpty(process.env.LLM_BASE_URL, process.env.GROQ_BASE_URL) ?? "https://api.groq.com/openai/v1/chat/completions",
    timeoutMs: Number.parseInt(process.env.LLM_TIMEOUT_MS ?? "30000", 10),
    maxRetries: Number.parseInt(process.env.LLM_MAX_RETRIES ?? "2", 10),
    maxOutputTokens: Number.parseInt(process.env.LLM_MAX_OUTPUT_TOKENS ?? "700", 10),
    temperature: Number.parseFloat(process.env.LLM_TEMPERATURE ?? "0.2"),
  },
  gnani: {
    apiKey: firstNonEmpty(process.env.GNANI) ?? "",
    endpoint: "wss://api.vachana.ai/stt/v3/stream",
    model: "prisma-v3.0",
    languageCode: "indic-auto",
    format: "verbatim",
    sampleRate: 16000,
    frameBytes: 1024,
    idleTimeoutSeconds: Number.parseInt(process.env.GNANI_IDLE_TIMEOUT_SECONDS ?? "120", 10),
    maxSessionMs: 15 * 60 * 1000,
  },
  gnaniTts: {
    apiKey: firstNonEmpty(process.env.GNANI) ?? "",
    endpoint: "wss://api.vachana.ai/api/v1/tts",
    model: firstNonEmpty(process.env.GNANI_TTS_MODEL) ?? "timbre-v3.0",
    voice: firstNonEmpty(process.env.GNANI_TTS_VOICE) ?? "Shivani",
    language: firstNonEmpty(process.env.GNANI_TTS_LANGUAGE) ?? "auto",
    speed: Number.parseFloat(process.env.GNANI_TTS_SPEED ?? "1.0"),
    sampleRate: Number.parseInt(process.env.GNANI_TTS_SAMPLE_RATE ?? "24000", 10),
    container: firstNonEmpty(process.env.GNANI_TTS_CONTAINER) ?? "raw",
    encoding: firstNonEmpty(process.env.GNANI_TTS_ENCODING) ?? "linear_pcm",
  },
} as const;
