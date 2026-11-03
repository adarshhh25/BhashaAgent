import { config } from "../../config/environment";
import { LLMError } from "./llm.errors";
import type { LLMMessage, LLMProvider, LLMRequest, LLMResponse } from "./llm.types";

interface GroqToolCall {
  id?: unknown;
  function?: { name?: unknown; arguments?: unknown };
}

function normalizeMessages(messages: LLMMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    ...(message.toolCalls ? {
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      })),
    } : {}),
  }));
}

function parseResponse(payload: unknown): LLMResponse {
  if (!payload || typeof payload !== "object") {
    throw new LLMError("INVALID_RESPONSE", "Provider returned an invalid response");
  }
  const record = payload as Record<string, unknown>;
  const choices = record.choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
    throw new LLMError("INVALID_RESPONSE", "Provider returned no assistant choice");
  }
  const message = (choices[0] as Record<string, unknown>).message;
  if (!message || typeof message !== "object") {
    throw new LLMError("INVALID_RESPONSE", "Provider returned no assistant message");
  }
  const assistant = message as Record<string, unknown>;
  const rawToolCalls = Array.isArray(assistant.tool_calls) ? assistant.tool_calls as GroqToolCall[] : [];
  const toolCalls = rawToolCalls.map((call) => {
    if (typeof call.id !== "string" || !call.function || typeof call.function.name !== "string" || typeof call.function.arguments !== "string") {
      throw new LLMError("INVALID_RESPONSE", "Provider returned an invalid tool call");
    }
    return { id: call.id, name: call.function.name, arguments: call.function.arguments };
  });
  const usage = record.usage && typeof record.usage === "object" ? record.usage as Record<string, unknown> : undefined;
  return {
    content: typeof assistant.content === "string" ? assistant.content : undefined,
    toolCalls,
    usage: usage ? {
      inputTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
      outputTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined,
    } : undefined,
  };
}

export class HttpLLMProvider implements LLMProvider {
  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    if (config.llm.provider !== "groq" || !config.llm.apiKey || !config.llm.baseUrl || !config.llm.model) {
      throw new LLMError("MISSING_CONFIGURATION", "Groq provider configuration is missing");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? config.llm.timeoutMs);
    try {
      const response = await fetch(config.llm.baseUrl, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.llm.apiKey}` },
        body: JSON.stringify({
          model: request.model ?? config.llm.model,
          messages: normalizeMessages(request.messages),
          tools: request.tools.map((tool) => ({
            type: "function",
            function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
          })),
          ...(request.tools.length > 0 ? { tool_choice: request.toolChoice ?? "auto" } : {}),
          temperature: request.temperature ?? config.llm.temperature,
          max_tokens: request.maxOutputTokens ?? config.llm.maxOutputTokens,
          ...(request.tools.length === 0 ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const status = response.status;
        if (status === 401 || status === 403) throw new LLMError("PROVIDER_UNAVAILABLE", "Groq authentication failed");
        if (status === 429) throw new LLMError("RATE_LIMITED", "Groq rate limit exceeded");
        throw new LLMError("PROVIDER_UNAVAILABLE", "Groq provider request failed");
      }
      return parseResponse(await response.json());
    } catch (error) {
      if (error instanceof LLMError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new LLMError("TIMEOUT", "Groq provider timed out");
      throw new LLMError("PROVIDER_UNAVAILABLE", "Groq provider is unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck() {
    return { available: config.llm.provider === "groq" && Boolean(config.llm.apiKey && config.llm.baseUrl && config.llm.model), provider: config.llm.provider };
  }
}
