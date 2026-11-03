import type { AgentContext } from "../context/context.types";

export const agentIntents = [
  "GENERAL_QUESTION", "GREETING", "HELP_REQUEST", "START_FORM_TASK", "CONTINUE_FORM_TASK",
  "SELECT_FORM_TASK", "ASK_ABOUT_FORM_FIELD", "PROVIDE_FIELD_INFORMATION", "CORRECT_FIELD_INFORMATION",
  "REQUEST_PROFILE_INFORMATION", "USE_EXISTING_PROFILE_INFORMATION", "PROPOSE_PROFILE_MEMORY",
  "REQUEST_MEMORY_UPDATE", "REQUEST_MEMORY_DELETION", "REQUEST_FIELD_MAPPING", "REVIEW_FORM_INFORMATION",
  "AMBIGUOUS_INSTRUCTION", "UNKNOWN_INTENT",
] as const;
export type AgentIntent = typeof agentIntents[number];

export interface AgentLLMOutput {
  intent: { primary: AgentIntent; secondary: AgentIntent[]; confidence: number };
  language: { detected: string; responseLanguage: string };
  decision: { type: "respond" | "clarify" | "tool"; reason?: string };
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  clarification?: { required: boolean; question?: string };
  responseDraft?: string;
}

export interface AgentTurnResult {
  response: string;
  intent: AgentLLMOutput["intent"];
  decision: AgentLLMOutput["decision"];
  context: AgentContext;
  toolResults: Array<{ toolCallId: string; name: string; success: boolean; data?: unknown }>;
}
