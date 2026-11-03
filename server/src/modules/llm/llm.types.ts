export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LLMRequest {
  messages: LLMMessage[];
  tools: LLMToolDefinition[];
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  toolChoice?: "auto" | "none" | "required" | {
    type: "function";
    function: { name: string };
  };
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LLMResponse {
  content?: string;
  toolCalls: LLMToolCall[];
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface LLMProvider {
  generateResponse(request: LLMRequest): Promise<LLMResponse>;
  healthCheck(): Promise<{ available: boolean; provider: string }>;
}
