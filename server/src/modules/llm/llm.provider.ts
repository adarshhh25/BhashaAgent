import { config } from "../../config/environment";
import { LLMError } from "./llm.errors";
import type { LLMMessage, LLMProvider, LLMRequest, LLMResponse } from "./llm.types";
import { sanitizeToolParameters } from "./gemini.provider";
import { detectConversationLanguage } from "../agent/language-detector";

function normalizeMessages(messages: LLMMessage[]): LLMMessage[] {
  return messages.map((m) => {
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: m.content ?? "",
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    if (m.role === "tool") {
      return { role: "tool", content: m.content, tool_call_id: m.toolCallId };
    }
    return { role: m.role, content: m.content };
  });
}

function parseResponse(raw: unknown): LLMResponse {
  if (!raw || typeof raw !== "object") throw new LLMError("INVALID_RESPONSE", "Provider returned invalid response format");
  const record = raw as Record<string, unknown>;
  const choices = record.choices;
  if (!Array.isArray(choices) || choices.length === 0) throw new LLMError("INVALID_RESPONSE", "Provider response contains no choices");
  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object") throw new LLMError("INVALID_RESPONSE", "Invalid choice structure");
  const assistant = (firstChoice as Record<string, unknown>).message as Record<string, unknown> | undefined;
  if (!assistant || typeof assistant !== "object") throw new LLMError("INVALID_RESPONSE", "Missing message in choice");
  const rawToolCalls = assistant.tool_calls;
  if (rawToolCalls !== undefined && !Array.isArray(rawToolCalls)) {
    throw new LLMError("INVALID_RESPONSE", "Invalid tool_calls structure");
  }
  if (!rawToolCalls) {
    const content = assistant.content;
    if (typeof content !== "string" && content !== null && content !== undefined) {
      throw new LLMError("INVALID_RESPONSE", "Invalid assistant content");
    }
    const usage = record.usage && typeof record.usage === "object" ? record.usage as Record<string, unknown> : undefined;
    return {
      content: typeof content === "string" ? content : undefined,
      toolCalls: [],
      usage: usage ? {
        inputTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
        outputTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined,
      } : undefined,
    };
  }
  const toolCalls = (rawToolCalls as Array<Record<string, unknown>>).map((call) => {
    if (typeof call.id !== "string" || !call.function || typeof (call.function as Record<string, unknown>).name !== "string" || typeof (call.function as Record<string, unknown>).arguments !== "string") {
      throw new LLMError("INVALID_RESPONSE", "Provider returned an invalid tool call");
    }
    return { id: call.id, name: (call.function as Record<string, unknown>).name as string, arguments: (call.function as Record<string, unknown>).arguments as string };
  });
  const usage = record.usage && typeof record.usage === "object" ? record.usage as Record<string, unknown> : undefined;
  return {
    content: typeof assistant.content === "string" ? assistant.content as string : undefined,
    toolCalls,
    usage: usage ? {
      inputTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
      outputTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined,
    } : undefined,
  };
}

export class HttpLLMProvider implements LLMProvider {
  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    if (!config.llm.apiKey || !config.llm.baseUrl || !config.llm.model) {
      throw new LLMError("MISSING_CONFIGURATION", "Groq provider configuration is missing");
    }

    const maxRetries = Math.max(0, config.llm.maxRetries ?? 2);

    if (request.signal?.aborted) {
      throw new LLMError("REQUEST_CANCELLED", "Turn was cancelled before dispatch");
    }

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (request.signal?.aborted) {
        throw new LLMError("REQUEST_CANCELLED", "Turn was cancelled by client");
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? config.llm.timeoutMs);
      const onAbort = () => controller.abort();
      if (request.signal) {
        request.signal.addEventListener("abort", onAbort, { once: true });
      }

