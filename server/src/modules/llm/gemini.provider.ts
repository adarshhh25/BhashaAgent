import { GoogleGenAI } from "@google/genai";
import { config } from "../../config/environment";
import { LLMError } from "./llm.errors";
import { HttpLLMProvider } from "./llm.provider";
import type { LLMMessage, LLMProvider, LLMRequest, LLMResponse, LLMToolCall } from "./llm.types";
import { detectConversationLanguage } from "../agent/language-detector";
import { logLLMEvent } from "./llm-logger";

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const quotaExhaustedModels = new Map<string, number>();
const permanentlyUnavailableModels = new Set<string>(["gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"]);
const thoughtSignatureByCallId = new Map<string, string>();
const thoughtSignatureByName = new Map<string, string>();

/**
 * Determine if a Gemini model supports the `thinkingConfig: { thinkingBudget: number }` setting.
 * Models like gemini-flash-lite-latest and gemini-flash-latest reject thinkingConfig with 400 INVALID_ARGUMENT.
 * Models like gemini-2.5-flash, gemini-3.5-flash, and gemini-3.1-flash-lite explicitly support thinkingConfig.
 */
export function isThinkingSupported(modelName: string): boolean {
  if (permanentlyUnavailableModels.has(`${modelName}:thinking`)) {
    return false;
  }
  const lower = modelName.toLowerCase();
  if (lower.includes("flash-lite-latest") || lower.includes("flash-latest") || lower.includes("gemini-1.5")) {
    return false;
  }
  return lower.includes("2.5") || lower.includes("3.") || lower.includes("thinking");
}

/**
 * Normalize and sanitize tool parameter schemas for Gemini API compatibility.
 * Ensures properties with empty schemas (e.g. `value: {}`) have at least a basic description
 * so strict schema validators do not reject them.
 */
function sanitizeSchemaProperty(prop: unknown): Record<string, unknown> {
  if (typeof prop !== "object" || prop === null) {
    return { type: "string" };
  }
  const obj = { ...(prop as Record<string, unknown>) };
  // If no type is declared and no properties are present, treat as generic string/value
  if (!obj.type && !obj.properties && !obj.items && !obj.enum && !obj.anyOf && !obj.oneOf) {
    obj.type = "string";
    if (!obj.description) {
      obj.description = "Field value or string representation";
    }
  }
  if (obj.properties && typeof obj.properties === "object") {
    const sanitizedProps: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj.properties as Record<string, unknown>)) {
      sanitizedProps[key] = sanitizeSchemaProperty(val);
    }
    obj.properties = sanitizedProps;
  }
  if (obj.items && typeof obj.items === "object") {
    obj.items = sanitizeSchemaProperty(obj.items);
  }
  return obj;
}

export function sanitizeToolParameters(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!schema || typeof schema !== "object") {
    return { type: "object", properties: {} };
  }
  const cloned = { ...schema };
  cloned.type = cloned.type || "object";
  if (cloned.properties && typeof cloned.properties === "object") {
    const sanitizedProps: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(cloned.properties as Record<string, unknown>)) {
      sanitizedProps[key] = sanitizeSchemaProperty(val);
    }
    cloned.properties = sanitizedProps;
  }
  return cloned;
}

export class GeminiLLMProvider implements LLMProvider {
  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const apiKey = config.gemini.apiKey;
      if (!apiKey) {
        throw new LLMError("MISSING_CONFIGURATION", "Gemini API key is missing");
      }
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  private buildContentsAndSystem(messages: LLMMessage[]): {
    systemInstruction: string | undefined;
    contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>;
  } {
    const systemParts: string[] = [];
    const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [];
    const toolCallNameById = new Map<string, string>();

    for (const msg of messages) {
      if (msg.role === "system") {
        if (msg.content) {
          systemParts.push(msg.content);
        }
        continue;
      }

      if (msg.role === "assistant") {
        const parts: Array<Record<string, unknown>> = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            toolCallNameById.set(tc.id, tc.name);
            let args: Record<string, unknown> = {};
            try {
              args = typeof tc.arguments === "string" ? JSON.parse(tc.arguments) : (tc.arguments ?? {});
            } catch {
              args = { raw: tc.arguments };
            }
            const partObj: Record<string, unknown> = {
              functionCall: {
                name: tc.name,
                args,
              },
            };
            const sig = tc.thoughtSignature || thoughtSignatureByCallId.get(tc.id) || thoughtSignatureByName.get(tc.name);
            if (sig) {
              partObj.thoughtSignature = sig;
              partObj.thought_signature = sig;
            }
            parts.push(partObj);
          }
        }
        if (parts.length > 0) {
          contents.push({ role: "model", parts });
        }
        continue;
      }

