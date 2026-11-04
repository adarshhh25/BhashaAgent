import { GoogleGenAI } from "@google/genai";
import { config } from "../../config/environment";
import { LLMError } from "./llm.errors";
import { HttpLLMProvider } from "./llm.provider";
import type { LLMMessage, LLMProvider, LLMRequest, LLMResponse, LLMToolCall } from "./llm.types";

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const quotaExhaustedModels = new Map<string, number>();
const thoughtSignatureByCallId = new Map<string, string>();
const thoughtSignatureByName = new Map<string, string>();

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
        contents.push({
          role: "user",
          parts: [{
            functionResponse: {
              name: toolName,
              response: responseObj,
            },
          }],
        });
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

    const hasTools = request.tools && request.tools.length > 0 && request.toolChoice !== "none";
    let functionDeclarations: GeminiFunctionDeclaration[] | undefined;
    if (hasTools) {
      functionDeclarations = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      }));
    }

    const rawModelsToTry = [
      primaryModel,
      "gemini-flash-lite-latest",
      "gemini-3.5-flash",
      fallbackModel,
    ].filter((m, i, arr) => arr.indexOf(m) === i && Boolean(m));

    const unexhausted = rawModelsToTry.filter((m) => {
      const expiresAt = quotaExhaustedModels.get(m);
      return !expiresAt || Date.now() >= expiresAt;
    });

    const modelsToTry = unexhausted.length > 0 ? unexhausted : [rawModelsToTry[rawModelsToTry.length - 1]];

    let lastError: unknown;

    for (const currentModel of modelsToTry) {
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          const timeoutMs = request.timeoutMs ?? config.gemini.timeoutMs;
          const abortController = new AbortController();
          const timer = setTimeout(() => abortController.abort(), timeoutMs);

          try {
            const generateConfig: Record<string, unknown> = {
              temperature: request.temperature ?? config.gemini.temperature,
              maxOutputTokens: request.maxOutputTokens ?? config.gemini.maxOutputTokens,
            };

            if (systemInstruction) {
              generateConfig.systemInstruction = systemInstruction;
            }

            if (hasTools && functionDeclarations) {
              generateConfig.tools = [{ functionDeclarations }];
            } else {
              // When tools are not declared, enforce JSON response MIME type
              generateConfig.responseMimeType = "application/json";
            }

            const response = await ai.models.generateContent({
              model: currentModel,
              contents,
              config: generateConfig,
            });

            clearTimeout(timer);

            // Process tool calls if any (check candidate parts for thoughtSignature preservation)
            const toolCalls: LLMToolCall[] = [];
            if (response.candidates?.[0]?.content?.parts) {
              let idx = 0;
              for (const part of response.candidates[0].content.parts as Array<Record<string, any>>) {
                if (part.functionCall) {
                  const callId = part.functionCall.id || `call_${Date.now()}_${idx++}`;
                  const toolCall: LLMToolCall = {
                    id: callId,
                    name: part.functionCall.name ?? "unknown_tool",
                    arguments: JSON.stringify(part.functionCall.args ?? {}),
                  };
                  if (part.thoughtSignature) {
                    toolCall.thoughtSignature = part.thoughtSignature;
                    thoughtSignatureByCallId.set(callId, part.thoughtSignature);
                    thoughtSignatureByName.set(toolCall.name, part.thoughtSignature);
                  }
                  toolCalls.push(toolCall);
                }
              }
            } else if (response.functionCalls && Array.isArray(response.functionCalls) && response.functionCalls.length > 0) {
              for (let i = 0; i < response.functionCalls.length; i += 1) {
                const fc = response.functionCalls[i];
                const callId = `call_${Date.now()}_${i}`;
                toolCalls.push({
                  id: callId,
                  name: fc.name ?? "unknown_tool",
                  arguments: JSON.stringify(fc.args ?? {}),
                });
              }
            }

            // Process text content safely without throwing if model returned only functionCalls
            let contentText = "";
            try {
              contentText = response.text ?? "";
            } catch {
              // Non-text parts exist; extract from parts
            }
            if (!contentText && response.candidates?.[0]?.content?.parts) {
              const textParts = (response.candidates[0].content.parts as Array<Record<string, any>>)
                .filter((p) => typeof p.text === "string" && !p.thought)
                .map((p) => p.text);
              if (textParts.length > 0) {
                contentText = textParts.join("\n").trim();
              }
            }
            if (contentText) {
              contentText = contentText.trim();
              if (contentText.startsWith("```")) {
                contentText = contentText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
              }
              // If model returned conversational prose without JSON braces, wrap it into a valid decision JSON
              if (toolCalls.length === 0 && (!contentText.startsWith("{") || !contentText.endsWith("}"))) {
                contentText = JSON.stringify({
                  intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
                  language: { detected: "en", responseLanguage: "en" },
                  decision: { type: "respond" },
                  toolCalls: [],
                  responseDraft: contentText,
                });
              }
            }

            const usageMetadata = response.usageMetadata;
            const usage = usageMetadata ? {
              inputTokens: usageMetadata.promptTokenCount,
              outputTokens: usageMetadata.candidatesTokenCount,
            } : undefined;

            return {
              content: contentText || undefined,
              toolCalls,
              usage,
            };
          } catch (innerErr) {
            clearTimeout(timer);
            throw innerErr;
          }
        } catch (error: any) {
          lastError = error;

          // Check for timeout
          if (error?.name === "AbortError" || error?.message?.includes("aborted")) {
            if (attempt < maxRetries) {
              continue;
            }
            throw new LLMError("TIMEOUT", `Gemini request timed out on model ${currentModel}`);
          }

          const errMsg = String(error?.message ?? "");
          const isRateLimit = error?.status === 429 || errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("Quota exceeded");
          const isDailyQuota = isRateLimit && (errMsg.includes("per day") || errMsg.includes("PerDay") || errMsg.includes("limit: 20") || errMsg.includes("free_tier_requests"));
          const isHighDemand = error?.status === 503 || errMsg.includes("503") || errMsg.includes("high demand") || errMsg.includes("UNAVAILABLE");
          const isAuthError = error?.status === 401 || error?.status === 403 || errMsg.includes("API_KEY_INVALID");

          if (isDailyQuota) {
            quotaExhaustedModels.set(currentModel, Date.now() + 30 * 60 * 1000);
            if (modelsToTry.length > 1) {
              console.warn(`[GeminiLLMProvider] Daily quota exceeded on ${currentModel}. Immediately falling back to next model...`);
              break;
            }
          }

          if (isHighDemand && modelsToTry.indexOf(currentModel) < modelsToTry.length - 1) {
            console.warn(`[GeminiLLMProvider] High demand (503) on ${currentModel}. Immediately falling back to next model...`);
            break;
          }

          if (isRateLimit) {
            if (attempt < maxRetries) {
              // Exponential backoff with jitter
              const backoff = Math.min(1500 * Math.pow(2, attempt) + Math.random() * 500, 10000);
              console.warn(`[GeminiLLMProvider] Rate limit (429) on ${currentModel}. Retrying in ${Math.round(backoff)}ms (attempt ${attempt + 1}/${maxRetries})...`);
              await new Promise((resolve) => setTimeout(resolve, backoff));
              continue;
            }
            // If primary model hit rate limit and we have a fallback, break inner loop to try fallback
            if (modelsToTry.indexOf(currentModel) < modelsToTry.length - 1) {
              console.warn(`[GeminiLLMProvider] Exhausted retries on ${currentModel}. Falling back to next model...`);
              break;
            }
            throw new LLMError("RATE_LIMITED", "Gemini API rate limit exceeded");
          }

          if (isAuthError) {
            throw new LLMError("PROVIDER_UNAVAILABLE", "Gemini API key is invalid or unauthorized");
          }

          // Other transient errors (500, 503)
          if (attempt < maxRetries) {
            const backoff = 1000 * Math.pow(2, attempt);
            console.warn(`[GeminiLLMProvider] Transient error on ${currentModel}: ${errMsg.slice(0, 150)}. Retrying in ${backoff}ms...`);
            await new Promise((resolve) => setTimeout(resolve, backoff));
            continue;
          }

          // Break to try next model in modelsToTry
          console.warn(`[GeminiLLMProvider] Error on ${currentModel}: ${errMsg.slice(0, 200)}. Trying fallback...`);
          break;
        }
      }
    }

    if (config.llm.apiKey && config.llm.baseUrl && config.llm.model) {
      try {
        console.warn(`[GeminiLLMProvider] Gemini models exhausted or unavailable. Seamlessly delegating to Groq fallback...`);
        const groq = new HttpLLMProvider();
        return await groq.generateResponse(request);
      } catch (groqErr) {
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