      try {
        const hasTools = Boolean(request.tools && request.tools.length > 0);
        const wantsJson = Boolean(
          !hasTools && request.responseFormat === "json"
        );

        const normalized = normalizeMessages(request.messages);
        if (wantsJson) {
          const mentionsJson = normalized.some((m) => String(m.content).toLowerCase().includes("json"));
          if (!mentionsJson) {
            normalized.unshift({ role: "system", content: "You are a helpful assistant. Return valid JSON." });
          }
        }

        const requestBody: Record<string, unknown> = {
          model: request.model ?? config.llm.model,
          messages: normalized,
          temperature: request.temperature ?? config.llm.temperature,
          max_tokens: request.maxOutputTokens ?? config.llm.maxOutputTokens,
        };

        if (hasTools) {
          requestBody.tools = request.tools.map((tool) => ({
            type: "function",
            function: { name: tool.name, description: tool.description, parameters: sanitizeToolParameters(tool.inputSchema) },
          }));
          requestBody.tool_choice = request.toolChoice ?? "auto";
        } else if (wantsJson) {
          requestBody.response_format = { type: "json_object" };
        }

        const response = await fetch(config.llm.baseUrl, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${config.llm.apiKey}` },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeout);
        if (request.signal) {
          request.signal.removeEventListener("abort", onAbort);
        }

        if (!response.ok) {
          const status = response.status;
          if (status === 401 || status === 403) throw new LLMError("PROVIDER_UNAVAILABLE", "Groq authentication failed");

          if (status === 429) {
            let retrySec = Number.NaN;
            const retryAfterHeader = response.headers.get("retry-after");
            if (retryAfterHeader) {
              retrySec = Number.parseFloat(retryAfterHeader);
            }
            let errorText = "";
            try {
              errorText = await response.text();
            } catch {}
            if (!Number.isFinite(retrySec) && errorText) {
              const match = errorText.match(/try again in ([\d\.]+)s/i);
              if (match) retrySec = Number.parseFloat(match[1]);
            }
            const max429Retries = Math.max(maxRetries, 4);
            if (attempt < max429Retries) {
              const waitMs = Number.isFinite(retrySec) && retrySec > 0
                ? Math.min(Math.ceil(retrySec * 1000) + 600, 15000)
                : Math.min(2000 * Math.pow(2, attempt), 8000);
              console.warn(`[HttpLLMProvider] Rate limited (429), retrying in ${waitMs}ms (attempt ${attempt + 1}/${max429Retries})...`);
              await new Promise((resolve) => setTimeout(resolve, waitMs));
              continue;
            }
            throw new LLMError("RATE_LIMITED", "Groq rate limit exceeded");
          }

          if (status >= 500 && status < 600 && attempt < maxRetries) {
            const waitMs = Math.min(1000 * Math.pow(2, attempt), 3000);
            console.warn(`[HttpLLMProvider] Provider error (${status}), retrying in ${waitMs}ms...`);
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            continue;
          }

          throw new LLMError("PROVIDER_UNAVAILABLE", "Groq provider request failed");
        }

        const data = await response.json();
        const parsed = parseResponse(data);
        let contentText = parsed.content;
        if (parsed.toolCalls.length === 0 && request.responseFormat !== "text" && contentText) {
          contentText = contentText.trim();
          if (contentText.startsWith("```")) {
            contentText = contentText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
          }
          if (!contentText.startsWith("{")) {
            const proseLang = detectConversationLanguage(contentText);
            contentText = JSON.stringify({
              intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
              language: { detected: proseLang, responseLanguage: proseLang },
              decision: { type: "respond" },
              toolCalls: [],
              responseDraft: contentText,
            });
          }
        }
        return {
          ...parsed,
          content: contentText,
          model: request.model ?? config.llm.model,
          provider: "groq",
          attemptCount: attempt + 1,
          fallbackUsed: true,
        };
      } catch (error) {
        clearTimeout(timeout);
        if (request.signal) {
          request.signal.removeEventListener("abort", onAbort);
        }
        if (request.signal?.aborted) {
          throw new LLMError("REQUEST_CANCELLED", "Turn was cancelled by client");
        }
        if (error instanceof LLMError) throw error;
        if (error instanceof Error && error.name === "AbortError") throw new LLMError("TIMEOUT", "Groq provider timed out");
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        throw new LLMError("PROVIDER_UNAVAILABLE", "Groq provider is unavailable");
      } finally {
        clearTimeout(timeout);
        if (request.signal) {
          request.signal.removeEventListener("abort", onAbort);
        }
      }
    }

    throw new LLMError("PROVIDER_UNAVAILABLE", "Groq provider request failed");
  }

  async healthCheck() {
    return { available: config.llm.provider === "groq" && Boolean(config.llm.apiKey && config.llm.baseUrl && config.llm.model), provider: config.llm.provider };
  }
}