      if (msg.role === "tool") {
        const toolName = (msg.toolCallId && toolCallNameById.get(msg.toolCallId)) || "tool_result";
        let responseObj: Record<string, unknown>;
        try {
          responseObj = typeof msg.content === "string" ? JSON.parse(msg.content) : (msg.content ?? {});
        } catch {
          responseObj = { result: msg.content };
        }
        if (typeof responseObj !== "object" || responseObj === null || Array.isArray(responseObj)) {
          responseObj = { output: responseObj };
        }
        const fnResponsePart: Record<string, unknown> = {
          functionResponse: {
            name: toolName,
            response: responseObj,
          },
        };

        // If the preceding message in contents is already a user turn, merge this functionResponse into it
        // so multiple tool results for one turn are grouped into a single user message as expected by Gemini.
        const lastContent = contents[contents.length - 1];
        if (lastContent && lastContent.role === "user") {
          lastContent.parts.push(fnResponsePart);
        } else {
          contents.push({
            role: "user",
            parts: [fnResponsePart],
          });
        }
        continue;
      }

      // User role
      contents.push({
        role: "user",
        parts: [{ text: msg.content ?? "" }],
      });
    }

    const systemInstruction = systemParts.length > 0 ? systemParts.join("\n\n") : undefined;
    return { systemInstruction, contents };
  }

  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    const ai = this.getClient();
    const primaryModel = request.model ?? config.gemini.model ?? "gemini-2.5-flash";
    const fallbackModel = config.gemini.fallbackModel ?? "gemini-flash-lite-latest";
    const maxRetries = Math.max(0, config.gemini.maxRetries ?? 2);

    const { systemInstruction, contents } = this.buildContentsAndSystem(request.messages);

    const hasTools = Boolean(request.tools && request.tools.length > 0 && request.toolChoice !== "none");
    let functionDeclarations: GeminiFunctionDeclaration[] | undefined;
    if (hasTools && request.tools) {
      functionDeclarations = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: sanitizeToolParameters(t.inputSchema),
      }));
    }

    // Build ordered list of candidate models
    const rawModelsToTry = [
      primaryModel,
      fallbackModel,
      "gemini-flash-lite-latest",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
    ].filter((m, i, arr) => arr.indexOf(m) === i && Boolean(m) && !permanentlyUnavailableModels.has(m));

    // Exclude models whose daily quota is temporarily exhausted
    const unexhausted = rawModelsToTry.filter((m) => {
      const expiresAt = quotaExhaustedModels.get(m);
      return !expiresAt || Date.now() >= expiresAt;
    });

    const modelsToTry = unexhausted.length > 0 ? unexhausted : [rawModelsToTry[rawModelsToTry.length - 1]];

    let lastError: unknown;
    const requestId = request.requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const conversationId = request.conversationId;
    let totalAttempts = 0;
    const fallbackReasons: string[] = [];

    for (let modelIdx = 0; modelIdx < modelsToTry.length; modelIdx += 1) {
      const currentModel = modelsToTry[modelIdx];
      const nextCandidate = modelsToTry[modelIdx + 1];

      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        totalAttempts += 1;
        const isFallback = (currentModel !== primaryModel) || fallbackReasons.length > 0;
        const startTime = Date.now();
        const timeoutMs = request.timeoutMs ?? config.gemini.timeoutMs;
        const abortController = new AbortController();
        const timer = setTimeout(() => abortController.abort(), timeoutMs);

        if (isFallback) {
          logLLMEvent("Fallback attempt started", {
            requestId,
            conversationId,
            provider: "gemini",
            model: currentModel,
            attempt: totalAttempts,
            isFallback: true,
            reason: fallbackReasons[fallbackReasons.length - 1] || "MODEL_FALLBACK",
          });
        } else {
          logLLMEvent("Turn started", {
            requestId,
            conversationId,
            provider: "gemini",
            model: currentModel,
            attempt: totalAttempts,
            isFallback: false,
          });
        }

        try {
          const generateConfig: Record<string, unknown> = {
            temperature: request.temperature ?? config.gemini.temperature,
            maxOutputTokens: Math.max(request.maxOutputTokens ?? 1500, 2048),
          };

          // Attach thinkingBudget: 0 only on models that support it
          if (isThinkingSupported(currentModel)) {
            (generateConfig as any).thinkingConfig = { thinkingBudget: 0 };
          }

          if (systemInstruction) {
            generateConfig.systemInstruction = systemInstruction;
          }

          if (hasTools && functionDeclarations) {
            generateConfig.tools = [{ functionDeclarations }];
          } else if (request.responseFormat !== "text") {
            // When tools are not declared, enforce JSON response MIME type unless plain text was requested
            generateConfig.responseMimeType = "application/json";
          }

          console.log(`[GeminiLLMProvider] Request dispatch: model=${currentModel}, attempt=${attempt + 1}, toolsCount=${functionDeclarations?.length ?? 0}, thinkingBudget=${(generateConfig as any).thinkingConfig?.thinkingBudget ?? 'none'}`);

          const response = await ai.models.generateContent({
            model: currentModel,
            contents,
            config: generateConfig,
          });

          clearTimeout(timer);
          const durationMs = Date.now() - startTime;

          // Process tool calls if any from candidate parts (preserving thoughtSignature)
          const toolCalls: LLMToolCall[] = [];
          const candidateParts = (response.candidates?.[0]?.content?.parts as Array<Record<string, any>>) || [];

          let idx = 0;
          for (const part of candidateParts) {
            if (part.functionCall) {
              const callId = part.functionCall.id || `call_${Date.now()}_${idx++}`;
              const toolCall: LLMToolCall = {
                id: callId,
                name: part.functionCall.name ?? "unknown_tool",
                arguments: typeof part.functionCall.args === "string"
                  ? part.functionCall.args
                  : JSON.stringify(part.functionCall.args ?? {}),
              };
              const sig = part.thoughtSignature || part.thought_signature;
              if (sig) {
                toolCall.thoughtSignature = sig;
                thoughtSignatureByCallId.set(callId, sig);
                thoughtSignatureByName.set(toolCall.name, sig);
              }
              toolCalls.push(toolCall);
            }
          }

          // Fallback check on response.functionCalls if parts didn't provide them
          if (toolCalls.length === 0 && response.functionCalls && Array.isArray(response.functionCalls) && response.functionCalls.length > 0) {
            for (let i = 0; i < response.functionCalls.length; i += 1) {
              const fc = response.functionCalls[i];
              const callId = `call_${Date.now()}_${i}`;
              toolCalls.push({
                id: callId,
                name: fc.name ?? "unknown_tool",
                arguments: typeof fc.args === "string" ? fc.args : JSON.stringify(fc.args ?? {}),
              });
            }
          }

          // Process text content safely from parts directly to avoid the SDK's internal
          // console.warn("there are non-text parts functionCall in the response...")
          let contentText = "";
          const textParts = candidateParts
            .filter((p) => typeof p.text === "string" && !p.thought)
            .map((p) => p.text as string);

          if (textParts.length > 0) {
            contentText = textParts.join("\n").trim();
          } else if (toolCalls.length === 0) {
            // Only query response.text if candidateParts had no text parts AND no function calls
            try {
              contentText = (response.text ?? "").trim();
            } catch {
              // Ignore getter errors
            }
          }

          if (contentText) {
            contentText = contentText.trim();
            if (contentText.startsWith("```")) {
              contentText = contentText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
            }
            // If model returned conversational prose without JSON braces, wrap it into a valid decision JSON (unless text was explicitly requested)
            if (toolCalls.length === 0 && request.responseFormat !== "text") {
              const proseLang = detectConversationLanguage(contentText);
              if (!contentText.startsWith("{")) {
                contentText = JSON.stringify({
                  intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
                  language: { detected: proseLang, responseLanguage: proseLang },
                  decision: { type: "respond" },
                  toolCalls: [],
                  responseDraft: contentText,
                });
              } else if (!contentText.endsWith("}")) {
                // Partial JSON starting with '{' but truncated
                const draftMatch = contentText.match(/"responseDraft"\s*:\s*"((?:[^"\\]|\\.)*)"?/);
                const questionMatch = contentText.match(/"question"\s*:\s*"((?:[^"\\]|\\.)*)"?/);
                const cleanDraft = (draftMatch && draftMatch[1])
                  ? draftMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"')
                  : (questionMatch && questionMatch[1])
                  ? questionMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"')
                  : "";
                contentText = JSON.stringify({
                  intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
                  language: { detected: proseLang, responseLanguage: proseLang },
                  decision: { type: "respond" },
                  toolCalls: [],
                  responseDraft: cleanDraft || undefined,
                });
              }
            }
          }

          const usageMetadata = response.usageMetadata;
          const usage = usageMetadata ? {
            inputTokens: usageMetadata.promptTokenCount,
            outputTokens: usageMetadata.candidatesTokenCount,
          } : undefined;

          console.log(`[GeminiLLMProvider] Request success: model=${currentModel}, durationMs=${durationMs}, toolCalls=${toolCalls.length}, hasContent=${Boolean(contentText)}`);

          const responseType: "text" | "function_call" | "mixed" | "structured" =
            toolCalls.length > 0 && contentText
              ? "mixed"
              : toolCalls.length > 0
              ? "function_call"
              : "structured";

          logLLMEvent("Provider response received", {
            requestId,
            conversationId,
            provider: "gemini",
            model: currentModel,
            attempt: totalAttempts,
            isFallback,
            responseType,
            toolCallCount: toolCalls.length,
            latencyMs: durationMs,
          });

          return {
            content: contentText || undefined,
            toolCalls,
            usage,
            model: currentModel,
            provider: "gemini",
            attemptCount: totalAttempts,
            fallbackUsed: isFallback,
            fallbackReasons: Array.from(new Set(fallbackReasons)),
            latencyMs: durationMs,
          };
        } catch (error: any) {
          clearTimeout(timer);
          lastError = error;

          const durationMs = Date.now() - startTime;
          const errMsg = String(error?.message ?? "");
          const status = error?.status ?? (errMsg.includes("400") ? 400 : errMsg.includes("404") ? 404 : errMsg.includes("429") ? 429 : errMsg.includes("503") ? 503 : 500);

          // Error classification
          const isTimeout = error?.name === "AbortError" || errMsg.includes("aborted") || errMsg.includes("ETIMEDOUT");
          const isAuthError = status === 401 || status === 403 || errMsg.includes("API_KEY_INVALID") || errMsg.includes("PERMISSION_DENIED");
          const isRateLimit = status === 429 || errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("Quota exceeded");
          const isDailyQuota = isRateLimit && (errMsg.includes("per day") || errMsg.includes("PerDay") || errMsg.includes("limit: 20") || errMsg.includes("free_tier_requests"));
          const isHighDemand = status === 503 || errMsg.includes("503") || errMsg.includes("high demand") || errMsg.includes("UNAVAILABLE");
          const isNotFound = status === 404 || errMsg.includes("404") || errMsg.includes("not found") || errMsg.includes("no longer available");
          const isInvalidArgument = status === 400 || errMsg.includes("400") || errMsg.includes("INVALID_ARGUMENT");

          const reason = isDailyQuota
            ? "QUOTA_EXCEEDED"
            : isRateLimit
            ? "RATE_LIMIT"
            : isHighDemand
            ? "MODEL_UNAVAILABLE"
            : isNotFound
            ? "MODEL_UNAVAILABLE"
            : isInvalidArgument
            ? "INVALID_ARGUMENT"
            : isTimeout
            ? "TIMEOUT"
            : isAuthError
            ? "AUTH_ERROR"
            : "NETWORK_ERROR";

          fallbackReasons.push(reason);

          if (currentModel === primaryModel) {
            logLLMEvent("Primary model failed", {
              requestId,
              conversationId,
              provider: "gemini",
              model: currentModel,
              attempt: totalAttempts,
              outcome: "provider_error",
              errorCode: reason,
              latencyMs: durationMs,
            });
          } else {
            logLLMEvent("Model attempt failed", {
              requestId,
              conversationId,
              provider: "gemini",
              model: currentModel,
              attempt: totalAttempts,
              outcome: "provider_error",
              errorCode: reason,
              latencyMs: durationMs,
            });
          }

          console.warn(`[GeminiLLMProvider] Error encountered: model=${currentModel}, attempt=${attempt + 1}, status=${status}, durationMs=${durationMs}, category=${reason}`);

          // 1. Permanent Authentication Failure: do not retry or fallback endlessly
          if (isAuthError) {
            throw new LLMError("PROVIDER_UNAVAILABLE", "Gemini API key is invalid or unauthorized");
          }

          // 2. Daily Quota Exceeded: mark model exhausted for 30 minutes, immediately fallback
          if (isDailyQuota) {
            quotaExhaustedModels.set(currentModel, Date.now() + 30 * 60 * 1000);
            console.warn(`[GeminiLLMProvider] Daily quota exceeded on ${currentModel}. Immediately falling back to next model (${nextCandidate || 'none'})...`);
            break;
          }

          // 3. High Demand (503): immediately fallback to next eligible model if one exists
          if (isHighDemand && nextCandidate) {
            console.warn(`[GeminiLLMProvider] High demand (503) on ${currentModel}. Falling back to next model (${nextCandidate})...`);
            break;
          }

          // 4. Model Deprecated / Not Found (404): permanently mark unavailable and fallback immediately
          if (isNotFound) {
            permanentlyUnavailableModels.add(currentModel);
            console.warn(`[GeminiLLMProvider] Model ${currentModel} is unavailable/deprecated (404). Falling back to next model (${nextCandidate || 'none'})...`);
            break;
          }

          // 5. Invalid Argument (400):
          if (isInvalidArgument) {
            // If thinkingConfig was enabled on this attempt, retry immediately once without thinkingConfig
            if (isThinkingSupported(currentModel)) {
              console.warn(`[GeminiLLMProvider] Model ${currentModel} returned 400 with thinkingConfig. Retrying immediately without thinkingConfig...`);
              // Force disable thinking for this model
              permanentlyUnavailableModels.add(`${currentModel}:thinking`);
              continue;
            }
            // Do NOT blindly retry identical invalid argument payload; fall back immediately
            console.warn(`[GeminiLLMProvider] Permanent request configuration mismatch (400) on ${currentModel}. Falling back to next model (${nextCandidate || 'none'})...`);
            break;
          }

          // 6. Timeout: bounded retry, then fallback
          if (isTimeout) {
            if (attempt < maxRetries) {
              console.warn(`[GeminiLLMProvider] Request timeout on ${currentModel}. Retrying (attempt ${attempt + 1}/${maxRetries})...`);
              continue;
            }
            if (nextCandidate) {
              console.warn(`[GeminiLLMProvider] Retries exhausted after timeout on ${currentModel}. Falling back to next model (${nextCandidate})...`);
              break;
            }
            throw new LLMError("TIMEOUT", `Gemini request timed out on model ${currentModel}`);
          }

          // 7. Rate Limit (transient 429): exponential backoff with jitter
          if (isRateLimit) {
            if (attempt < maxRetries) {
              const backoff = Math.min(1500 * Math.pow(2, attempt) + Math.random() * 500, 10000);
              console.warn(`[GeminiLLMProvider] Rate limit (429) on ${currentModel}. Retrying in ${Math.round(backoff)}ms (attempt ${attempt + 1}/${maxRetries})...`);
              await new Promise((resolve) => setTimeout(resolve, backoff));
              continue;
            }
            if (nextCandidate) {
              console.warn(`[GeminiLLMProvider] Retries exhausted for rate limit on ${currentModel}. Falling back to next model (${nextCandidate})...`);
              break;
            }
            throw new LLMError("RATE_LIMITED", "Gemini API rate limit exceeded");
          }

          // 8. Server error (500 / 503): transient retry with backoff, then fallback
          if (attempt < maxRetries) {
            const backoff = 1000 * Math.pow(2, attempt);
            console.warn(`[GeminiLLMProvider] Transient server error on ${currentModel}: ${errMsg.slice(0, 150)}. Retrying in ${backoff}ms...`);
            await new Promise((resolve) => setTimeout(resolve, backoff));
            continue;
          }

          console.warn(`[GeminiLLMProvider] Retries exhausted on ${currentModel}. Falling back to next model (${nextCandidate || 'none'})...`);
          break;
        }
      }
    }

    // Secondary fallback to Groq if configured
    if (config.llm.apiKey && config.llm.baseUrl && config.llm.model) {
      try {
        logLLMEvent("Fallback attempt started", {
          requestId,
          conversationId,
          provider: "groq",
          model: config.llm.model,
          attempt: totalAttempts + 1,
          isFallback: true,
          reason: "ALL_GEMINI_EXHAUSTED",
        });
        console.warn(`[GeminiLLMProvider] All Gemini models exhausted or unavailable. Seamlessly delegating to Groq fallback...`);
        const groq = new HttpLLMProvider();
        const groqRes = await groq.generateResponse({
          ...request,
          requestId,
          conversationId,
        });
        return {
          ...groqRes,
          attemptCount: totalAttempts + (groqRes.attemptCount || 1),
          fallbackUsed: true,
          fallbackReasons: Array.from(new Set([...fallbackReasons, "MODEL_UNAVAILABLE"])),
        };
      } catch (groqErr) {
        logLLMEvent("Model attempt failed", {
          requestId,
          conversationId,
          provider: "groq",
          model: config.llm.model,
          attempt: totalAttempts + 1,
          outcome: "provider_error",
          errorCode: "PROVIDER_UNAVAILABLE",
        });
        console.error(`[GeminiLLMProvider] Groq fallback also failed:`, groqErr);
      }
    }

    if (lastError instanceof LLMError) {
      throw lastError;
    }
    throw new LLMError("PROVIDER_UNAVAILABLE", `Gemini request failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }

  async healthCheck(): Promise<{ available: boolean; provider: string }> {
    const hasKey = Boolean(config.gemini.apiKey);
    return {
      available: hasKey,
      provider: "gemini",
    };
  }
}
